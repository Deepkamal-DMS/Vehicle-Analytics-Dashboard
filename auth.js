/* ============================================================
   AUTH - shared by login.html and the dashboard (script.js).

   One shared admin credential, not individual accounts - see
   supabase/functions/import-workbook/index.ts's own header for
   why that is fine here. This file only holds the client-side
   half: where it lives (sessionStorage, not localStorage - a
   closed tab should not leave it sitting around) and how to ask
   the server if it's right. requireAuth() on the other end is
   the only place that actually knows.
   ============================================================ */

/*
 * One switch for which backend the whole dashboard talks to - every
 * other file reads its URL/key out of BACKENDS[BACKEND] below rather
 * than hard-coding one, so moving between them is this one line, not
 * a find-and-replace across script.js and auth.js both.
 *
 *   "cloud"  Supabase - ytgoonducepylslknkag, same project this
 *            dashboard has always used. No login service of its own
 *            to run; import-workbook is already deployed there.
 *
 *   "local"  This repo's own docker-compose Postgres + PostgREST
 *            (see docker-compose.yml) for reads, and
 *            local/server/server.js for login + Import - a plain
 *            Node process that speaks the exact same HTTP contract
 *            import-workbook does, reusing its parsing/validation
 *            code verbatim and writing through the same
 *            import_maker_month()/import_rto_month() functions
 *            (copied into local/init/15-import-functions.sql).
 *
 * localhost here assumes the browser and the local stack are on the
 * same machine - once this runs on an actual server for other
 * devices on the network to reach, swap it for that server's own LAN
 * address (e.g. http://192.168.1.50:3004).
 */
const BACKEND = "local";

const BACKENDS = {
    cloud: {
        apiUrl: "https://ytgoonducepylslknkag.supabase.co/rest/v1",
        apiKey: "sb_publishable_9IVGzYTxQDj2UoLOaBtkFw_7H5ILVGY",
        importFunctionUrl: "https://ytgoonducepylslknkag.supabase.co/functions/v1/import-workbook"
    },
    local: {
        apiUrl: "http://localhost:3004",
        apiKey: null,
        importFunctionUrl: "http://localhost:3005/import-workbook"
    }
};

const IMPORT_FUNCTION_URL = BACKENDS[BACKEND].importFunctionUrl;

const AUTH_STORAGE_KEY = "vad_import_auth";
const LOGIN_NOTICE_KEY = "vad_login_notice";

/*
 * Neither backend keeps a server-side session to expire - Basic auth
 * is checked fresh on every request, same username/password sent
 * every time (see postToImportFunction()). "Ask for login every
 * hour" is therefore enforced here, client-side: the credential this
 * tab remembers is simply discarded once an hour has passed since it
 * was entered, the same way it already is on Log Out.
 */
const SESSION_DURATION_MS = 60 * 60 * 1000;

/*
 * profile is whatever verifyCredentials() got back alongside the
 * credential - name/dealership/canManageUsers on the local backend,
 * a synthesized stand-in on cloud (see verifyCredentials() for why).
 * Never trusted for anything security-sensitive on its own: every
 * request still carries user/pass, and the server re-checks
 * canManageUsers itself on every mode=create-account/list-accounts
 * call rather than taking this copy's word for it.
 *
 * loginAt is when THIS credential was entered, not when the tab was
 * last active - see SESSION_DURATION_MS above.
 */
const auth = { user: null, pass: null, profile: null, loginAt: null };

let sessionExpiryTimer = null;


function loadStoredAuth() {

    let raw;

    try {
        raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    } catch {
        return;
    }

    if (!raw) {
        return;
    }

    try {

        const parsed = JSON.parse(raw);

        auth.user = parsed.user || null;
        auth.pass = parsed.pass || null;
        auth.profile = parsed.profile || null;
        auth.loginAt = parsed.loginAt || null;

    } catch {
        /* Corrupt entry - treat as logged out rather than throwing. */
    }
}


function saveAuth(user, pass, profile = null) {

    auth.user = user;
    auth.pass = pass;
    auth.profile = profile;
    auth.loginAt = Date.now();

    try {

        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
            user, pass, profile, loginAt: auth.loginAt
        }));

    } catch {
        /* Private browsing, storage full, etc. - the login still
           works for this page load, it just will not survive a
           refresh. Not worth surfacing to the user. */
    }
}


function clearAuth() {

    auth.user = null;
    auth.pass = null;
    auth.profile = null;
    auth.loginAt = null;

    if (sessionExpiryTimer !== null) {
        clearTimeout(sessionExpiryTimer);
        sessionExpiryTimer = null;
    }

    try {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
        /* Nothing to do if storage is unavailable. */
    }
}


function isSessionExpired() {
    return auth.loginAt !== null && Date.now() - auth.loginAt >= SESSION_DURATION_MS;
}


/*
 * Expired counts as logged out, not just "will be treated as logged
 * out next time something checks the server" - so this clears the
 * stale credential itself rather than leaving that to whatever
 * happens to run next.
 */
function isLoggedIn() {

    if (!auth.user) {
        return false;
    }

    if (isSessionExpired()) {
        clearAuth();
        return false;
    }

    return true;
}


/*
 * The part isLoggedIn() alone cannot do: a reader sitting on the
 * dashboard for the full hour without reloading or triggering a
 * request would otherwise never actually get sent back to login.html
 * until they did one of those. Called once per page, after
 * confirming a session exists - see bootstrapApp()/bootstrapProfile().
 */
function scheduleSessionExpiry() {

    if (sessionExpiryTimer !== null) {
        clearTimeout(sessionExpiryTimer);
        sessionExpiryTimer = null;
    }

    if (auth.loginAt === null) {
        return;
    }

    const remaining = SESSION_DURATION_MS - (Date.now() - auth.loginAt);

    if (remaining <= 0) {
        goToLogin("Your session expired after 1 hour - please log in again.");
        return;
    }

    sessionExpiryTimer = setTimeout(() => {
        goToLogin("Your session expired after 1 hour - please log in again.");
    }, remaining);
}


/*
 * The one gate every protected page opens with. Distinguishes "never
 * logged in" (silent redirect - there's nothing to explain) from "was
 * logged in, but the hour ran out before this page load" (same notice
 * the live timer shows, so reload-triggered and idle-triggered expiry
 * read the same way). Returns whether the caller may continue.
 */
function requireSession() {

    const hadCredential = Boolean(auth.user);

    if (!isLoggedIn()) {

        if (hadCredential) {
            goToLogin("Your session expired after 1 hour - please log in again.");
        } else {
            location.href = "login.html";
        }

        return false;
    }

    scheduleSessionExpiry();

    return true;
}


/* Survives the redirect to login.html, so that page can say why
   it is showing rather than presenting a blank form. */
function setLoginNotice(message) {

    try {
        sessionStorage.setItem(LOGIN_NOTICE_KEY, message);
    } catch {
        /* Nothing to do if storage is unavailable - the redirect
           still happens, it just lands on a plain login screen. */
    }
}


function consumeLoginNotice() {

    let message = null;

    try {
        message = sessionStorage.getItem(LOGIN_NOTICE_KEY);
        sessionStorage.removeItem(LOGIN_NOTICE_KEY);
    } catch {
        /* Nothing stored, or storage unavailable - either way, no notice. */
    }

    return message;
}


/*
 * The one call that can actually confirm a username/password without
 * uploading anything - mode=ping short-circuits in import-workbook's
 * handle() right after requireAuth(), before any file is required.
 *
 * Returns the account's profile on success (false on a wrong
 * credential) - the local backend's ping includes one; the cloud
 * Edge Function does not (it still checks one shared admin
 * credential, not individual accounts), so a minimal stand-in is
 * synthesized there instead of profile-dependent UI (see script.js's
 * profile modal) breaking on that backend.
 */
async function verifyCredentials(user, pass) {

    const form = new FormData();
    form.append("mode", "ping");

    let response;

    try {

        response = await fetch(IMPORT_FUNCTION_URL, {
            method: "POST",
            headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}` },
            body: form
        });

    } catch (error) {
        throw new Error(`Could not reach the login service: ${error.message}`);
    }

    if (response.status === 401) {
        return false;
    }

    if (!response.ok) {
        throw new Error(`Login service returned an unexpected error (HTTP ${response.status}).`);
    }

    let body;

    try {
        body = await response.json();
    } catch {
        body = {};
    }

    return body.account || { username: user, name: user, dealership: "", canManageUsers: false };
}


/*
 * Clears the session and sends the browser to the login page - the
 * dashboard's own front door now, not a modal sitting in front of
 * it (see login.html). `message`, if given, survives the redirect
 * via sessionStorage and greets the user on arrival.
 */
function goToLogin(message) {

    clearAuth();

    if (message) {
        setLoginNotice(message);
    }

    location.href = "login.html";
}


/*
 * The actual request + the 401/parse/error handling every
 * import-workbook call shares - script.js's callImportFunction() (a
 * file upload) and callAccountFunction() below (mode=list-accounts/
 * create-account, no file) each just build their own form and hand
 * it here. Lives in this file, not script.js, because profile.html
 * needs callAccountFunction() too and never loads script.js.
 */
async function postToImportFunction(form) {

    const headers = {};

    if (isLoggedIn()) {
        headers.Authorization = `Basic ${btoa(`${auth.user}:${auth.pass}`)}`;
    }

    let response;

    try {

        response = await fetch(IMPORT_FUNCTION_URL, {
            method: "POST",
            headers,
            body: form
        });

    } catch (error) {
        throw new Error(`Could not reach the import service: ${error.message}`);
    }

    if (response.status === 401) {
        goToLogin("Your session ended - please log in again.");
        throw new Error("Your session ended - please log in again.");
    }

    let body;

    try {
        body = await response.json();
    } catch (error) {
        throw new Error(
            `Import service sent back something unreadable (HTTP ${response.status}).`
        );
    }

    if (!response.ok || body.ok === false) {

        const failure = new Error(body.error || `Import failed (HTTP ${response.status}).`);
        failure.report = body.report || null;

        throw failure;
    }

    return body;
}


/* mode=list-accounts/create-account - no file, just mode plus
   whatever fields the call needs (name/username/password/dealership
   for create-account; none for list-accounts). */
async function callAccountFunction(mode, fields = {}) {

    const form = new FormData();
    form.append("mode", mode);

    Object.entries(fields).forEach(([key, value]) => {
        form.append(key, value);
    });

    return postToImportFunction(form);
}

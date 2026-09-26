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

const IMPORT_FUNCTION_URL =
    "https://ytgoonducepylslknkag.supabase.co/functions/v1/import-workbook";

const AUTH_STORAGE_KEY = "vad_import_auth";
const LOGIN_NOTICE_KEY = "vad_login_notice";

const auth = { user: null, pass: null };


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

    } catch {
        /* Corrupt entry - treat as logged out rather than throwing. */
    }
}


function saveAuth(user, pass) {

    auth.user = user;
    auth.pass = pass;

    try {
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, pass }));
    } catch {
        /* Private browsing, storage full, etc. - the login still
           works for this page load, it just will not survive a
           refresh. Not worth surfacing to the user. */
    }
}


function clearAuth() {

    auth.user = null;
    auth.pass = null;

    try {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
        /* Nothing to do if storage is unavailable. */
    }
}


function isLoggedIn() {
    return Boolean(auth.user);
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

    return true;
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

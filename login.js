/* ============================================================
   LOGIN PAGE

   Already holding a session (this tab's sessionStorage, from an
   earlier login) - nothing to do here, straight to the dashboard.
   Otherwise: show the form, check whatever gets typed against
   import-workbook's own requireAuth() (see auth.js's
   verifyCredentials()), and only send the browser to index.html
   once that comes back accepted.
   ============================================================ */

function cacheLoginDom() {

    return {
        title: document.getElementById("loginModalTitle"),

        form: document.getElementById("loginForm"),
        user: document.getElementById("loginUser"),
        pass: document.getElementById("loginPass"),
        error: document.getElementById("loginError"),
        submit: document.getElementById("loginSubmit"),
        showSignup: document.getElementById("showSignupLink"),

        signupForm: document.getElementById("signupForm"),
        signupName: document.getElementById("signupName"),
        signupUsername: document.getElementById("signupUsername"),
        signupPassword: document.getElementById("signupPassword"),
        signupDealership: document.getElementById("signupDealership"),
        signupError: document.getElementById("signupError"),
        signupSubmit: document.getElementById("signupSubmit"),
        showLogin: document.getElementById("showLoginLink")
    };
}


/* Toggles between the two forms sharing this one card - never both
   visible, never neither. Switching also clears whatever error the
   form being hidden was showing, so it does not resurface stale the
   next time that form reopens. */
function showSignupForm(dom) {

    dom.form.hidden = true;
    dom.signupForm.hidden = false;
    dom.title.textContent = "Create Your Login";

    dom.error.hidden = true;
    dom.signupName.focus();
}


function showLoginForm(dom) {

    dom.signupForm.hidden = true;
    dom.form.hidden = false;
    dom.title.textContent = "Log In";

    dom.signupError.hidden = true;
    dom.user.focus();
}


async function handleLoginSubmit(event, dom) {

    event.preventDefault();

    const user = dom.user.value.trim();
    const pass = dom.pass.value;

    if (!user || !pass) {
        return;
    }

    dom.error.hidden = true;
    dom.submit.disabled = true;
    dom.submit.textContent = "Logging in...";

    try {

        const profile = await verifyCredentials(user, pass);

        if (!profile) {
            dom.error.textContent = "Incorrect username or password.";
            dom.error.hidden = false;
            return;
        }

        saveAuth(user, pass, profile);
        location.href = "index.html";

    } catch (error) {

        dom.error.textContent = error.message || "Could not log in - try again.";
        dom.error.hidden = false;

    } finally {

        dom.submit.disabled = false;
        dom.submit.textContent = "Log In";
    }
}


/*
 * Creates the account (mode=signup - see local/server/server.js;
 * always canManageUsers = false, no credential required to call it)
 * then logs straight in with what was just typed, same as an admin
 * adding a login and handing the dealer their new username/password -
 * except here there is no admin in the loop, so it signs itself in
 * rather than leaving a second login screen to get through.
 */
async function handleSignupSubmit(event, dom) {

    event.preventDefault();

    const name = dom.signupName.value.trim();
    const username = dom.signupUsername.value.trim();
    const password = dom.signupPassword.value;
    const dealership = dom.signupDealership.value.trim();

    if (!name || !username || !password) {
        return;
    }

    dom.signupError.hidden = true;
    dom.signupSubmit.disabled = true;
    dom.signupSubmit.textContent = "Creating...";

    try {

        const body = await callAccountFunction("signup", { name, username, password, dealership });

        saveAuth(username, password, body.account);
        location.href = "index.html";

    } catch (error) {

        dom.signupError.textContent = error.message || "Could not create a login - try again.";
        dom.signupError.hidden = false;

    } finally {

        dom.signupSubmit.disabled = false;
        dom.signupSubmit.textContent = "Create Login";
    }
}


function bootstrapLogin() {

    loadStoredAuth();

    if (isLoggedIn()) {
        location.href = "index.html";
        return;
    }

    const dom = cacheLoginDom();

    const notice = consumeLoginNotice();

    if (notice) {
        dom.error.textContent = notice;
        dom.error.hidden = false;
    }

    dom.form.addEventListener("submit", event => handleLoginSubmit(event, dom));
    dom.signupForm.addEventListener("submit", event => handleSignupSubmit(event, dom));
    dom.showSignup.addEventListener("click", () => showSignupForm(dom));
    dom.showLogin.addEventListener("click", () => showLoginForm(dom));

    dom.user.focus();
}


if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapLogin);
} else {
    bootstrapLogin();
}

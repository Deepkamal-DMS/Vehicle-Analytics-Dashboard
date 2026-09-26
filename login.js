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
        form: document.getElementById("loginForm"),
        user: document.getElementById("loginUser"),
        pass: document.getElementById("loginPass"),
        error: document.getElementById("loginError"),
        submit: document.getElementById("loginSubmit")
    };
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

        const accepted = await verifyCredentials(user, pass);

        if (!accepted) {
            dom.error.textContent = "Incorrect username or password.";
            dom.error.hidden = false;
            return;
        }

        saveAuth(user, pass);
        location.href = "index.html";

    } catch (error) {

        dom.error.textContent = error.message || "Could not log in - try again.";
        dom.error.hidden = false;

    } finally {

        dom.submit.disabled = false;
        dom.submit.textContent = "Log In";
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
    dom.user.focus();
}


if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapLogin);
} else {
    bootstrapLogin();
}

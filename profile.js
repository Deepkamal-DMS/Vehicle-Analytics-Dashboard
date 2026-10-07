/* ============================================================
   PROFILE PAGE

   Personal info for whoever is logged in, plus - for an account
   with canManageUsers (see local/server/server.js) - every login
   already added and a form to add another. The cloud backend has no
   accounts table of its own, so canManageUsers is always false there
   (see auth.js's verifyCredentials()) and the Logins section simply
   never shows; nothing here is cloud-specific on purpose.

   No session of its own to check against the server - same as
   index.html, a session already in sessionStorage is trusted until
   the first real import-workbook call gets a 401 back (see
   postToImportFunction() in auth.js).
   ============================================================ */

function cacheProfileDom() {

    return {
        name: document.getElementById("profileName"),
        username: document.getElementById("profileUsername"),
        dealership: document.getElementById("profileDealership"),

        manageSection: document.getElementById("profileManageSection"),
        accountList: document.getElementById("profileAccountList"),

        addForm: document.getElementById("profileAddForm"),
        addName: document.getElementById("profileAddName"),
        addUsername: document.getElementById("profileAddUsername"),
        addPassword: document.getElementById("profileAddPassword"),
        addDealership: document.getElementById("profileAddDealership"),
        addError: document.getElementById("profileAddError"),
        addSuccess: document.getElementById("profileAddSuccess"),
        addSubmit: document.getElementById("profileAddSubmit"),

        logoutButton: document.getElementById("profileLogoutButton")
    };
}


function renderProfile(dom) {

    const profile = auth.profile || {
        name: auth.user,
        username: auth.user,
        dealership: "",
        canManageUsers: false
    };

    if (dom.name) {
        dom.name.textContent = profile.name || "—";
    }

    if (dom.username) {
        dom.username.textContent = profile.username || auth.user || "—";
    }

    if (dom.dealership) {
        dom.dealership.textContent = profile.dealership || "—";
    }

    if (dom.manageSection) {
        dom.manageSection.hidden = !profile.canManageUsers;
    }

    if (profile.canManageUsers) {
        loadAccountList(dom);
    }
}


async function loadAccountList(dom) {

    if (!dom.accountList) {
        return;
    }

    dom.accountList.textContent = "Loading…";

    try {

        const body = await callAccountFunction("list-accounts");

        renderAccountList(dom, body.accounts || []);

    } catch (error) {
        dom.accountList.textContent = `Could not load logins: ${error.message}`;
    }
}


/*
 * Built as elements with textContent, never innerHTML with an
 * account's own data spliced in - a dealership name is exactly the
 * kind of free-text field someone could put a "<script>" in.
 */
function renderAccountList(dom, accounts) {

    if (!dom.accountList) {
        return;
    }

    dom.accountList.innerHTML = "";

    if (accounts.length === 0) {

        const empty = document.createElement("li");
        empty.textContent = "No logins yet.";
        dom.accountList.appendChild(empty);

        return;
    }

    accounts.forEach(account => {

        const item = document.createElement("li");

        const name = document.createElement("span");
        name.className = "profile-account-list__name";
        name.textContent = `${account.name} (${account.username})`;

        const meta = document.createElement("span");
        meta.className = "profile-account-list__meta";
        meta.textContent = [
            account.dealership || "No dealership",
            account.canManageUsers ? "Can manage logins" : ""
        ].filter(Boolean).join(" · ");

        item.appendChild(name);
        item.appendChild(meta);
        dom.accountList.appendChild(item);
    });
}


async function handleAddLogin(event, dom) {

    event.preventDefault();

    const name = dom.addName ? dom.addName.value.trim() : "";
    const username = dom.addUsername ? dom.addUsername.value.trim() : "";
    const password = dom.addPassword ? dom.addPassword.value : "";
    const dealership = dom.addDealership ? dom.addDealership.value.trim() : "";

    if (!name || !username || !password) {
        return;
    }

    if (dom.addError) {
        dom.addError.hidden = true;
    }

    if (dom.addSuccess) {
        dom.addSuccess.hidden = true;
    }

    if (dom.addSubmit) {
        dom.addSubmit.disabled = true;
        dom.addSubmit.textContent = "Adding...";
    }

    try {

        await callAccountFunction("create-account", { name, username, password, dealership });

        if (dom.addSuccess) {
            dom.addSuccess.textContent = `"${username}" added.`;
            dom.addSuccess.hidden = false;
        }

        if (dom.addForm) {
            dom.addForm.reset();
        }

        await loadAccountList(dom);

    } catch (error) {

        if (dom.addError) {
            dom.addError.textContent = error.message || "Could not add login - try again.";
            dom.addError.hidden = false;
        }

    } finally {

        if (dom.addSubmit) {
            dom.addSubmit.disabled = false;
            dom.addSubmit.textContent = "Add Login";
        }
    }
}


function bootstrapProfile() {

    loadStoredAuth();

    if (!requireSession()) {
        return;
    }

    const dom = cacheProfileDom();

    renderProfile(dom);

    if (dom.addForm) {
        dom.addForm.addEventListener("submit", event => handleAddLogin(event, dom));
    }

    if (dom.logoutButton) {

        dom.logoutButton.addEventListener("click", () => {
            goToLogin();
        });
    }
}


if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapProfile);
} else {
    bootstrapProfile();
}

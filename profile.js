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

        infoView: document.getElementById("profileInfoView"),
        infoEditToggle: document.getElementById("profileInfoEditToggle"),
        infoEditForm: document.getElementById("profileInfoEditForm"),
        infoEditName: document.getElementById("profileInfoEditName"),
        infoEditUsername: document.getElementById("profileInfoEditUsername"),
        infoEditPassword: document.getElementById("profileInfoEditPassword"),
        infoEditDealership: document.getElementById("profileInfoEditDealership"),
        infoEditError: document.getElementById("profileInfoEditError"),
        infoSuccess: document.getElementById("profileInfoSuccess"),
        infoEditSubmit: document.getElementById("profileInfoEditSubmit"),
        infoEditCancel: document.getElementById("profileInfoEditCancel"),

        manageSection: document.getElementById("profileManageSection"),
        accountList: document.getElementById("profileAccountList"),

        addFormTitle: document.getElementById("profileAddFormTitle"),
        addForm: document.getElementById("profileAddForm"),
        addName: document.getElementById("profileAddName"),
        addUsername: document.getElementById("profileAddUsername"),
        addPassword: document.getElementById("profileAddPassword"),
        addPasswordHint: document.getElementById("profileAddPasswordHint"),
        addDealership: document.getElementById("profileAddDealership"),
        addError: document.getElementById("profileAddError"),
        addSuccess: document.getElementById("profileAddSuccess"),
        addSubmit: document.getElementById("profileAddSubmit"),
        addCancel: document.getElementById("profileAddCancel"),

        logoutButton: document.getElementById("profileLogoutButton"),

        dealershipList: document.getElementById("profileDealershipList"),
        dealershipForm: document.getElementById("profileDealershipForm"),
        dealershipName: document.getElementById("dealershipName"),
        dealershipMaker: document.getElementById("dealershipMaker"),
        dealershipScope: document.getElementById("dealershipScope"),
        dealershipRto: document.getElementById("dealershipRto"),
        dealershipAddError: document.getElementById("dealershipAddError"),
        dealershipAddSuccess: document.getElementById("dealershipAddSuccess"),
        dealershipAddSubmit: document.getElementById("dealershipAddSubmit")
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

    loadDealershipList(dom);
}


/* Fills the edit form from the currently-displayed profile, same
   reasoning as enterEditMode() below for the Logins section. */
function enterInfoEditMode(dom) {

    const profile = auth.profile || { name: auth.user, username: auth.user, dealership: "" };

    if (dom.infoEditName) {
        dom.infoEditName.value = profile.name || "";
    }

    if (dom.infoEditUsername) {
        dom.infoEditUsername.value = profile.username || auth.user || "";
    }

    if (dom.infoEditPassword) {
        dom.infoEditPassword.value = "";
    }

    if (dom.infoEditDealership) {
        dom.infoEditDealership.value = profile.dealership || "";
    }

    if (dom.infoEditError) {
        dom.infoEditError.hidden = true;
    }

    if (dom.infoSuccess) {
        dom.infoSuccess.hidden = true;
    }

    if (dom.infoView) {
        dom.infoView.hidden = true;
    }

    if (dom.infoEditForm) {
        dom.infoEditForm.hidden = false;
    }

    if (dom.infoEditToggle) {
        dom.infoEditToggle.hidden = true;
    }
}


function exitInfoEditMode(dom) {

    if (dom.infoView) {
        dom.infoView.hidden = false;
    }

    if (dom.infoEditForm) {
        dom.infoEditForm.hidden = true;
        dom.infoEditForm.reset();
    }

    if (dom.infoEditToggle) {
        dom.infoEditToggle.hidden = false;
    }
}


/*
 * Editing your OWN login, not another account's (see profile.js's
 * handleAddLogin() for that one) - the one real wrinkle is that a
 * successful save can change the very credentials this session is
 * using right now, so auth.user/auth.pass (and the cached profile)
 * are updated in place afterward via saveAuth(), or every request
 * after this one would start failing with a 401 against the old
 * username/password the server no longer recognises.
 */
async function handleProfileInfoEdit(event, dom) {

    event.preventDefault();

    const name = dom.infoEditName ? dom.infoEditName.value.trim() : "";
    const username = dom.infoEditUsername ? dom.infoEditUsername.value.trim() : "";
    const password = dom.infoEditPassword ? dom.infoEditPassword.value : "";
    const dealership = dom.infoEditDealership ? dom.infoEditDealership.value.trim() : "";

    if (!name || !username) {
        return;
    }

    if (dom.infoEditError) {
        dom.infoEditError.hidden = true;
    }

    if (dom.infoSuccess) {
        dom.infoSuccess.hidden = true;
    }

    if (dom.infoEditSubmit) {
        dom.infoEditSubmit.disabled = true;
        dom.infoEditSubmit.textContent = "Saving...";
    }

    try {

        const body = await callAccountFunction("update-account", {
            original_username: auth.user, name, username, password, dealership
        });

        saveAuth(username, password || auth.pass, body.account);

        exitInfoEditMode(dom);
        renderProfile(dom);

        if (dom.infoSuccess) {
            dom.infoSuccess.textContent = "Saved.";
            dom.infoSuccess.hidden = false;
        }

    } catch (error) {

        if (dom.infoEditError) {
            dom.infoEditError.textContent = error.message || "Could not save changes - try again.";
            dom.infoEditError.hidden = false;
        }

    } finally {

        if (dom.infoEditSubmit) {
            dom.infoEditSubmit.disabled = false;
            dom.infoEditSubmit.textContent = "Save Changes";
        }
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

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "import-card__checks-link";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => enterEditMode(dom, account));

        item.appendChild(name);
        item.appendChild(meta);
        item.appendChild(editButton);

        /*
         * Never offered for the account currently logged in - deleting
         * yourself mid-session has no good recovery short of direct DB
         * access, so the server refuses it outright (see server.js's
         * deleteAccountFromForm()) and this button simply never
         * appears for that row, rather than existing only to fail.
         */
        if (account.username !== auth.user) {

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "import-card__checks-link import-card__checks-link--danger";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => handleDeleteAccount(dom, account));

            item.appendChild(deleteButton);
        }

        dom.accountList.appendChild(item);
    });
}


/*
 * Deletes someone else's login outright - their dealerships and every
 * data row filed under their username go with it, not just the
 * accounts row (see deleteAccountFromForm() for the full cascade).
 * window.confirm() names exactly what is about to be removed rather
 * than a generic "are you sure", since this cannot be undone.
 */
async function handleDeleteAccount(dom, account) {

    const confirmed = window.confirm(
        `Delete "${account.username}" (${account.name})? This also removes every ` +
        `dealership and every row of data filed under this login, permanently. ` +
        `This cannot be undone.`
    );

    if (!confirmed) {
        return;
    }

    try {

        const body = await callAccountFunction("delete-account", { username: account.username });
        const deleted = body.deleted || {};

        if (dom.addSuccess) {
            dom.addSuccess.textContent =
                `"${account.username}" deleted (${deleted.dealerships || 0} dealership(s), ` +
                `${deleted.dataRows || 0} data row(s) removed).`;
            dom.addSuccess.hidden = false;
        }

        await loadAccountList(dom);

    } catch (error) {

        if (dom.addError) {
            dom.addError.textContent = error.message || "Could not delete this login - try again.";
            dom.addError.hidden = false;
        }
    }
}


/*
 * Fills the same form handleAddLogin() submits, but in-place edit
 * mode: the form's own dataset.editingUsername is what tells
 * handleAddLogin() to call update-account instead of create-account
 * (see that function) - password is deliberately left blank, since
 * typing one here is what *opts into* changing it, not a requirement.
 */
function enterEditMode(dom, account) {

    if (!dom.addForm) {
        return;
    }

    dom.addForm.dataset.editingUsername = account.username;

    if (dom.addFormTitle) {
        dom.addFormTitle.textContent = `Edit "${account.username}"`;
    }

    if (dom.addName) {
        dom.addName.value = account.name || "";
    }

    if (dom.addUsername) {
        dom.addUsername.value = account.username || "";
    }

    if (dom.addPassword) {
        dom.addPassword.value = "";
        dom.addPassword.removeAttribute("required");
    }

    if (dom.addPasswordHint) {
        dom.addPasswordHint.hidden = false;
    }

    if (dom.addDealership) {
        dom.addDealership.value = account.dealership || "";
    }

    if (dom.addSubmit) {
        dom.addSubmit.textContent = "Save Changes";
    }

    if (dom.addCancel) {
        dom.addCancel.hidden = false;
    }

    if (dom.addError) {
        dom.addError.hidden = true;
    }

    if (dom.addSuccess) {
        dom.addSuccess.hidden = true;
    }

    dom.addForm.scrollIntoView({ behavior: "smooth", block: "center" });
}


function exitEditMode(dom) {

    if (!dom.addForm) {
        return;
    }

    delete dom.addForm.dataset.editingUsername;

    if (dom.addFormTitle) {
        dom.addFormTitle.textContent = "Add a login";
    }

    if (dom.addPassword) {
        dom.addPassword.setAttribute("required", "");
    }

    if (dom.addPasswordHint) {
        dom.addPasswordHint.hidden = true;
    }

    if (dom.addSubmit) {
        dom.addSubmit.textContent = "Add Login";
    }

    if (dom.addCancel) {
        dom.addCancel.hidden = true;
    }

    dom.addForm.reset();
}


async function handleAddLogin(event, dom) {

    event.preventDefault();

    const editingUsername = dom.addForm ? dom.addForm.dataset.editingUsername : undefined;
    const isEditing = Boolean(editingUsername);

    const name = dom.addName ? dom.addName.value.trim() : "";
    const username = dom.addUsername ? dom.addUsername.value.trim() : "";
    const password = dom.addPassword ? dom.addPassword.value : "";
    const dealership = dom.addDealership ? dom.addDealership.value.trim() : "";

    /* Editing: password is optional (blank means "keep it"). Adding:
       still required, same as always. */
    if (!name || !username || (!isEditing && !password)) {
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
        dom.addSubmit.textContent = isEditing ? "Saving..." : "Adding...";
    }

    try {

        if (isEditing) {

            await callAccountFunction("update-account", {
                original_username: editingUsername, name, username, password, dealership
            });

            if (dom.addSuccess) {
                dom.addSuccess.textContent = `"${username}" updated.`;
                dom.addSuccess.hidden = false;
            }

            exitEditMode(dom);

        } else {

            await callAccountFunction("create-account", { name, username, password, dealership });

            if (dom.addSuccess) {
                dom.addSuccess.textContent = `"${username}" added.`;
                dom.addSuccess.hidden = false;
            }

            if (dom.addForm) {
                dom.addForm.reset();
            }
        }

        await loadAccountList(dom);

    } catch (error) {

        if (dom.addError) {
            dom.addError.textContent = error.message ||
                `Could not ${isEditing ? "save changes" : "add login"} - try again.`;
            dom.addError.hidden = false;
        }

    } finally {

        /*
         * Not the captured isEditing - a successful edit already
         * called exitEditMode() above, which cleared
         * dataset.editingUsername and relabelled the button back to
         * "Add Login" itself. Re-checking the form's current state
         * here (rather than the state at submit time) is what keeps
         * this from stomping that back to "Save Changes" on success.
         */
        const stillEditing = Boolean(dom.addForm && dom.addForm.dataset.editingUsername);

        if (dom.addSubmit) {
            dom.addSubmit.disabled = false;
            dom.addSubmit.textContent = stillEditing ? "Save Changes" : "Add Login";
        }
    }
}


async function loadDealershipList(dom) {

    if (!dom.dealershipList) {
        return;
    }

    dom.dealershipList.textContent = "Loading…";

    try {

        const body = await callAccountFunction("list-dealerships");

        renderDealershipList(dom, body.dealerships || []);

    } catch (error) {
        dom.dealershipList.textContent = `Could not load dealerships: ${error.message}`;
    }
}


const DEALERSHIP_SCOPE_LABELS = { gujarat: "Gujarat", maharashtra: "Maharashtra" };


/* Built as elements with textContent, same reasoning as
   renderAccountList() - a Maker or dealership name is free text. */
function renderDealershipList(dom, dealerships) {

    if (!dom.dealershipList) {
        return;
    }

    dom.dealershipList.innerHTML = "";

    if (dealerships.length === 0) {

        const empty = document.createElement("li");
        empty.textContent = "No dealerships yet.";
        dom.dealershipList.appendChild(empty);

        return;
    }

    dealerships.forEach(dealership => {

        const item = document.createElement("li");

        const name = document.createElement("span");
        name.className = "profile-account-list__name";
        name.textContent = dealership.name;

        const meta = document.createElement("span");
        meta.className = "profile-account-list__meta";
        meta.textContent = [
            dealership.maker,
            `${DEALERSHIP_SCOPE_LABELS[dealership.scope] || dealership.scope} · ${(dealership.rtoCodes || []).join(", ")}`,
            dealership.isOwn === false ? "Competitor (excluded from your Contribution)" : ""
        ].filter(Boolean).join(" · ");

        item.appendChild(name);
        item.appendChild(meta);
        dom.dealershipList.appendChild(item);
    });
}


async function handleAddDealership(event, dom) {

    event.preventDefault();

    const name = dom.dealershipName ? dom.dealershipName.value.trim() : "";
    const maker = dom.dealershipMaker ? dom.dealershipMaker.value.trim() : "";
    const scope = dom.dealershipScope ? dom.dealershipScope.value : "";
    const rtoCodes = dom.dealershipRto ? dom.dealershipRto.value.trim() : "";

    if (!name || !maker || !rtoCodes) {
        return;
    }

    if (dom.dealershipAddError) {
        dom.dealershipAddError.hidden = true;
    }

    if (dom.dealershipAddSuccess) {
        dom.dealershipAddSuccess.hidden = true;
    }

    if (dom.dealershipAddSubmit) {
        dom.dealershipAddSubmit.disabled = true;
        dom.dealershipAddSubmit.textContent = "Adding...";
    }

    try {

        await callAccountFunction("create-dealership", { name, maker, scope, rto_codes: rtoCodes });

        if (dom.dealershipAddSuccess) {
            dom.dealershipAddSuccess.textContent = `"${name}" added.`;
            dom.dealershipAddSuccess.hidden = false;
        }

        if (dom.dealershipForm) {
            dom.dealershipForm.reset();
        }

        await loadDealershipList(dom);

    } catch (error) {

        if (dom.dealershipAddError) {
            dom.dealershipAddError.textContent = error.message || "Could not add dealership - try again.";
            dom.dealershipAddError.hidden = false;
        }

    } finally {

        if (dom.dealershipAddSubmit) {
            dom.dealershipAddSubmit.disabled = false;
            dom.dealershipAddSubmit.textContent = "Add Dealership";
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

    if (dom.infoEditToggle) {
        dom.infoEditToggle.addEventListener("click", () => enterInfoEditMode(dom));
    }

    if (dom.infoEditForm) {
        dom.infoEditForm.addEventListener("submit", event => handleProfileInfoEdit(event, dom));
    }

    if (dom.infoEditCancel) {
        dom.infoEditCancel.addEventListener("click", () => exitInfoEditMode(dom));
    }

    if (dom.addForm) {
        dom.addForm.addEventListener("submit", event => handleAddLogin(event, dom));
    }

    if (dom.addCancel) {
        dom.addCancel.addEventListener("click", () => exitEditMode(dom));
    }

    if (dom.dealershipForm) {
        dom.dealershipForm.addEventListener("submit", event => handleAddDealership(event, dom));
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

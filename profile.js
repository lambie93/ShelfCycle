const token = localStorage.getItem("shelfcycleToken");
if (!token) {
    window.location.replace("index.html");
}

const profileName = document.getElementById("profileName");
const profileSince = document.getElementById("profileSince");
const profileMessage = document.getElementById("profileMessage");
const favoriteBookInput = document.getElementById("favoriteBookInput");
const challengeTitle = document.getElementById("challengeTitle");
const challengeFill = document.getElementById("challengeFill");
const challengeText = document.getElementById("challengeText");
const challengeGoalInput = document.getElementById("challengeGoalInput");

let me = null;

function authHeaders() {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function api(url, options = {}) {
    const res = await fetch(url, { ...options, headers: authHeaders() });
    if (res.status === 401) {
        localStorage.removeItem("shelfcycleToken");
        window.location.replace("index.html");
        throw new Error("unauthorized");
    }
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Request failed");
    return body;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function bookCard(book, actionsHtml) {
    return `
        <article class="mini-book">
            <strong>${escapeHtml(book.title)}</strong>
            <span class="author">${escapeHtml(book.author)}</span>
            ${actionsHtml}
        </article>
    `;
}

function actionButtons(bookId, actions) {
    return `<div class="mini-actions" data-id="${bookId}">${actions}</div>`;
}

function renderSimpleShelf(listName, entries, actionsFor) {
    const box = document.getElementById(`list-${listName}`);
    if (!entries.length) {
        box.innerHTML = `<p class="shelf-empty">Nothing here yet — add books from the <a href="catalog.html">catalog</a>.</p>`;
        return;
    }
    box.innerHTML = entries.map((book) => bookCard(book, actionButtons(book.id, actionsFor(book)))).join("");
}

function renderCurrentlyReading(entries) {
    const box = document.getElementById("list-currentlyReading");
    if (!entries.length) {
        box.innerHTML = `<p class="shelf-empty">Nothing here yet — add books from the <a href="catalog.html">catalog</a>.</p>`;
        return;
    }
    box.innerHTML = entries.map((entry) => {
        const pct = entry.totalPages ? Math.min(100, Math.round((entry.pagesRead / entry.totalPages) * 100)) : 0;
        return `
            <article class="mini-book">
                <strong>${escapeHtml(entry.book.title)}</strong>
                <span class="author">${escapeHtml(entry.book.author)}</span>
                <div class="progress-bar"><div class="progress-fill" style="width: ${pct}%"></div></div>
                <div class="progress-inputs" data-id="${entry.bookId}">
                    <input type="number" class="pages-read" min="0" value="${entry.pagesRead}" aria-label="Pages read">
                    <span>of</span>
                    <input type="number" class="pages-total" min="1" value="${entry.totalPages || entry.book.pages}" aria-label="Total pages">
                    <button type="button" class="small-button" data-action="save-progress">Save</button>
                </div>
                <div class="mini-actions" data-id="${entry.bookId}">
                    <button type="button" class="small-button" data-action="finish">Mark finished</button>
                    <button type="button" class="small-button" data-action="dnf">Did not finish</button>
                    <button type="button" class="small-button" data-action="remove-current">Remove</button>
                </div>
            </article>
        `;
    }).join("");
}

function renderFinished(entries) {
    const box = document.getElementById("list-finished");
    if (!entries.length) {
        box.innerHTML = `<p class="shelf-empty">Books you finish will show up here.</p>`;
        return;
    }
    box.innerHTML = entries.map((entry) => bookCard(
        entry.book,
        `<span class="finished-date">Finished ${escapeHtml(entry.finishedAt)}</span>` +
        actionButtons(entry.bookId, `<button type="button" class="small-button" data-action="remove-finished">Remove</button>`)
    )).join("");
}

function renderChallenge() {
    const { year, goal } = me.challenge;
    const count = me.lists.finished.filter((e) => e.finishedAt.startsWith(String(year))).length;
    const pct = Math.min(100, Math.round((count / goal) * 100));
    challengeTitle.textContent = `${year} reading challenge`;
    challengeFill.style.width = `${pct}%`;
    challengeText.textContent = `${count} of ${goal} books finished (${pct}%)`;
    challengeGoalInput.value = goal;
}

function render() {
    profileName.textContent = me.username;
    profileSince.textContent = `Member since ${me.joinedAt}`;
    favoriteBookInput.value = me.favoriteBook || "";
    renderChallenge();

    renderCurrentlyReading(me.lists.currentlyReading);
    renderSimpleShelf("wantToRead", me.lists.wantToRead, () =>
        `<button type="button" class="small-button" data-action="start-reading">Start reading</button>
         <button type="button" class="small-button" data-action="remove-wantToRead">Remove</button>`);
    renderSimpleShelf("assigned", me.lists.assigned, () =>
        `<button type="button" class="small-button" data-action="start-reading-assigned">Start reading</button>
         <button type="button" class="small-button" data-action="remove-assigned">Remove</button>`);
    renderSimpleShelf("favorites", me.lists.favorites, () =>
        `<button type="button" class="small-button" data-action="remove-favorites">Remove</button>`);
    renderSimpleShelf("didNotFinish", me.lists.didNotFinish, () =>
        `<button type="button" class="small-button" data-action="remove-didNotFinish">Remove</button>`);
    renderFinished(me.lists.finished);
}

function flash(text, isError) {
    profileMessage.textContent = text;
    profileMessage.className = isError ? "form-error" : "form-success";
}

async function reload(message) {
    const { user } = await api("/api/me");
    me = user;
    render();
    if (message) flash(message);
}

document.getElementById("saveFavorite").addEventListener("click", async () => {
    try {
        await api("/api/me", { method: "PUT", body: JSON.stringify({ favoriteBook: favoriteBookInput.value }) });
        flash("Favorite book saved.");
    } catch (e) {
        flash(e.message, true);
    }
});

document.getElementById("saveGoal").addEventListener("click", async () => {
    try {
        await api("/api/me/challenge", { method: "PUT", body: JSON.stringify({ goal: Number(challengeGoalInput.value) }) });
        reload("Challenge goal updated.");
    } catch (e) {
        flash(e.message, true);
    }
});

const REMOVE_ACTIONS = {
    "remove-wantToRead": "wantToRead",
    "remove-assigned": "assigned",
    "remove-favorites": "favorites",
    "remove-didNotFinish": "didNotFinish",
    "remove-finished": "finished",
    "remove-current": "currentlyReading",
};

document.querySelector("main").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.closest("[data-id]").dataset.id;
    const action = button.dataset.action;
    try {
        if (REMOVE_ACTIONS[action]) {
            await api(`/api/me/lists/${REMOVE_ACTIONS[action]}/${id}`, { method: "DELETE" });
            await reload("Removed.");
        } else if (action === "start-reading" || action === "start-reading-assigned") {
            const from = action === "start-reading" ? "wantToRead" : "assigned";
            await api("/api/me/lists/move", { method: "POST", body: JSON.stringify({ from, to: "currentlyReading", bookId: Number(id) }) });
            await reload("Moved to currently reading.");
        } else if (action === "finish") {
            await api("/api/me/lists/move", { method: "POST", body: JSON.stringify({ from: "currentlyReading", to: "finished", bookId: Number(id) }) });
            await reload("Nice — marked as finished!");
        } else if (action === "dnf") {
            await api("/api/me/lists/move", { method: "POST", body: JSON.stringify({ from: "currentlyReading", to: "didNotFinish", bookId: Number(id) }) });
            await reload("Moved to did not finish.");
        } else if (action === "save-progress") {
            const wrap = button.closest(".progress-inputs");
            const pagesRead = Number(wrap.querySelector(".pages-read").value);
            const totalPages = Number(wrap.querySelector(".pages-total").value);
            await api("/api/me/progress", { method: "PUT", body: JSON.stringify({ bookId: Number(id), pagesRead, totalPages }) });
            await reload("Progress saved.");
        }
    } catch (e) {
        flash(e.message, true);
    }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
        await fetch("/api/logout", { method: "POST", headers: authHeaders() });
    } catch { /* still log out locally */ }
    localStorage.removeItem("shelfcycleToken");
    window.location.replace("index.html");
});

(async () => {
    try {
        await reload();
    } catch (e) {
        if (e.message !== "unauthorized") flash(e.message, true);
    }
})();

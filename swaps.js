const token = localStorage.getItem("shelfcycleToken");
const exchangeGrid = document.getElementById("exchangeGrid");
const swapsMessage = document.getElementById("swapsMessage");
const listFormCard = document.getElementById("listFormCard");
const loginHint = document.getElementById("loginHint");
const listBookSelect = document.getElementById("listBookSelect");
const listTypeSelect = document.getElementById("listTypeSelect");

let me = null;

function authHeaders() {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function flash(text, isError) {
    swapsMessage.textContent = text;
    swapsMessage.className = isError ? "form-error" : "form-success";
}

const STATUS_LABELS = {
    available: "Available",
    requested: "Requested",
    active: "In progress",
};

function exchangeActions(e) {
    if (!me) return "";
    if (e.ownerId === me.id) {
        if (e.status === "requested") {
            return `
                <button type="button" class="small-button" data-action="accept">Accept ${escapeHtml(e.requester)}'s request</button>
                <button type="button" class="small-button" data-action="decline">Decline</button>
            `;
        }
        if (e.status === "active") {
            const label = e.type === "lend" ? "Mark returned" : "Mark completed";
            return `<button type="button" class="small-button" data-action="complete">${label}</button>`;
        }
        return `<button type="button" class="small-button" data-action="remove">Remove listing</button>`;
    }
    if (e.requesterId === me.id && e.status === "requested") {
        return `<button type="button" class="small-button" data-action="cancel">Cancel my request</button>`;
    }
    if (e.status === "available") {
        return `<button type="button" class="primary-button" data-action="request">Request this book</button>`;
    }
    return "";
}

function renderExchanges(exchanges) {
    if (!exchanges.length) {
        exchangeGrid.innerHTML = `<p class="shelf-empty">No books listed yet. Be the first to list one!</p>`;
        return;
    }
    exchangeGrid.innerHTML = exchanges.map((e) => `
        <article class="mini-book exchange-card">
            <strong>${escapeHtml(e.book.title)}</strong>
            <span class="author">${escapeHtml(e.book.author)}</span>
            <span class="badge badge-${e.type}">${e.type === "swap" ? "Swap" : "Lend"}</span>
            <span class="meta">Owner: ${escapeHtml(e.owner)} · ${STATUS_LABELS[e.status]}${e.requester ? ` (${escapeHtml(e.requester)})` : ""}</span>
            <div class="mini-actions" data-id="${e.id}">${exchangeActions(e)}</div>
        </article>
    `).join("");
}

async function loadExchanges() {
    const res = await fetch("/api/exchanges");
    const { exchanges } = await res.json();
    renderExchanges(exchanges);
}

async function loadBooks() {
    const res = await fetch("/api/books");
    const { books } = await res.json();
    listBookSelect.innerHTML = books
        .map((b) => `<option value="${b.id}">${escapeHtml(b.title)} — ${escapeHtml(b.author)}</option>`)
        .join("");
}

async function loadMe() {
    if (!token) {
        loginHint.hidden = false;
        return;
    }
    try {
        const res = await fetch("/api/me", { headers: authHeaders() });
        if (!res.ok) throw new Error();
        me = (await res.json()).user;
        listFormCard.hidden = false;
        await loadBooks();
    } catch {
        localStorage.removeItem("shelfcycleToken");
        loginHint.hidden = false;
    }
}

document.getElementById("listBookButton").addEventListener("click", async () => {
    try {
        const res = await fetch("/api/exchanges", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ bookId: Number(listBookSelect.value), type: listTypeSelect.value }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not list the book.");
        flash("Listed! Other members can now request it.");
        loadExchanges();
    } catch (e) {
        flash(e.message, true);
    }
});

exchangeGrid.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.closest("[data-id]").dataset.id;
    const action = button.dataset.action;
    try {
        const res = await fetch(
            action === "remove" ? `/api/exchanges/${id}` : `/api/exchanges/${id}/${action}`,
            { method: action === "remove" ? "DELETE" : "POST", headers: authHeaders() }
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Something went wrong.");
        flash(body.message);
        loadExchanges();
    } catch (e) {
        flash(e.message, true);
    }
});

(async () => {
    await loadMe();
    try {
        await loadExchanges();
    } catch {
        flash("Could not load listings.", true);
    }
})();

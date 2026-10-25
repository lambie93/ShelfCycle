const loginSection = document.getElementById("loginSection");
const reviewSection = document.getElementById("reviewSection");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const pendingList = document.getElementById("pendingList");
const pendingCount = document.getElementById("pendingCount");
const adminMessage = document.getElementById("adminMessage");
const logoutButton = document.getElementById("logoutButton");

function getToken() {
    return sessionStorage.getItem("adminToken");
}

function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` };
}

function showReview() {
    loginSection.hidden = true;
    reviewSection.hidden = false;
    loadPending();
}

function showLogin() {
    sessionStorage.removeItem("adminToken");
    loginSection.hidden = false;
    reviewSection.hidden = true;
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginMessage.textContent = "";
    const password = new FormData(loginForm).get("password");

    try {
        const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
        });
        if (!res.ok) {
            loginMessage.textContent = "Incorrect password.";
            loginMessage.className = "form-error";
            return;
        }
        const { token } = await res.json();
        sessionStorage.setItem("adminToken", token);
        loginForm.reset();
        showReview();
    } catch {
        loginMessage.textContent = "Could not reach the server.";
        loginMessage.className = "form-error";
    }
});

logoutButton.addEventListener("click", showLogin);

async function loadPending() {
    try {
        const res = await fetch("/api/admin/pending", { headers: authHeaders() });
        if (res.status === 401) {
            showLogin();
            return;
        }
        const { books } = await res.json();
        pendingCount.textContent = books.length
            ? `${books.length} book(s) waiting for review.`
            : "Nothing to review right now.";
        pendingList.innerHTML = books.map((b) => `
            <article class="book-card">
                <h3>${escapeHtml(b.title)}</h3>
                <p class="author">${escapeHtml(b.author)}</p>
                <p class="meta">${escapeHtml(b.genre)} · ${b.pages} pages · ${escapeHtml(b.language)} · ${b.year}</p>
                <p class="meta">Suggested rating: ${b.rating > 0 ? "★".repeat(Math.round(b.rating)) : "none"}</p>
                <div class="admin-actions" data-id="${b.id}">
                    <button type="button" class="primary-button" data-action="approve">Approve</button>
                    <button type="button" class="reject-button" data-action="reject">Reject</button>
                </div>
            </article>
        `).join("");
    } catch {
        adminMessage.textContent = "Could not load the review queue.";
        adminMessage.className = "form-error";
    }
}

pendingList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.closest(".admin-actions").dataset.id;
    adminMessage.textContent = "";

    try {
        const res = await fetch(`/api/admin/books/${id}/${button.dataset.action}`, {
            method: "POST",
            headers: authHeaders(),
        });
        if (res.status === 401) {
            showLogin();
            return;
        }
        const body = await res.json();
        adminMessage.textContent = body.message || body.error;
        adminMessage.className = res.ok ? "form-success" : "form-error";
        loadPending();
    } catch {
        adminMessage.textContent = "Could not reach the server.";
        adminMessage.className = "form-error";
    }
});

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

if (getToken()) {
    showReview();
}

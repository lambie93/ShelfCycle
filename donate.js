const token = localStorage.getItem("shelfcycleToken");
const donateForm = document.getElementById("donateForm");
const donateMessage = document.getElementById("donateMessage");
const donateLoginHint = document.getElementById("donateLoginHint");
const donationList = document.getElementById("donationList");

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

async function loadDonations() {
    const res = await fetch("/api/donations");
    const { donations } = await res.json();
    if (!donations.length) {
        donationList.innerHTML = `<p class="shelf-empty">No donations recorded yet.</p>`;
        return;
    }
    donationList.innerHTML = donations.map((d) => `
        <article class="mini-book">
            <strong>${escapeHtml(d.title)}</strong>
            <span class="author">${escapeHtml(d.author)}</span>
            <span class="meta">Donated to ${escapeHtml(d.school)} by ${escapeHtml(d.username)} · ${escapeHtml(d.donatedAt)}</span>
        </article>
    `).join("");
}

async function init() {
    if (!token) {
        donateLoginHint.hidden = false;
    } else {
        try {
            const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error();
            donateForm.hidden = false;
        } catch {
            localStorage.removeItem("shelfcycleToken");
            donateLoginHint.hidden = false;
        }
    }
    try {
        await loadDonations();
    } catch {
        donationList.innerHTML = `<p class="shelf-empty">Could not load donations.</p>`;
    }
}

donateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    donateMessage.textContent = "";
    const data = Object.fromEntries(new FormData(donateForm));
    try {
        const res = await fetch("/api/donations", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Something went wrong.");
        donateMessage.textContent = "Thank you! Your donation was recorded.";
        donateMessage.className = "form-success";
        donateForm.reset();
        loadDonations();
    } catch (e) {
        donateMessage.textContent = e.message;
        donateMessage.className = "form-error";
    }
});

init();

const loginCard = document.getElementById("loginCard");
const signupCard = document.getElementById("signupCard");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const welcomeBox = document.getElementById("welcomeBox");
const welcomeName = document.getElementById("welcomeName");
const welcomeLogout = document.getElementById("welcomeLogout");
const authMessage = document.getElementById("authMessage");

function getToken() {
    return localStorage.getItem("shelfcycleToken");
}

function showWelcome(username) {
    loginCard.hidden = true;
    signupCard.hidden = true;
    welcomeBox.hidden = false;
    welcomeName.textContent = username;
    authMessage.textContent = "";
}

function showForms() {
    loginCard.hidden = false;
    signupCard.hidden = false;
    welcomeBox.hidden = true;
    authMessage.textContent = "";
}

async function submitAuth(url, form) {
    authMessage.textContent = "";
    const data = Object.fromEntries(new FormData(form));
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        const body = await res.json();
        if (!res.ok) {
            authMessage.textContent = body.error || "Something went wrong.";
            authMessage.className = "form-error";
            return;
        }
        localStorage.setItem("shelfcycleToken", body.token);
        showWelcome(body.user.username);
    } catch {
        authMessage.textContent = "Could not reach the server. Please try again.";
        authMessage.className = "form-error";
    }
}

loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuth("/api/login", loginForm);
});

signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuth("/api/signup", signupForm);
});

welcomeLogout.addEventListener("click", async () => {
    try {
        await fetch("/api/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${getToken()}` },
        });
    } catch { /* still log out locally */ }
    localStorage.removeItem("shelfcycleToken");
    showForms();
});

async function init() {
    if (!getToken()) return;
    try {
        const res = await fetch("/api/me", {
            headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error();
        const { user } = await res.json();
        showWelcome(user.username);
    } catch {
        localStorage.removeItem("shelfcycleToken");
    }
}

init();

const featureButton = document.getElementById("featureButton");
const featureForm = document.getElementById("featureForm");
const featureMessage = document.getElementById("featureMessage");

featureButton.addEventListener("click", () => {
    featureForm.hidden = !featureForm.hidden;
    if (!featureForm.hidden) {
        featureForm.elements.text.focus();
    }
    featureMessage.textContent = "";
});

featureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    featureMessage.textContent = "";
    const text = new FormData(featureForm).get("text");
    try {
        const res = await fetch("/api/features", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Something went wrong.");
        featureMessage.textContent = body.message;
        featureForm.reset();
        featureForm.hidden = true;
    } catch (e) {
        featureMessage.textContent = e.message;
    }
});

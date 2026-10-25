const form = document.getElementById("bookForm");
const message = document.getElementById("formMessage");

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";

    const data = Object.fromEntries(new FormData(form));
    const payload = {
        title: data.title,
        author: data.author,
        genre: data.genre,
        pages: Number(data.pages),
        language: data.language || "English",
        year: Number(data.year),
        rating: data.rating ? Number(data.rating) : 0,
    };

    try {
        const res = await fetch("/api/books", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!res.ok) {
            message.textContent = body.error || "Something went wrong.";
            message.className = "form-error";
            return;
        }
        message.textContent = `Thank you! "${body.book.title}" was submitted and will appear once an admin approves it.`;
        message.className = "form-success";
        form.reset();
    } catch {
        message.textContent = "Could not reach the server. Please try again.";
        message.className = "form-error";
    }
});

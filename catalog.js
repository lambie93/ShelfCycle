const state = {
    books: [],
    search: "",
    sort: "title",
    language: "",
    minPages: 1,
    maxPages: 1000,
    minRating: 0,
    minYear: 1440,
};

const els = {
    search: document.getElementById("searchInput"),
    clearFilters: document.getElementById("clearFilters"),
    sort: document.getElementById("sortFilter"),
    language: document.getElementById("languageFilter"),
    minPages: document.getElementById("minPagesFilter"),
    minPagesInput: document.getElementById("minPagesInput"),
    pages: document.getElementById("pagesFilter"),
    maxPagesInput: document.getElementById("maxPagesInput"),
    rating: document.getElementById("ratingFilter"),
    ratingValue: document.getElementById("ratingValue"),
    year: document.getElementById("yearFilter"),
    yearInput: document.getElementById("yearInput"),
    grid: document.getElementById("bookGrid"),
    count: document.getElementById("resultsCount"),
    empty: document.getElementById("emptyState"),
    reset: document.getElementById("resetSearch"),
};

function starString(rating) {
    const full = Math.round(rating);
    let out = "";
    for (let i = 1; i <= 5; i++) {
        out += `<span class="${i <= full ? "" : "empty-star"}">★</span>`;
    }
    return out;
}

function getVisibleBooks() {
    const query = state.search.trim().toLowerCase();
    return state.books
        .filter((b) => {
            if (query && ![b.title, b.author, b.genre].some((f) => f.toLowerCase().includes(query))) {
                return false;
            }
            if (b.pages < state.minPages) return false;
            if (b.pages > state.maxPages) return false;
            if (state.language && b.language !== state.language) return false;
            if (b.rating < state.minRating) return false;
            if (b.year < state.minYear) return false;
            return true;
        })
        .sort((a, b) => a[state.sort].localeCompare(b[state.sort]));
}

function render() {
    const visible = getVisibleBooks();
    els.grid.innerHTML = visible.map((b) => `
        <article class="book-card">
            <h3>${escapeHtml(b.title)}</h3>
            <p class="author">${escapeHtml(b.author)}</p>
            <p class="meta">${escapeHtml(b.genre)} · ${b.pages} pages · ${escapeHtml(b.language)} · ${b.year}</p>
            <div>
                <span class="stars">${starString(b.rating)}</span>
                <span class="rating-label">${b.rating > 0 ? `${b.rating.toFixed(1)} (${b.ratingCount})` : ""}</span>
            </div>
            <div class="rate-widget" data-id="${b.id}">
                Rate:
                ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-stars="${n}" aria-label="Rate ${n} stars">★</button>`).join("")}
            </div>
        </article>
    `).join("");

    els.count.textContent = `${visible.length} of ${state.books.length} books`;
    els.empty.hidden = visible.length > 0;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function updateControls() {
    els.minPages.value = state.minPages;
    els.minPagesInput.value = state.minPages;
    els.pages.value = state.maxPages;
    els.maxPagesInput.value = state.maxPages;
    els.rating.value = state.minRating;
    els.ratingValue.textContent = state.minRating === 0 ? "Any" : "★".repeat(state.minRating);
    els.year.value = state.minYear;
    els.yearInput.value = state.minYear;
}

function bindNumberInput(input, apply) {
    input.addEventListener("change", () => {
        const min = Number(input.min);
        const max = Number(input.max);
        let value = Number(input.value);
        if (!Number.isFinite(value)) value = min;
        apply(Math.min(Math.max(value, min), max));
        updateControls();
        render();
    });
}

function resetControls() {
    state.search = "";
    state.sort = "title";
    state.language = "";
    state.minPages = 1;
    state.maxPages = 1000;
    state.minRating = 0;
    state.minYear = Number(els.year.min);

    els.search.value = "";
    els.sort.value = "title";
    els.language.value = "";

    updateControls();
    render();
}

els.search.addEventListener("input", () => { state.search = els.search.value; render(); });
els.sort.addEventListener("change", () => { state.sort = els.sort.value; render(); });
els.language.addEventListener("change", () => { state.language = els.language.value; render(); });
els.minPages.addEventListener("input", () => { state.minPages = Number(els.minPages.value); updateControls(); render(); });
els.pages.addEventListener("input", () => { state.maxPages = Number(els.pages.value); updateControls(); render(); });
els.rating.addEventListener("input", () => { state.minRating = Number(els.rating.value); updateControls(); render(); });
els.year.addEventListener("input", () => { state.minYear = Number(els.year.value); updateControls(); render(); });
bindNumberInput(els.minPagesInput, (v) => { state.minPages = v; });
bindNumberInput(els.maxPagesInput, (v) => { state.maxPages = v; });
bindNumberInput(els.yearInput, (v) => { state.minYear = v; });
els.clearFilters.addEventListener("click", resetControls);
els.reset.addEventListener("click", resetControls);

els.grid.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-stars]");
    if (!button) return;
    const widget = button.closest(".rate-widget");
    const id = widget.dataset.id;
    try {
        const res = await fetch(`/api/books/${id}/rate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rating: Number(button.dataset.stars) }),
        });
        if (!res.ok) throw new Error();
        const { rating, ratingCount } = await res.json();
        const book = state.books.find((b) => b.id === Number(id));
        book.rating = rating;
        book.ratingCount = ratingCount;
        render();
    } catch {
        alert("Could not save your rating. Please try again.");
    }
});

async function init() {
    try {
        const res = await fetch("/api/books");
        if (!res.ok) throw new Error();
        const { books, languages } = await res.json();
        state.books = books;

        for (const lang of languages) {
            const option = document.createElement("option");
            option.value = lang;
            option.textContent = lang;
            els.language.appendChild(option);
        }

        const currentYear = new Date().getFullYear();
        els.year.max = currentYear;
        els.yearInput.min = els.year.min;
        els.yearInput.max = currentYear;
        state.minYear = Number(els.year.min);

        updateControls();
        render();
    } catch {
        els.count.textContent = "Could not load the catalog. Is the server running?";
    }
}

init();

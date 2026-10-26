const form = document.getElementById("bookForm");
const message = document.getElementById("formMessage");
const isbnInput = document.getElementById("isbnInput");
const isbnMessage = document.getElementById("isbnMessage");
const scanButton = document.getElementById("scanButton");
const lookupButton = document.getElementById("lookupButton");
const scannerBox = document.getElementById("scanner");
const scannerVideo = document.getElementById("scannerVideo");
const photoButton = document.getElementById("photoButton");
const barcodePhoto = document.getElementById("barcodePhoto");
let codeReader = null;

const LANGUAGE_NAMES = {
    eng: "English", spa: "Spanish", fre: "French", ger: "German",
    ita: "Italian", por: "Portuguese", dut: "Dutch", rus: "Russian",
    jpn: "Japanese", chi: "Chinese", swe: "Swedish", lat: "Latin",
};

function mapGenre(subjects) {
    const text = (subjects || []).join(" ").toLowerCase();
    for (const genre of ["Fantasy", "Science Fiction", "Mystery", "Classics", "Nonfiction", "Non-Fiction", "Fiction"]) {
        if (text.includes(genre.toLowerCase())) {
            return genre === "Non-Fiction" ? "Nonfiction" : genre;
        }
    }
    return null;
}

function setIsbnMessage(text, className) {
    isbnMessage.textContent = text;
    isbnMessage.className = className || "";
}

async function lookupIsbn(rawIsbn) {
    const isbn = rawIsbn.replace(/[^0-9Xx]/g, "");
    if (!/^\d{9}[\dXx]$/.test(isbn) && !/^\d{13}$/.test(isbn)) {
        setIsbnMessage("Enter a valid 10- or 13-digit ISBN.", "form-error");
        return;
    }

    setIsbnMessage("Looking up book details...");
    try {
        const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
        if (res.status === 404) {
            setIsbnMessage("No book found for that ISBN. Please fill in the details manually.", "form-error");
            return;
        }
        if (!res.ok) throw new Error();
        const book = await res.json();

        const names = await Promise.all((book.authors || []).map(async (a) => {
            try {
                const authorRes = await fetch(`https://openlibrary.org${a.key}.json`);
                return (await authorRes.json()).name;
            } catch {
                return null;
            }
        }));

        if (book.title) form.elements.title.value = book.title;
        const author = names.filter(Boolean).join(", ");
        if (author) form.elements.author.value = author;
        const pages = Number(book.number_of_pages);
        if (Number.isFinite(pages) && pages > 0) {
            form.elements.pages.value = Math.min(pages, 1000);
        }
        const yearMatch = String(book.publish_date || "").match(/\d{4}/);
        if (yearMatch) form.elements.year.value = yearMatch[0];
        const langKey = book.languages && book.languages[0] && book.languages[0].key;
        const langName = langKey && LANGUAGE_NAMES[langKey.split("/").pop()];
        if (langName) form.elements.language.value = langName;
        const genre = mapGenre(book.subjects);
        if (genre) form.elements.genre.value = genre;

        setIsbnMessage(`Filled in the details for "${book.title || isbn}". Double-check them and submit.`, "form-success");
    } catch {
        setIsbnMessage("Could not look up that ISBN. Please fill in the details manually.", "form-error");
    }
}

function isbnHints() {
    return new Map([
        [ZXing.DecodeHintType.POSSIBLE_FORMATS, [
            ZXing.BarcodeFormat.EAN_13,
            ZXing.BarcodeFormat.EAN_8,
            ZXing.BarcodeFormat.UPC_A,
            ZXing.BarcodeFormat.UPC_E,
        ]],
        [ZXing.DecodeHintType.TRY_HARDER, true],
    ]);
}

function stopScanner() {
    if (codeReader) {
        try { codeReader.reset(); } catch { /* ignore */ }
        codeReader = null;
    }
    scannerBox.hidden = true;
    scanButton.textContent = "Scan ISBN with camera";
}

async function toggleScanner() {
    if (codeReader) {
        stopScanner();
        return;
    }
    if (!window.isSecureContext) {
        setIsbnMessage("Camera scanning needs a secure (HTTPS) connection. Type the ISBN instead.", "form-error");
        return;
    }
    if (typeof ZXing === "undefined") {
        setIsbnMessage("The scanner failed to load. Type the ISBN instead.", "form-error");
        return;
    }

    scannerBox.hidden = false;
    codeReader = new ZXing.BrowserMultiFormatReader(isbnHints(), 300);
    let attempts = 0;
    try {
        await codeReader.decodeFromConstraints(
            { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } },
            scannerVideo,
            (result, err) => {
                if (result) {
                    const decoded = result.getText();
                    stopScanner();
                    isbnInput.value = decoded;
                    lookupIsbn(decoded);
                    return;
                }
                attempts += 1;
                if (err && typeof ZXing.NotFoundException !== "undefined" && !(err instanceof ZXing.NotFoundException)) {
                    setIsbnMessage("Barcode partly detected — hold it steady, square-on, about 15–25 cm away.");
                } else if (attempts % 20 === 0) {
                    setIsbnMessage(`Still scanning (attempt ${attempts}). Try brighter light and fill more of the view with the barcode.`);
                }
            }
        );
        scanButton.textContent = "Stop scanning";
        setIsbnMessage("Scanning — point the camera at the book's barcode.");
    } catch (e) {
        setIsbnMessage(`Camera error: ${(e && e.message) || e}. You can photograph the barcode or type the ISBN instead.`, "form-error");
        stopScanner();
    }
}

photoButton.addEventListener("click", () => barcodePhoto.click());
barcodePhoto.addEventListener("change", async () => {
    const file = barcodePhoto.files && barcodePhoto.files[0];
    barcodePhoto.value = "";
    if (!file) return;
    if (typeof ZXing === "undefined") {
        setIsbnMessage("The scanner failed to load. Type the ISBN instead.", "form-error");
        return;
    }
    setIsbnMessage("Reading the barcode from your photo...");
    const url = URL.createObjectURL(file);
    try {
        const reader = new ZXing.BrowserMultiFormatReader(isbnHints());
        const result = await reader.decodeFromImageUrl(url);
        const decoded = result.getText();
        isbnInput.value = decoded;
        lookupIsbn(decoded);
    } catch {
        setIsbnMessage("Couldn't read a barcode in that photo. Retake it sharp, square-on, and well lit — or type the ISBN.", "form-error");
    } finally {
        URL.revokeObjectURL(url);
    }
});

scanButton.addEventListener("click", toggleScanner);
lookupButton.addEventListener("click", () => lookupIsbn(isbnInput.value));
isbnInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        lookupIsbn(isbnInput.value);
    }
});

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
        isbn: isbnInput.value.replace(/[^0-9Xx]/g, ""),
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
        isbnInput.value = "";
        setIsbnMessage("");
    } catch {
        message.textContent = "Could not reach the server. Please try again.";
        message.className = "form-error";
    }
});

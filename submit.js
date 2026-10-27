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

const BARCODE_FORMATS = ["EAN-13", "EAN-8", "UPC-A", "UPC-E"];
const DECODER_URL = "https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/es/reader/index.js";
const DECODER_WASM_URL = "https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/reader/zxing_reader.wasm";

let decoderPromise = null;
let mediaStream = null;
let scanTimer = null;

function loadDecoder() {
    if (!decoderPromise) {
        decoderPromise = import(DECODER_URL).then((mod) => {
            mod.setZXingModuleOverrides({ locateFile: () => DECODER_WASM_URL });
            return mod;
        });
    }
    return decoderPromise;
}

function onScanned(decoded) {
    stopScanner();
    isbnInput.value = decoded;
    lookupIsbn(decoded);
}

function stopScanner() {
    if (scanTimer) {
        clearInterval(scanTimer);
        scanTimer = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
        scannerVideo.srcObject = null;
    }
    scannerBox.hidden = true;
    scanButton.textContent = "Scan ISBN with camera";
}

async function openCamera() {
    try {
        return await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
    } catch (e) {
        if (e && (e.name === "OverconstrainedError" || e.name === "NotFoundError")) {
            return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
        throw e;
    }
}

async function toggleScanner() {
    if (mediaStream) {
        stopScanner();
        return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices) {
        setIsbnMessage("Camera scanning needs a secure (HTTPS) connection. Photograph the barcode or type the ISBN instead.", "form-error");
        return;
    }

    setIsbnMessage("Starting the camera...");
    try {
        const { readBarcodesFromImageData } = await loadDecoder();
        mediaStream = await openCamera();
        scannerBox.hidden = false;
        scannerVideo.srcObject = mediaStream;
        await scannerVideo.play();

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        scanTimer = setInterval(async () => {
            if (scannerVideo.readyState < 2 || !scannerVideo.videoWidth) return;
            canvas.width = scannerVideo.videoWidth;
            canvas.height = scannerVideo.videoHeight;
            ctx.drawImage(scannerVideo, 0, 0);
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            try {
                const results = await readBarcodesFromImageData(frame, {
                    formats: BARCODE_FORMATS,
                    tryHarder: true,
                    maxNumberOfSymbols: 1,
                });
                if (results.length) onScanned(results[0].text);
            } catch { /* keep scanning */ }
        }, 400);

        scanButton.textContent = "Stop scanning";
        setIsbnMessage("Scanning — point the camera at the book's barcode.");
    } catch (e) {
        setIsbnMessage(`Camera error: ${(e && e.name) || ""} ${(e && e.message) || e}. You can photograph the barcode or type the ISBN instead.`, "form-error");
        stopScanner();
    }
}

photoButton.addEventListener("click", () => barcodePhoto.click());
barcodePhoto.addEventListener("change", async () => {
    const file = barcodePhoto.files && barcodePhoto.files[0];
    barcodePhoto.value = "";
    if (!file) return;
    setIsbnMessage("Reading the barcode from your photo...");
    try {
        const { readBarcodesFromImageFile } = await loadDecoder();
        const results = await readBarcodesFromImageFile(file, {
            formats: BARCODE_FORMATS,
            tryHarder: true,
            maxNumberOfSymbols: 1,
        });
        if (!results.length) throw new Error("no barcode found");
        onScanned(results[0].text);
    } catch {
        setIsbnMessage("Couldn't read a barcode in that photo. Retake it sharp, square-on, and well lit — or type the ISBN.", "form-error");
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

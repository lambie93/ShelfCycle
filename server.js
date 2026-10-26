// ShelfCycle server — serves the static site and the book catalog API.
//
// Admin password: set the ADMIN_PASSWORD environment variable, or the
// default "shelfcycle-admin" is used (change it before exposing this
// server to anyone). Admin sessions are in-memory tokens and are lost
// on restart.

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "shelfcycle-admin";
const DATA_FILE = path.join(__dirname, "data", "books.json");

app.use(express.json());
app.use(express.static(__dirname));

const EXCHANGE_TYPES = ["Give away", "Lend", "Donate to school"];

const adminTokens = new Set();

function readBooks() {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")).books;
}

function writeBooks(books) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ books }, null, 2) + "\n");
}

function requireAdmin(req, res, next) {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    if (match && adminTokens.has(match[1])) {
        return next();
    }
    res.status(401).json({ error: "Unauthorized" });
}

// Public: approved books plus metadata for the filter controls.
app.get("/api/books", (req, res) => {
    const books = readBooks().filter((b) => b.status === "approved");
    const languages = [...new Set(books.map((b) => b.language))].sort();
    const minYear = books.length ? Math.min(...books.map((b) => b.year)) : 1900;
    res.json({ books, languages, minYear });
});

// Public: suggest a new book (goes to the pending queue).
app.post("/api/books", (req, res) => {
    const { title, author, genre, pages, language, year, rating, exchangeType, isbn } = req.body || {};

    if (!title || !title.trim() || !author || !author.trim()) {
        return res.status(400).json({ error: "Title and author are required." });
    }
    const isbnClean = String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
    if (isbnClean && !/^\d{9}[\dX]$/.test(isbnClean) && !/^\d{13}$/.test(isbnClean)) {
        return res.status(400).json({ error: "ISBN must be a valid 10- or 13-digit code." });
    }
    const pagesNum = Number(pages);
    if (!Number.isInteger(pagesNum) || pagesNum < 1 || pagesNum > 1000) {
        return res.status(400).json({ error: "Pages must be a whole number between 1 and 1000." });
    }
    const yearNum = Number(year);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(yearNum) || yearNum < 0 || yearNum > currentYear) {
        return res.status(400).json({ error: `Year must be between 0 and ${currentYear}.` });
    }
    let ratingNum = Number(rating);
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        ratingNum = 0; // unrated
    }

    const books = readBooks();
    const book = {
        id: books.length ? Math.max(...books.map((b) => b.id)) + 1 : 1,
        title: title.trim(),
        author: author.trim(),
        genre: (genre || "Fiction").trim(),
        pages: pagesNum,
        language: (language || "English").trim(),
        year: yearNum,
        rating: ratingNum,
        ratingCount: ratingNum > 0 ? 1 : 0,
        exchangeType: EXCHANGE_TYPES.includes(exchangeType) ? exchangeType : "Lend",
        status: "pending",
    };
    if (isbnClean) book.isbn = isbnClean;
    books.push(book);
    writeBooks(books);
    res.status(201).json({ message: "Book submitted for review.", book });
});

// Public: add a community rating to a book.
app.post("/api/books/:id/rate", (req, res) => {
    const ratingNum = Number(req.body && req.body.rating);
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5." });
    }
    const books = readBooks();
    const book = books.find((b) => b.id === Number(req.params.id) && b.status === "approved");
    if (!book) {
        return res.status(404).json({ error: "Book not found." });
    }
    book.rating = Math.round(
        ((book.rating * book.ratingCount + ratingNum) / (book.ratingCount + 1)) * 10
    ) / 10;
    book.ratingCount += 1;
    writeBooks(books);
    res.json({ rating: book.rating, ratingCount: book.ratingCount });
});

// Admin: log in, returns a bearer token.
app.post("/api/admin/login", (req, res) => {
    if ((req.body || {}).password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Incorrect password." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    adminTokens.add(token);
    res.json({ token });
});

// Admin: list pending books.
app.get("/api/admin/pending", requireAdmin, (req, res) => {
    res.json({ books: readBooks().filter((b) => b.status === "pending") });
});

// Admin: approve a pending book.
app.post("/api/admin/books/:id/approve", requireAdmin, (req, res) => {
    const books = readBooks();
    const book = books.find((b) => b.id === Number(req.params.id) && b.status === "pending");
    if (!book) {
        return res.status(404).json({ error: "Pending book not found." });
    }
    book.status = "approved";
    writeBooks(books);
    res.json({ message: `"${book.title}" approved.`, book });
});

// Admin: reject (delete) a pending book.
app.post("/api/admin/books/:id/reject", requireAdmin, (req, res) => {
    const books = readBooks();
    const index = books.findIndex((b) => b.id === Number(req.params.id) && b.status === "pending");
    if (index === -1) {
        return res.status(404).json({ error: "Pending book not found." });
    }
    const [removed] = books.splice(index, 1);
    writeBooks(books);
    res.json({ message: `"${removed.title}" rejected.` });
});

// Old location of the catalog page — redirect for stale bookmarks.
app.get("/catalog/catalog.html", (req, res) => res.redirect("/catalog.html"));

app.listen(PORT, () => {
    console.log(`ShelfCycle running at http://localhost:${PORT}`);
    console.log(`Admin page: http://localhost:${PORT}/admin.html`);
});

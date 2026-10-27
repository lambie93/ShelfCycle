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
    const { title, author, genre, pages, language, year, exchangeType, isbn } = req.body || {};

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
    const books = readBooks();
    const book = {
        id: books.length ? Math.max(...books.map((b) => b.id)) + 1 : 1,
        title: title.trim(),
        author: author.trim(),
        genre: (genre || "Fiction").trim(),
        pages: pagesNum,
        language: (language || "English").trim(),
        year: yearNum,
        rating: 0,
        ratingCount: 0,
        exchangeType: EXCHANGE_TYPES.includes(exchangeType) ? exchangeType : "Lend",
        status: "pending",
    };
    if (isbnClean) book.isbns = [isbnClean];
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

/* ---------------- User accounts ---------------- */

const USERS_FILE = path.join(__dirname, "data", "users.json");
const EXCHANGES_FILE = path.join(__dirname, "data", "exchanges.json");
const DONATIONS_FILE = path.join(__dirname, "data", "donations.json");

function readJsonFile(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function readUsers() { return readJsonFile(USERS_FILE, { users: [] }).users; }
function writeUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2) + "\n"); }
function readExchanges() { return readJsonFile(EXCHANGES_FILE, { exchanges: [] }).exchanges; }
function writeExchanges(exchanges) { fs.writeFileSync(EXCHANGES_FILE, JSON.stringify({ exchanges }, null, 2) + "\n"); }
function readDonations() { return readJsonFile(DONATIONS_FILE, { donations: [] }).donations; }
function writeDonations(donations) { fs.writeFileSync(DONATIONS_FILE, JSON.stringify({ donations }, null, 2) + "\n"); }

function hashPassword(password, salt) {
    return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function publicBook(b) {
    return b ? { id: b.id, title: b.title, author: b.author, genre: b.genre, pages: b.pages, year: b.year } : null;
}

function publicUser(user) {
    const byId = new Map(readBooks().map((b) => [b.id, b]));
    const idList = (ids) => ids.map((id) => publicBook(byId.get(id))).filter(Boolean);
    const entryList = (entries) =>
        entries.map((e) => ({ ...e, book: publicBook(byId.get(e.bookId)) })).filter((e) => e.book);
    return {
        id: user.id,
        username: user.username,
        joinedAt: user.joinedAt,
        favoriteBook: user.favoriteBook,
        challenge: user.challenge,
        lists: {
            wantToRead: idList(user.lists.wantToRead),
            currentlyReading: entryList(user.lists.currentlyReading),
            finished: entryList(user.lists.finished),
            didNotFinish: idList(user.lists.didNotFinish),
            favorites: idList(user.lists.favorites),
            assigned: idList(user.lists.assigned),
        },
    };
}

function requireUser(req, res, next) {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    const user = match && readUsers().find((u) => u.token && u.token === match[1]);
    if (user) {
        req.user = user;
        return next();
    }
    res.status(401).json({ error: "Not logged in." });
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

app.post("/api/signup", (req, res) => {
    const { username, password } = req.body || {};
    const name = String(username || "").trim();
    if (!/^[A-Za-z0-9_.-]{3,20}$/.test(name)) {
        return res.status(400).json({ error: "Username must be 3-20 characters: letters, numbers, . _ or -." });
    }
    if (String(password || "").length < 4) {
        return res.status(400).json({ error: "Password must be at least 4 characters." });
    }
    const users = readUsers();
    if (users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
        return res.status(409).json({ error: "That username is taken." });
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const user = {
        id: users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1,
        username: name,
        salt,
        passwordHash: hashPassword(password, salt),
        token: crypto.randomBytes(32).toString("hex"),
        joinedAt: today(),
        favoriteBook: "",
        challenge: { year: new Date().getFullYear(), goal: 12 },
        lists: { wantToRead: [], currentlyReading: [], finished: [], didNotFinish: [], favorites: [], assigned: [] },
    };
    users.push(user);
    writeUsers(users);
    res.status(201).json({ token: user.token, user: publicUser(user) });
});

app.post("/api/login", (req, res) => {
    const { username, password } = req.body || {};
    const users = readUsers();
    const user = users.find((u) => u.username.toLowerCase() === String(username || "").trim().toLowerCase());
    const hash = user ? hashPassword(password, user.salt) : "";
    if (!user || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash))) {
        return res.status(401).json({ error: "Incorrect username or password." });
    }
    user.token = crypto.randomBytes(32).toString("hex");
    writeUsers(users);
    res.json({ token: user.token, user: publicUser(user) });
});

app.post("/api/logout", requireUser, (req, res) => {
    const users = readUsers();
    const user = users.find((u) => u.id === req.user.id);
    user.token = null;
    writeUsers(users);
    res.json({ message: "Logged out." });
});

app.get("/api/me", requireUser, (req, res) => {
    res.json({ user: publicUser(req.user) });
});

app.put("/api/me", requireUser, (req, res) => {
    const users = readUsers();
    const user = users.find((u) => u.id === req.user.id);
    if (typeof (req.body || {}).favoriteBook === "string") {
        user.favoriteBook = req.body.favoriteBook.trim().slice(0, 200);
    }
    writeUsers(users);
    res.json({ user: publicUser(user) });
});

app.put("/api/me/challenge", requireUser, (req, res) => {
    const goal = Number((req.body || {}).goal);
    if (!Number.isInteger(goal) || goal < 1 || goal > 500) {
        return res.status(400).json({ error: "Goal must be a whole number between 1 and 500." });
    }
    const users = readUsers();
    const user = users.find((u) => u.id === req.user.id);
    user.challenge = { year: new Date().getFullYear(), goal };
    writeUsers(users);
    res.json({ user: publicUser(user) });
});

const LIST_NAMES = ["wantToRead", "currentlyReading", "finished", "didNotFinish", "favorites", "assigned"];
const ID_LISTS = ["wantToRead", "didNotFinish", "favorites", "assigned"];

function listContains(list, value, bookId) {
    return ID_LISTS.includes(list) ? value.includes(bookId) : value.some((e) => e.bookId === bookId);
}

function addToList(user, list, bookId, totalPages) {
    const target = user.lists[list];
    if (listContains(list, target, bookId)) return;
    if (list === "currentlyReading") {
        const total = Number(totalPages);
        target.push({ bookId, pagesRead: 0, totalPages: Number.isInteger(total) && total > 0 ? total : 0 });
    } else if (list === "finished") {
        target.push({ bookId, finishedAt: today() });
    } else {
        target.push(bookId);
    }
}

function removeFromList(user, list, bookId) {
    if (ID_LISTS.includes(list)) {
        user.lists[list] = user.lists[list].filter((id) => id !== bookId);
    } else {
        user.lists[list] = user.lists[list].filter((e) => e.bookId !== bookId);
    }
}

app.post("/api/me/lists", requireUser, (req, res) => {
    const { list, bookId, totalPages } = req.body || {};
    const id = Number(bookId);
    if (!LIST_NAMES.includes(list)) {
        return res.status(400).json({ error: "Unknown list." });
    }
    const book = readBooks().find((b) => b.id === id && b.status === "approved");
    if (!book) {
        return res.status(404).json({ error: "Book not found in the catalog." });
    }
    const users = readUsers();
    const user = users.find((u) => u.id === req.user.id);
    addToList(user, list, id, totalPages || book.pages);
    writeUsers(users);
    res.json({ user: publicUser(user) });
});

app.delete("/api/me/lists/:list/:bookId", requireUser, (req, res) => {
    const { list } = req.params;
    const id = Number(req.params.bookId);
    if (!LIST_NAMES.includes(list)) {
        return res.status(400).json({ error: "Unknown list." });
    }
    const users = readUsers();
    const user = users.find((u) => u.id === req.user.id);
    removeFromList(user, list, id);
    writeUsers(users);
    res.json({ user: publicUser(user) });
});

app.post("/api/me/lists/move", requireUser, (req, res) => {
    const { from, to, bookId } = req.body || {};
    const id = Number(bookId);
    if (!LIST_NAMES.includes(from) || !LIST_NAMES.includes(to) || from === to) {
        return res.status(400).json({ error: "Unknown list." });
    }
    const users = readUsers();
    const user = users.find((u) => u.id === req.user.id);
    if (!listContains(from, user.lists[from], id)) {
        return res.status(404).json({ error: "Book is not in that list." });
    }
    let totalPages;
    if (from === "currentlyReading") {
        totalPages = (user.lists.currentlyReading.find((e) => e.bookId === id) || {}).totalPages;
    }
    removeFromList(user, from, id);
    addToList(user, to, id, totalPages);
    writeUsers(users);
    res.json({ user: publicUser(user) });
});

app.put("/api/me/progress", requireUser, (req, res) => {
    const { bookId, pagesRead, totalPages } = req.body || {};
    const id = Number(bookId);
    const users = readUsers();
    const user = users.find((u) => u.id === req.user.id);
    const entry = user.lists.currentlyReading.find((e) => e.bookId === id);
    if (!entry) {
        return res.status(404).json({ error: "Book is not in your currently reading list." });
    }
    const total = Number(totalPages);
    if (Number.isInteger(total) && total > 0) {
        entry.totalPages = total;
    }
    const read = Number(pagesRead);
    if (Number.isInteger(read) && read >= 0) {
        entry.pagesRead = Math.min(read, entry.totalPages || read);
    }
    writeUsers(users);
    res.json({ user: publicUser(user) });
});

/* ---------------- Swaps & lending ---------------- */

function publicExchange(e, users, books) {
    const owner = users.find((u) => u.id === e.ownerId);
    const requester = e.requesterId ? users.find((u) => u.id === e.requesterId) : null;
    const book = publicBook(books.find((b) => b.id === e.bookId));
    if (!book || !owner) return null;
    return {
        id: e.id,
        type: e.type,
        status: e.status,
        createdAt: e.createdAt,
        book,
        ownerId: e.ownerId,
        owner: owner.username,
        requesterId: e.requesterId,
        requester: requester ? requester.username : null,
    };
}

app.get("/api/exchanges", (req, res) => {
    const users = readUsers();
    const books = readBooks().filter((b) => b.status === "approved");
    const exchanges = readExchanges()
        .map((e) => publicExchange(e, users, books))
        .filter(Boolean);
    res.json({ exchanges });
});

app.post("/api/exchanges", requireUser, (req, res) => {
    const { bookId, type } = req.body || {};
    const id = Number(bookId);
    if (!["swap", "lend"].includes(type)) {
        return res.status(400).json({ error: "Type must be swap or lend." });
    }
    if (!readBooks().some((b) => b.id === id && b.status === "approved")) {
        return res.status(404).json({ error: "Book not found in the catalog." });
    }
    const exchanges = readExchanges();
    if (exchanges.some((e) => e.ownerId === req.user.id && e.bookId === id && e.type === type)) {
        return res.status(409).json({ error: "You already listed that book." });
    }
    const exchange = {
        id: exchanges.length ? Math.max(...exchanges.map((e) => e.id)) + 1 : 1,
        bookId: id,
        ownerId: req.user.id,
        type,
        status: "available",
        requesterId: null,
        createdAt: today(),
    };
    exchanges.push(exchange);
    writeExchanges(exchanges);
    res.status(201).json({ exchange: publicExchange(exchange, readUsers(), readBooks()) });
});

function findExchange(req, res) {
    const exchanges = readExchanges();
    const exchange = exchanges.find((e) => e.id === Number(req.params.id));
    if (!exchange) {
        res.status(404).json({ error: "Listing not found." });
        return null;
    }
    return { exchanges, exchange };
}

app.post("/api/exchanges/:id/request", requireUser, (req, res) => {
    const found = findExchange(req, res);
    if (!found) return;
    const { exchanges, exchange } = found;
    if (exchange.ownerId === req.user.id) {
        return res.status(400).json({ error: "That is your own listing." });
    }
    if (exchange.status !== "available") {
        return res.status(409).json({ error: "That listing is not available." });
    }
    exchange.status = "requested";
    exchange.requesterId = req.user.id;
    writeExchanges(exchanges);
    res.json({ message: "Request sent." });
});

app.post("/api/exchanges/:id/cancel", requireUser, (req, res) => {
    const found = findExchange(req, res);
    if (!found) return;
    const { exchanges, exchange } = found;
    if (exchange.requesterId !== req.user.id || exchange.status !== "requested") {
        return res.status(403).json({ error: "Only the requester can cancel a pending request." });
    }
    exchange.status = "available";
    exchange.requesterId = null;
    writeExchanges(exchanges);
    res.json({ message: "Request cancelled." });
});

app.post("/api/exchanges/:id/accept", requireUser, (req, res) => {
    const found = findExchange(req, res);
    if (!found) return;
    const { exchanges, exchange } = found;
    if (exchange.ownerId !== req.user.id || exchange.status !== "requested") {
        return res.status(403).json({ error: "Only the owner can accept a pending request." });
    }
    exchange.status = "active";
    writeExchanges(exchanges);
    res.json({ message: "Request accepted." });
});

app.post("/api/exchanges/:id/decline", requireUser, (req, res) => {
    const found = findExchange(req, res);
    if (!found) return;
    const { exchanges, exchange } = found;
    if (exchange.ownerId !== req.user.id || exchange.status !== "requested") {
        return res.status(403).json({ error: "Only the owner can decline a pending request." });
    }
    exchange.status = "available";
    exchange.requesterId = null;
    writeExchanges(exchanges);
    res.json({ message: "Request declined." });
});

app.post("/api/exchanges/:id/complete", requireUser, (req, res) => {
    const found = findExchange(req, res);
    if (!found) return;
    const { exchanges, exchange } = found;
    if (exchange.ownerId !== req.user.id || exchange.status !== "active") {
        return res.status(403).json({ error: "Only the owner can complete an active exchange." });
    }
    writeExchanges(exchanges.filter((e) => e.id !== exchange.id));
    res.json({ message: exchange.type === "lend" ? "Book marked as returned." : "Swap completed." });
});

app.delete("/api/exchanges/:id", requireUser, (req, res) => {
    const found = findExchange(req, res);
    if (!found) return;
    const { exchanges, exchange } = found;
    if (exchange.ownerId !== req.user.id) {
        return res.status(403).json({ error: "Only the owner can remove a listing." });
    }
    writeExchanges(exchanges.filter((e) => e.id !== exchange.id));
    res.json({ message: "Listing removed." });
});

/* ---------------- School donations ---------------- */

app.get("/api/donations", (req, res) => {
    res.json({ donations: readDonations().slice().reverse() });
});

app.post("/api/donations", requireUser, (req, res) => {
    const { title, author, school } = req.body || {};
    if (!title || !title.trim() || !author || !author.trim() || !school || !school.trim()) {
        return res.status(400).json({ error: "Title, author, and school are all required." });
    }
    const donations = readDonations();
    const donation = {
        id: donations.length ? Math.max(...donations.map((d) => d.id)) + 1 : 1,
        title: title.trim().slice(0, 200),
        author: author.trim().slice(0, 200),
        school: school.trim().slice(0, 200),
        username: req.user.username,
        donatedAt: today(),
    };
    donations.push(donation);
    writeDonations(donations);
    res.status(201).json({ donation });
});

/* ---------------- Feature requests ---------------- */

const FEATURES_FILE = path.join(__dirname, "data", "features.json");

function readFeatures() { return readJsonFile(FEATURES_FILE, { features: [] }).features; }
function writeFeatures(features) { fs.writeFileSync(FEATURES_FILE, JSON.stringify({ features }, null, 2) + "\n"); }

app.post("/api/features", (req, res) => {
    const text = String((req.body || {}).text || "").trim();
    if (text.length < 3) {
        return res.status(400).json({ error: "Please describe the feature." });
    }
    const features = readFeatures();
    features.push({
        id: features.length ? Math.max(...features.map((f) => f.id)) + 1 : 1,
        text: text.slice(0, 1000),
        createdAt: today(),
    });
    writeFeatures(features);
    res.status(201).json({ message: "Thanks for the suggestion!" });
});

// Old location of the catalog page — redirect for stale bookmarks.
app.get("/catalog/catalog.html", (req, res) => res.redirect("/catalog.html"));

app.listen(PORT, () => {
    console.log(`ShelfCycle running at http://localhost:${PORT}`);
    console.log(`Admin page: http://localhost:${PORT}/admin.html`);
});

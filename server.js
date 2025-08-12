const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database("./events.db");

// Create tables if not exist
db.prepare(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  is_cancelled INTEGER DEFAULT 0
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  UNIQUE(event_id, email),
  FOREIGN KEY (event_id) REFERENCES events(id)
)`).run();

// Create Event
app.post("/api/events", (req, res) => {
  const { name, date, capacity } = req.body;
  if (!name || !date || !capacity) return res.status(400).json({ error: "Missing fields" });
  if (new Date(date) <= new Date()) return res.status(400).json({ error: "Date must be in the future" });

  const stmt = db.prepare("INSERT INTO events (name, date, capacity) VALUES (?, ?, ?)");
  const info = stmt.run(name, date, capacity);
  res.json({ id: info.lastInsertRowid, name, date, capacity });
});

// Get Events (with filters & sorting)
app.get("/api/events", (req, res) => {
  let { search, sort, page, limit } = req.query;
  search = search ? `%${search}%` : "%%";
  sort = sort === "date" ? "date" : "name";
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 5;
  const offset = (page - 1) * limit;

  const events = db.prepare(
    `SELECT * FROM events WHERE name LIKE ? ORDER BY ${sort} LIMIT ? OFFSET ?`
  ).all(search, limit, offset);

  res.json(events);
});

// Register Attendee
app.post("/api/events/:id/register", (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.is_cancelled) return res.status(400).json({ error: "Event cancelled" });

  const count = db.prepare("SELECT COUNT(*) AS total FROM registrations WHERE event_id = ?").get(id).total;
  if (count >= event.capacity) return res.status(400).json({ error: "Event full" });

  try {
    db.prepare("INSERT INTO registrations (event_id, name, email) VALUES (?, ?, ?)").run(id, name, email);
    res.json({ message: "Registered successfully" });
  } catch (err) {
    res.status(400).json({ error: "Duplicate email for this event" });
  }
});

// Cancel Event
app.post("/api/events/:id/cancel", (req, res) => {
  const { id } = req.params;
  db.prepare("UPDATE events SET is_cancelled = 1 WHERE id = ?").run(id);
  res.json({ message: "Event cancelled" });
});

// Event Stats
app.get("/api/events/:id/stats", (req, res) => {
  const { id } = req.params;
  const totalRegs = db.prepare("SELECT COUNT(*) AS total FROM registrations WHERE event_id = ?").get(id).total;
  res.json({ registrations: totalRegs });
});

app.listen(3000, () => console.log("✅ Server running on port 3000"));

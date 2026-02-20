import Database from "@tauri-apps/plugin-sql";
import { documentDir, join } from "@tauri-apps/api/path"; // v2 pathing
// import { readTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";v2 filesystem

export async function setupDb() {
  try {
    // 1. Construct the path to the file created by your Rust backend
    const docsPath = await documentDir();
    const dbPath = await join(docsPath, "O-neash-data", "oneash-DB.db");

    // 2. Connect to the database
    // We use load() because the directory is already guaranteed by lib.rs
    const db = await Database.load(`sqlite:${dbPath}`);

    // 3. Enable Foreign Key support (Critical for your many-to-many links)
    await db.execute("PRAGMA foreign_keys = ON;");

    // 4. Always apply the schema to ensure new tables/columns are created
    const schemaSql = `
    CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        title TEXT,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS junc_note_tags (
        note_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (note_id, tag_id),
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS todo_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER, -- Links subtasks
        group_id INTEGER,
        task TEXT NOT NULL,
        is_completed BOOLEAN DEFAULT 0,
        priority INTEGER CHECK (priority BETWEEN 1 AND 5),
        is_urgent BOOLEAN DEFAULT 0, -- For Eisenhower Matrix
        is_important BOOLEAN DEFAULT 0, -- For Eisenhower Matrix
        due_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES todo_items(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS scratchpad (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        one_liner TEXT,
        goal_week INTEGER
    );

    CREATE TABLE IF NOT EXISTS habit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id INTEGER,
        log_date DATE DEFAULT (DATE('now')),
        status BOOLEAN,
        value INTEGER,
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sleep_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time TIMESTAMP,
        wake_time TIMESTAMP,
        total_sleep DECIMAL
    );

    CREATE TABLE IF NOT EXISTS journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_date DATE DEFAULT (DATE('now')),
        content TEXT,
        mood_rating INTEGER,
        energy_level INTEGER
    );

    CREATE TABLE IF NOT EXISTS trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trip_pins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER,
        type TEXT, -- trip/bucketlist
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        date TIMESTAMP,
        FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pin_id INTEGER,
        content TEXT,
        FOREIGN KEY (pin_id) REFERENCES trip_pins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pin_id INTEGER,
        path TEXT NOT NULL, -- Path to /0-neash-data/photos/
        FOREIGN KEY (pin_id) REFERENCES trip_pins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        one_liner TEXT,
        goal_week INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_scratchpad_date ON scratchpad(created_at);
    CREATE INDEX IF NOT EXISTS idx_habit_log_date ON habit_log(log_date);
    CREATE INDEX IF NOT EXISTS idx_trip_pins_id ON trip_pins(trip_id);
    CREATE INDEX IF NOT EXISTS idx_travel_images_pin ON travel_images(pin_id);
    CREATE INDEX IF NOT EXISTS idx_todo_group ON todo_items(group_id);
    CREATE INDEX IF NOT EXISTS idx_notes_group ON notes(group_id);
    `;
    
    // Apply the full schema every time
    await db.execute(schemaSql);
    console.log("Schema applied/updated successfully.");

    return db;
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}
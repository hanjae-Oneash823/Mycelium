import Database from "@tauri-apps/plugin-sql";
import { documentDir, join } from "@tauri-apps/api/path"; // v2 pathing
// import { readTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";v2 filesystem

let _db: Database | null = null;

export async function setupDb(): Promise<Database> {
  try {
    // 1. Construct the path to the file created by your Rust backend
    const docsPath = await documentDir();
    const dbPath = await join(docsPath, "O-neash-data", "oneash-DB.db");

    // 2. Connect to the database
    // We use load() because the directory is already guaranteed by lib.rs
    const db = await Database.load(`sqlite:${dbPath}`);
    _db = db;

    // 3. Enable Foreign Key support (Critical for your many-to-many links)
    await db.execute("PRAGMA foreign_keys = ON;");

    // 4. Always apply the schema to ensure new tables/columns are created
    const schemaSql = `

  -- ─────────────────── PLANNER PLUGIN ───────────────────────────────────────

  CREATE TABLE IF NOT EXISTS arcs (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color_hex   TEXT DEFAULT '#00c4a7',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    arc_id      TEXT,
    name        TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(arc_id) REFERENCES arcs(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS planner_groups (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    color_hex      TEXT DEFAULT '#64c8ff',
    sort_order     INTEGER DEFAULT 0,
    is_ungrouped   BOOLEAN DEFAULT 0,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO planner_groups(id, name, color_hex, sort_order, is_ungrouped)
  VALUES('g-ungrouped', 'ungrouped', '#444444', 99, 1);

  CREATE TABLE IF NOT EXISTS nodes (
    id                          TEXT PRIMARY KEY,
    project_id                  TEXT,
    arc_id                      TEXT,
    title                       TEXT NOT NULL,
    node_type                   TEXT NOT NULL DEFAULT 'task'
                                    CHECK(node_type IN('task','event')),
    planned_start_at            DATETIME,
    due_at                      DATETIME,
    actual_completed_at         DATETIME,
    estimated_duration_minutes  INTEGER,
    importance_level            INTEGER NOT NULL DEFAULT 0
                                    CHECK(importance_level BETWEEN 0 AND 4),
    computed_urgency_level      INTEGER NOT NULL DEFAULT 0
                                    CHECK(computed_urgency_level BETWEEN 0 AND 4),
    is_completed                BOOLEAN DEFAULT 0,
    is_locked                   BOOLEAN DEFAULT 0,
    is_overdue                  BOOLEAN DEFAULT 0,
    is_pinned                   BOOLEAN DEFAULT 0,
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_routine                  INTEGER DEFAULT 0,
    routine_id                  TEXT,
    FOREIGN KEY(project_id)     REFERENCES projects(id)  ON DELETE SET NULL,
    FOREIGN KEY(arc_id)         REFERENCES arcs(id)      ON DELETE SET NULL,
    FOREIGN KEY(routine_id)     REFERENCES routines(id)  ON DELETE SET NULL
  );

  CREATE TRIGGER IF NOT EXISTS nodes_ts AFTER UPDATE ON nodes
  BEGIN
    UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

  CREATE TABLE IF NOT EXISTS node_groups (
    node_id   TEXT NOT NULL,
    group_id  TEXT NOT NULL,
    PRIMARY KEY(node_id, group_id),
    FOREIGN KEY(node_id)  REFERENCES nodes(id)           ON DELETE CASCADE,
    FOREIGN KEY(group_id) REFERENCES planner_groups(id)  ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ng_node  ON node_groups(node_id);
  CREATE INDEX IF NOT EXISTS idx_ng_group ON node_groups(group_id);

  CREATE TRIGGER IF NOT EXISTS nodes_auto_ungrouped AFTER INSERT ON nodes
  BEGIN
    INSERT OR IGNORE INTO node_groups(node_id, group_id)
    SELECT NEW.id, id FROM planner_groups WHERE is_ungrouped = 1 LIMIT 1;
  END;

  CREATE TRIGGER IF NOT EXISTS remove_ungrouped AFTER INSERT ON node_groups
  BEGIN
    DELETE FROM node_groups
    WHERE node_id = NEW.node_id
      AND group_id = (SELECT id FROM planner_groups WHERE is_ungrouped = 1)
      AND NEW.group_id != (SELECT id FROM planner_groups WHERE is_ungrouped = 1);
  END;

  CREATE TRIGGER IF NOT EXISTS readd_ungrouped_if_empty AFTER DELETE ON node_groups
  BEGIN
    INSERT OR IGNORE INTO node_groups(node_id, group_id)
    SELECT OLD.node_id, id FROM planner_groups
    WHERE is_ungrouped = 1
      AND EXISTS (SELECT 1 FROM nodes WHERE id = OLD.node_id)
      AND NOT EXISTS (
        SELECT 1 FROM node_groups WHERE node_id = OLD.node_id
      );
  END;

  CREATE TABLE IF NOT EXISTS sub_tasks (
    id           TEXT PRIMARY KEY,
    node_id      TEXT NOT NULL,
    title        TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT 0,
    sort_order   INTEGER DEFAULT 0,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_subtasks_node ON sub_tasks(node_id);

  CREATE TABLE IF NOT EXISTS productivity_logs (
    id              TEXT PRIMARY KEY,
    node_id         TEXT,
    completed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_actual INTEGER,
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS user_capacity (
    id            TEXT PRIMARY KEY DEFAULT 'default',
    daily_minutes INTEGER DEFAULT 480,
    peak_start    TEXT DEFAULT '09:00',
    peak_end      TEXT DEFAULT '12:00',
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO user_capacity(id, daily_minutes, peak_start, peak_end)
  VALUES('default', 480, '09:00', '12:00');

  CREATE INDEX IF NOT EXISTS idx_nodes_project   ON nodes(project_id);
  CREATE INDEX IF NOT EXISTS idx_nodes_arc       ON nodes(arc_id);
  CREATE INDEX IF NOT EXISTS idx_nodes_due       ON nodes(due_at);
  CREATE INDEX IF NOT EXISTS idx_nodes_planned   ON nodes(planned_start_at);
  CREATE INDEX IF NOT EXISTS idx_nodes_completed ON nodes(is_completed);
  CREATE INDEX IF NOT EXISTS idx_nodes_overdue   ON nodes(is_overdue);
  CREATE INDEX IF NOT EXISTS idx_projects_arc    ON projects(arc_id);

  CREATE TABLE IF NOT EXISTS tendril_edges (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    source_id   TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(source_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY(target_id) REFERENCES nodes(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_te_project ON tendril_edges(project_id);

  -- ─────────────────── ROUTINES ─────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS routines (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    node_type        TEXT NOT NULL DEFAULT 'task'
                         CHECK(node_type IN('task','event')),
    arc_id           TEXT,
    project_id       TEXT,
    importance_level INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(arc_id)     REFERENCES arcs(id)     ON DELETE SET NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS routine_rules (
    id               TEXT PRIMARY KEY,
    routine_id       TEXT NOT NULL,
    sort_order       INTEGER DEFAULT 0,
    freq             TEXT NOT NULL DEFAULT 'weekly'
                         CHECK(freq IN('daily','weekly','monthly','manual')),
    repeat_interval  INTEGER NOT NULL DEFAULT 1,
    days             TEXT,
    start_date       TEXT NOT NULL,
    end_mode         TEXT NOT NULL DEFAULT 'count'
                         CHECK(end_mode IN('count','date')),
    end_count        INTEGER,
    end_date         TEXT,
    start_time       TEXT,
    duration_minutes INTEGER,
    exceptions       TEXT,
    FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_routine_rules_routine ON routine_rules(routine_id);

  CREATE TABLE IF NOT EXISTS routine_groups (
    routine_id  TEXT NOT NULL,
    group_id    TEXT NOT NULL,
    PRIMARY KEY (routine_id, group_id),
    FOREIGN KEY (routine_id) REFERENCES routines(id)         ON DELETE CASCADE,
    FOREIGN KEY (group_id)   REFERENCES planner_groups(id)   ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_rg_routine ON routine_groups(routine_id);
  CREATE INDEX IF NOT EXISTS idx_rg_group   ON routine_groups(group_id);

  CREATE INDEX IF NOT EXISTS idx_routines_arc     ON routines(arc_id);
  CREATE INDEX IF NOT EXISTS idx_routines_project ON routines(project_id);

  CREATE TRIGGER IF NOT EXISTS routines_ts AFTER UPDATE ON routines
  BEGIN
    UPDATE routines SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

  -- ─────────────────── NOTES PLUGIN ────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS notes (
    id            TEXT PRIMARY KEY,
    note_type     TEXT NOT NULL DEFAULT 'memo'
                      CHECK(note_type IN('memo','document')),
    title         TEXT,
    content_plain TEXT,
    content_json  TEXT,
    status        TEXT NOT NULL DEFAULT 'active'
                      CHECK(status IN('active','archived')),
    arc_id        TEXT,
    project_id    TEXT,
    pinned        BOOLEAN NOT NULL DEFAULT 0,
    color_hex     TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(arc_id)     REFERENCES arcs(id)     ON DELETE SET NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
  );

  CREATE TRIGGER IF NOT EXISTS notes_ts AFTER UPDATE ON notes
  BEGIN
    UPDATE notes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

  CREATE TABLE IF NOT EXISTS note_groups (
    note_id   TEXT NOT NULL,
    group_id  TEXT NOT NULL,
    PRIMARY KEY(note_id, group_id),
    FOREIGN KEY(note_id)  REFERENCES notes(id)          ON DELETE CASCADE,
    FOREIGN KEY(group_id) REFERENCES planner_groups(id)  ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_notes_type    ON notes(note_type);
  CREATE INDEX IF NOT EXISTS idx_notes_status  ON notes(note_type, status);
  CREATE INDEX IF NOT EXISTS idx_notes_arc     ON notes(arc_id);
  CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);
  CREATE INDEX IF NOT EXISTS idx_ng_note       ON note_groups(note_id);
  CREATE INDEX IF NOT EXISTS idx_ng_group      ON note_groups(group_id);
    `;

    // Apply the full schema every time
    await db.execute(schemaSql);
    console.log("Schema applied/updated successfully.");

    // Column migrations — idempotent (SQLite throws if column already exists)
    // Drop old routine_occurrences table (replaced by is_routine + routine_id on nodes)
    try {
      await db.execute(`DROP TABLE IF EXISTS routine_occurrences`);
    } catch {
      /* */
    }

    const columnMigrations = [
      `ALTER TABLE nodes ADD COLUMN is_frog_pinned BOOLEAN DEFAULT 0`,
      `ALTER TABLE nodes ADD COLUMN is_routine INTEGER DEFAULT 0`,
      `ALTER TABLE nodes ADD COLUMN routine_id TEXT`,
    ];
    for (const sql of columnMigrations) {
      try {
        await db.execute(sql);
      } catch {
        /* column already exists */
      }
    }

    // Remove duplicate routine nodes — must run with FK off to avoid cascade conflicts
    try {
      await db.execute(`PRAGMA foreign_keys = OFF`);
      await db.execute(`
        DELETE FROM nodes WHERE id NOT IN (
          SELECT MIN(id) FROM nodes
          WHERE routine_id IS NOT NULL
          GROUP BY routine_id, substr(planned_start_at, 1, 10)
        ) AND routine_id IS NOT NULL
      `);
    } catch { /* */ } finally {
      await db.execute(`PRAGMA foreign_keys = ON`);
    }

    // Indexes that depend on migrated columns — must run after migrations
    const indexMigrations = [
      `CREATE INDEX IF NOT EXISTS idx_nodes_routine_id ON nodes(routine_id)`,
      `CREATE INDEX IF NOT EXISTS idx_nodes_is_routine ON nodes(is_routine)`,
    ];
    for (const sql of indexMigrations) {
      try {
        await db.execute(sql);
      } catch {
        /* index already exists */
      }
    }

    // Trigger migrations — DROP + recreate to apply fixes (IF NOT EXISTS guards against
    // the schema having already created the correct version in the same init run)
    await db.execute(`DROP TRIGGER IF EXISTS readd_ungrouped_if_empty`);
    await db.execute(`
      CREATE TRIGGER IF NOT EXISTS readd_ungrouped_if_empty AFTER DELETE ON node_groups
      BEGIN
        INSERT OR IGNORE INTO node_groups(node_id, group_id)
        SELECT OLD.node_id, id FROM planner_groups
        WHERE is_ungrouped = 1
          AND EXISTS (SELECT 1 FROM nodes WHERE id = OLD.node_id)
          AND NOT EXISTS (
            SELECT 1 FROM node_groups WHERE node_id = OLD.node_id
          );
      END
    `);

    return db;
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

export function getDb(): Database {
  if (!_db)
    throw new Error(
      "Database not initialized. Ensure setupDb() has completed before calling getDb().",
    );
  return _db;
}

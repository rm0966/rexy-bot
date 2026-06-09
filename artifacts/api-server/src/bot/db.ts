import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";

const DATA_DIR = path.join(process.cwd(), "data");
const AUTOSAVE_MS = 30_000;

const FILES = {
  history:  path.join(DATA_DIR, "history.json"),
  notes:    path.join(DATA_DIR, "notes.json"),
  warnings: path.join(DATA_DIR, "warnings.json"),
  triggers: path.join(DATA_DIR, "triggers.json"),
};

// ── helpers ──────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (err) {
    logger.warn({ err, file }, "Failed to read data file — using fallback");
  }
  return fallback;
}

function writeJson(file: string, data: unknown): void {
  try {
    ensureDir();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    logger.error({ err, file }, "Failed to write data file");
  }
}

// ── load ─────────────────────────────────────────────────────────────────────

function loadHistory(): Map<string, unknown[]> {
  const raw = readJson<Record<string, unknown[]>>(FILES.history, {});
  return new Map(Object.entries(raw));
}

function loadNotes(): Map<string, unknown[]> {
  const raw = readJson<Record<string, unknown[]>>(FILES.notes, {});
  return new Map(Object.entries(raw));
}

function loadWarnings(): Map<string, unknown[]> {
  const raw = readJson<Record<string, unknown[]>>(FILES.warnings, {});
  return new Map(Object.entries(raw));
}

function loadTriggers(): Set<string> {
  const raw = readJson<string[]>(FILES.triggers, ["ur", "〆", "يو ار", "يو آر"]);
  return new Set(raw);
}

// ── Database singleton ───────────────────────────────────────────────────────

class BotDatabase {
  readonly history  = loadHistory();
  readonly notes    = loadNotes();
  readonly warnings = loadWarnings();
  readonly triggers = loadTriggers();

  private dirty = false;

  constructor() {
    ensureDir();
    this.startAutoSave();
    logger.info("Bot persistent memory loaded");
  }

  markDirty(): void {
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    writeJson(FILES.history,  Object.fromEntries(this.history));
    writeJson(FILES.notes,    Object.fromEntries(this.notes));
    writeJson(FILES.warnings, Object.fromEntries(this.warnings));
    writeJson(FILES.triggers, [...this.triggers]);
    this.dirty = false;
    logger.debug("Memory flushed to disk");
  }

  private startAutoSave(): void {
    setInterval(() => this.flush(), AUTOSAVE_MS);

    // Also flush on process exit
    process.on("exit",    () => this.flush());
    process.on("SIGTERM", () => this.flush());
    process.on("SIGINT",  () => this.flush());
  }
}

export const db = new BotDatabase();

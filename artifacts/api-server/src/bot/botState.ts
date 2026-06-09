import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";

const STATE_FILE = path.join(process.cwd(), "data", "bot-state.json");

function ensureDir(): void {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readState(): { enabled: boolean } {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as { enabled: boolean };
    }
  } catch (err) {
    logger.warn({ err }, "Failed to read bot state — defaulting to enabled");
  }
  return { enabled: true };
}

function writeState(enabled: boolean): void {
  try {
    ensureDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify({ enabled }, null, 2), "utf8");
  } catch (err) {
    logger.error({ err }, "Failed to write bot state");
  }
}

export function isBotEnabled(): boolean {
  return readState().enabled;
}

export function setBotEnabled(enabled: boolean): void {
  writeState(enabled);
}

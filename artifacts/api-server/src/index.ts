import app from "./app";
import { logger } from "./lib/logger";
import { startDiscordBot } from "./bot/yuri";
import { startKeepalive, onMainServerRestart } from "./keepalive";
import { registerClient } from "./bot/botController";
import { isBotEnabled } from "./bot/botState";
import http from "http";
import { execSync } from "child_process";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const MAIN_PORT = Number(rawPort);

if (Number.isNaN(MAIN_PORT) || MAIN_PORT <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Process-level crash shields ──────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException — keeping process alive");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection — keeping process alive");
});

// ── Main server ───────────────────────────────────────────────────────────────

let mainServer: http.Server | null = null;
let restarting = false;

function killPort(port: number): void {
  try { execSync(`fuser -k ${port}/tcp 2>/dev/null || true`); } catch { /* ignore */ }
}

function startMainServer(): void {
  if (restarting) return;
  restarting = true;

  if (mainServer) {
    mainServer.removeAllListeners();
    try { mainServer.close(); } catch { /* ignore */ }
    mainServer = null;
  }

  killPort(MAIN_PORT);

  setTimeout(() => {
    restarting = false;

    mainServer = app.listen(MAIN_PORT, () => {
      logger.info({ port: MAIN_PORT }, "Server listening");
      startKeepalive();
    });

    mainServer.on("error", (err: NodeJS.ErrnoException) => {
      logger.error({ err }, "Main server error — restarting in 3s");
      mainServer?.removeAllListeners();
      mainServer = null;
      setTimeout(startMainServer, 3000);
    });
  }, 500);
}

onMainServerRestart(() => {
  logger.warn("Watchdog triggered restart of main server");
  startMainServer();
});

startMainServer();

// Only start the bot if it was enabled (persisted state)
if (isBotEnabled()) {
  const client = startDiscordBot();
  registerClient(client);
} else {
  logger.info("Bot is disabled via dashboard — skipping startup");
}

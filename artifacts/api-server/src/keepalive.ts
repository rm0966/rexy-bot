import http from "http";
import { logger } from "./lib/logger";

const SECONDARY_PORT = 3000;
const PING_INTERVAL_MS = 2 * 60 * 1000;
const WATCHDOG_INTERVAL_MS = 60 * 1000;
const MAX_FAILURES = 2;

let restartCallback: (() => void) | null = null;
let mainFailures = 0;

export function onMainServerRestart(cb: () => void): void {
  restartCallback = cb;
}

function buildUrl(port: number): string {
  if (process.env.REPLIT_DEV_DOMAIN && port === 5000) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/healthz`;
  }
  return `http://localhost:${port}/healthz`;
}

async function ping(port: number): Promise<boolean> {
  try {
    await fetch(buildUrl(port), { signal: AbortSignal.timeout(8000) });
    logger.debug({ port }, "keep-alive ping ok");
    return true;
  } catch {
    logger.warn({ port }, "keep-alive ping failed");
    return false;
  }
}

function startSecondaryServer(): void {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("شغال");
  });

  server.listen(SECONDARY_PORT, () =>
    logger.info({ port: SECONDARY_PORT }, "Keep-alive secondary server listening"),
  );

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.warn({ port: SECONDARY_PORT }, "Secondary port in use — skipping");
    } else {
      logger.error({ err }, "Secondary server error");
      setTimeout(() => startSecondaryServer(), 5000);
    }
  });
}

function startWatchdog(): void {
  setInterval(async () => {
    const alive = await ping(5000);

    if (!alive) {
      mainFailures++;
      logger.warn({ mainFailures, max: MAX_FAILURES }, "Port 5000 unresponsive");

      if (mainFailures >= MAX_FAILURES && restartCallback) {
        logger.error("Port 5000 down — triggering restart");
        mainFailures = 0;
        restartCallback();
      }
    } else {
      mainFailures = 0;
    }
  }, WATCHDOG_INTERVAL_MS);
}

export function startKeepalive(): void {
  startSecondaryServer();
  startWatchdog();

  setInterval(() => {
    Promise.allSettled([ping(5000), ping(3000)]);
  }, PING_INTERVAL_MS);

  logger.info(
    { ports: [5000, 3000], pingMs: PING_INTERVAL_MS, watchdogMs: WATCHDOG_INTERVAL_MS },
    "Keep-alive started",
  );
}

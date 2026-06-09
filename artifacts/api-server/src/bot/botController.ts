import type { Client } from "discord.js";
import { logger } from "../lib/logger";
import { isBotEnabled, setBotEnabled } from "./botState";

let activeClient: Client | null = null;
let startedAt: number | null = null;

export function registerClient(client: Client): void {
  activeClient = client;
  startedAt = Date.now();

  client.once("ready", () => {
    startedAt = Date.now();
  });
}

export function getBotStatus(): { running: boolean; enabled: boolean; uptimeMs: number | null; tag: string | null } {
  const running = activeClient !== null && activeClient.isReady();
  return {
    running,
    enabled: isBotEnabled(),
    uptimeMs: running && startedAt ? Date.now() - startedAt : null,
    tag: running && activeClient?.user ? activeClient.user.tag : null,
  };
}

export function stopBot(): void {
  setBotEnabled(false);
  if (activeClient) {
    try {
      activeClient.destroy();
      logger.info("Discord client destroyed");
    } catch (err) {
      logger.warn({ err }, "Error destroying Discord client");
    }
    activeClient = null;
    startedAt = null;
  }
  logger.info("Bot stopped via dashboard");
}

export async function startBot(): Promise<void> {
  if (activeClient?.isReady()) {
    setBotEnabled(true);
    return;
  }
  setBotEnabled(true);

  const { startDiscordBot } = await import("./yuri");
  const client = startDiscordBot();
  registerClient(client);
  logger.info("Bot started via dashboard");
}

import { Router, type IRouter } from "express";
import { getBotStatus, startBot, stopBot } from "../bot/botController";

const router: IRouter = Router();

router.get("/bot/status", (_req, res) => {
  res.json(getBotStatus());
});

router.post("/bot/start", async (_req, res) => {
  try {
    await startBot();
    res.json({ success: true, message: "Bot is starting..." });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

router.post("/bot/stop", (_req, res) => {
  try {
    stopBot();
    res.json({ success: true, message: "Bot stopped." });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

export default router;

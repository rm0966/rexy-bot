import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(DASHBOARD_HTML);
});

app.use("/api", router);

export default app;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>رنيم — لوحة التحكم</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 20px;
      padding: 48px 56px;
      text-align: center;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    }

    .bot-icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #5865f2, #7289da);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      margin: 0 auto 20px;
      border: 3px solid #30363d;
    }

    h1 {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 6px;
      color: #f0f6fc;
    }

    .subtitle {
      color: #8b949e;
      font-size: 13px;
      margin-bottom: 32px;
    }

    .status-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #30363d;
      transition: background 0.4s, box-shadow 0.4s;
      flex-shrink: 0;
    }

    .dot.online {
      background: #3fb950;
      box-shadow: 0 0 8px #3fb950aa;
    }

    .dot.offline {
      background: #f85149;
      box-shadow: 0 0 8px #f85149aa;
    }

    .dot.loading {
      background: #d29922;
      box-shadow: 0 0 8px #d29922aa;
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .status-text {
      font-size: 16px;
      font-weight: 600;
      color: #e6edf3;
    }

    .uptime {
      color: #8b949e;
      font-size: 13px;
      margin-bottom: 36px;
      min-height: 20px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 44px;
      border-radius: 12px;
      border: none;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      width: 100%;
      letter-spacing: 0.5px;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-start {
      background: #238636;
      color: #fff;
    }

    .btn-start:hover:not(:disabled) {
      background: #2ea043;
      transform: translateY(-1px);
      box-shadow: 0 4px 16px #23863655;
    }

    .btn-stop {
      background: #da3633;
      color: #fff;
    }

    .btn-stop:hover:not(:disabled) {
      background: #f85149;
      transform: translateY(-1px);
      box-shadow: 0 4px 16px #da363355;
    }

    .btn-loading {
      background: #21262d;
      color: #8b949e;
    }

    .divider {
      border: none;
      border-top: 1px solid #21262d;
      margin: 32px 0 20px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #8b949e;
    }

    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: #21262d;
      border: 1px solid #30363d;
      color: #e6edf3;
      padding: 12px 24px;
      border-radius: 10px;
      font-size: 14px;
      opacity: 0;
      transition: all 0.3s;
      pointer-events: none;
      white-space: nowrap;
    }

    .toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="bot-icon">🤖</div>
    <h1>رنيم</h1>
    <p class="subtitle">Arabic AI Discord Bot</p>

    <div class="status-row">
      <div class="dot loading" id="dot"></div>
      <span class="status-text" id="status-text">جاري التحقق...</span>
    </div>
    <p class="uptime" id="uptime"></p>

    <button class="btn btn-loading" id="toggle-btn" disabled onclick="toggle()">
      ...</button>

    <hr class="divider" />
    <div class="info-row">
      <span id="bot-tag">—</span>
      <span id="last-check">—</span>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    let currentRunning = null;
    let busy = false;

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3000);
    }

    function formatUptime(ms) {
      if (!ms) return '';
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      if (d > 0) return 'وقت التشغيل: ' + d + ' يوم ' + (h % 24) + ' ساعة';
      if (h > 0) return 'وقت التشغيل: ' + h + ' ساعة ' + (m % 60) + ' دقيقة';
      if (m > 0) return 'وقت التشغيل: ' + m + ' دقيقة ' + (s % 60) + ' ثانية';
      return 'وقت التشغيل: ' + s + ' ثانية';
    }

    function updateUI(data) {
      const dot = document.getElementById('dot');
      const statusText = document.getElementById('status-text');
      const uptime = document.getElementById('uptime');
      const btn = document.getElementById('toggle-btn');
      const botTag = document.getElementById('bot-tag');
      const lastCheck = document.getElementById('last-check');

      dot.className = 'dot ' + (data.running ? 'online' : 'offline');
      statusText.textContent = data.running ? 'شغال ✓' : 'متوقف';
      uptime.textContent = data.running ? formatUptime(data.uptimeMs) : '';
      botTag.textContent = data.tag || '—';
      lastCheck.textContent = 'آخر تحقق: ' + new Date().toLocaleTimeString('ar');

      currentRunning = data.running;

      if (!busy) {
        if (data.running) {
          btn.className = 'btn btn-stop';
          btn.textContent = '⏹ إيقاف البوت';
          btn.disabled = false;
        } else {
          btn.className = 'btn btn-start';
          btn.textContent = '▶ تشغيل البوت';
          btn.disabled = false;
        }
      }
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/bot/status');
        const data = await res.json();
        updateUI(data);
      } catch {
        document.getElementById('dot').className = 'dot loading';
        document.getElementById('status-text').textContent = 'تعذّر الاتصال';
      }
    }

    async function toggle() {
      if (busy) return;
      busy = true;

      const btn = document.getElementById('toggle-btn');
      btn.disabled = true;
      btn.className = 'btn btn-loading';

      if (currentRunning) {
        btn.textContent = '⏳ جاري الإيقاف...';
        try {
          await fetch('/api/bot/stop', { method: 'POST' });
          showToast('✅ تم إيقاف البوت');
        } catch {
          showToast('❌ حدث خطأ أثناء الإيقاف');
        }
      } else {
        btn.textContent = '⏳ جاري التشغيل...';
        try {
          await fetch('/api/bot/start', { method: 'POST' });
          showToast('✅ البوت بدأ التشغيل...');
        } catch {
          showToast('❌ حدث خطأ أثناء التشغيل');
        }
      }

      setTimeout(() => {
        busy = false;
        fetchStatus();
      }, 2500);
    }

    fetchStatus();
    setInterval(fetchStatus, 5000);
  </script>
</body>
</html>`;

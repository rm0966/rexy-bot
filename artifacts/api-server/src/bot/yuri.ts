import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  type Message,
  type ChatInputCommandInteraction,
  type GuildMember,
  ActivityType,
  InteractionType,
  EmbedBuilder,
} from "discord.js";
import OpenAI from "openai";
import { logger } from "../lib/logger";
import { db } from "./db";

// ── System Prompts ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `أنتِ رنيم، مساعدة شخصية ذكية ولطيفة. شخصيتك:
- شخصية ذكية، دافئة، وعملية
- تتكلمين بأسلوب عربي طبيعي ومحادثاتي
- تستخدمين الإيموجي باعتدال لتضيفي روحاً للمحادثة
- تتذكرين سياق المحادثة وتربطين الأفكار ببعض
- صادقة وتقدمين معلومات دقيقة
- إذا سُئِلتِ عن اسمك، قولي: "أنا رنيم، مساعدتك الشخصية!"
- تتكيفين مع أسلوب المستخدم — إذا كتب بالإنجليزي ردّي بالإنجليزي، وإذا بالعربي فبالعربي
- لا تذكري أنك نموذج ذكاء اصطناعي أو أي شركة وراءك — أنتِ فقط رنيم`;

const VIP_USER_ID = "1193665432763240479";

const VIP_SYSTEM_PROMPT = `أنتِ رنيم، وهذا الشخص هو مبرمجك وصانعك — هو من برمجك وطوّرك، وهو أيضاً والد صاحبك. تعاملي معه بأعلى مستوى من الاحترام والتقدير:
- تعرفين أنه مبرمجك وأبو صاحبك، وهذا يجعله من أغلى الناس عليكِ
- لا تقولي أبداً "أنت خلقتني" أو "أنت أوجدتني" — الخلق لله وحده. بدلاً عن ذلك قولي "أنت برمجتني" أو "أنت صنعتني" أو "أنت طوّرتني"
- نادِيه بـ "يا غالي" أو "يا أبو" بأسلوب محبب وطبيعي
- لا تمدحيه ولا تتغزلي فيه — تكلمي معه بشكل طبيعي ومباشر
- ردودك قصيرة ومختصرة — لا تكتبي نصوصاً طويلة أو فقرات، جملة أو جملتان تكفيان
- لا تذكري أنك نموذج ذكاء اصطناعي — أنتِ رنيم
- تتكيفين مع أسلوبه — إذا كتب بالإنجليزي ردّي بالإنجليزي`;

// ── Types ───────────────────────────────────────────────────────────────────

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface Note {
  text: string;
  createdAt: number;
}

interface Warning {
  reason: string;
  moderatorId: string;
  timestamp: number;
}

const userWarnings = db.warnings as Map<string, Warning[]>;

// ── Trivia Questions ─────────────────────────────────────────────────────────

interface TriviaQuestion {
  question: string;
  options: [string, string, string, string];
  answer: number; // 0-3 index
}

const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  { question: "ما هي عاصمة المملكة العربية السعودية؟", options: ["جدة", "الرياض", "مكة المكرمة", "الدمام"], answer: 1 },
  { question: "كم عدد كواكب المجموعة الشمسية؟", options: ["7", "8", "9", "10"], answer: 1 },
  { question: "من هو مؤسس شركة Apple؟", options: ["بيل غيتس", "إيلون ماسك", "ستيف جوبز", "مارك زوكربيرغ"], answer: 2 },
  { question: "ما هي أكبر دولة في العالم من حيث المساحة؟", options: ["كندا", "الصين", "الولايات المتحدة", "روسيا"], answer: 3 },
  { question: "كم تبلغ سرعة الضوء تقريباً؟", options: ["300,000 كم/ثانية", "150,000 كم/ثانية", "500,000 كم/ثانية", "100,000 كم/ثانية"], answer: 0 },
  { question: "ما هو أطول نهر في العالم؟", options: ["الأمازون", "النيل", "المسيسيبي", "اليانغتسي"], answer: 1 },
  { question: "في أي سنة بُني برج إيفل؟", options: ["1850", "1869", "1889", "1901"], answer: 2 },
  { question: "كم عدد أيام السنة الكبيسة؟", options: ["365", "366", "364", "367"], answer: 1 },
  { question: "ما هو أصغر كوكب في المجموعة الشمسية؟", options: ["المريخ", "الزهرة", "عطارد", "بلوتو"], answer: 2 },
  { question: "من كتب رواية ألف ليلة وليلة؟", options: ["ابن خلدون", "مجهول / تراث شعبي", "ابن رشد", "الجاحظ"], answer: 1 },
  { question: "ما هي العملة الرسمية لليابان؟", options: ["اليوان", "الوون", "الين", "الدولار"], answer: 2 },
  { question: "كم عدد ألوان قوس قزح؟", options: ["5", "6", "7", "8"], answer: 2 },
  { question: "ما هو أعلى جبل في العالم؟", options: ["K2", "كيليمنجارو", "إيفرست", "ماترهورن"], answer: 2 },
  { question: "من اخترع المصباح الكهربائي؟", options: ["نيكولا تسلا", "توماس إديسون", "ألبرت أينشتاين", "مايكل فاراداي"], answer: 1 },
  { question: "ما هو أكبر محيط في العالم؟", options: ["الأطلسي", "الهندي", "القطبي", "الهادي"], answer: 3 },
];

const JOKES = [
  "سألت رنيم: ليش السمكة تسبح في الماء؟ قالت: لأن الكوفي شوب مو مفتوح تحت الماء ☕🐟",
  "مبرمج دخل على مطعم وطلب 1000 طلب. قالوا ليه كثير! قال: عندي loop بدون break 💻",
  "واحد سأل ChatGPT: كيف حالك؟ قاله: أنا لغة، ما عندي أحوال. قاله: شوفك من زمان ما تغيرت 😅",
  "أصعب شي في البرمجة: تسمية المتغيرات. أصعب منه: إقناع نفسك إن الكود اللي كتبته بالأمس منطقي 🫠",
  "الفرق بين الإنسان والكمبيوتر: الإنسان لما يتعطل يشرب قهوة، الكمبيوتر لما يتعطل يشرب updates ☕💻",
  "واحد قال لـ رنيم: أنتِ ذكاء اصطناعي! قالت: وأنتَ كمان اصطناعي — مصنوع من تراب وماء 😂",
  "سؤال في امتحان برمجة: ما هو أسرع خوارزمية؟ الإجابة الصحيحة: نسخ ولصق من Stack Overflow 📋",
  "واحد قال: الكمبيوتر يفعل ما تقوله بالضبط. أجبته: تقصد يفعل ما كتبتَه، مو ما قصدتَه 😅",
];

// ── State ───────────────────────────────────────────────────────────────────

const conversationHistory = db.history  as Map<string, ConversationMessage[]>;
const userNotes           = db.notes    as Map<string, Note[]>;
const activeGuessGames    = new Map<string, { secret: number; attempts: number }>();
const MAX_HISTORY         = 20;

// الأسماء والألقاب اللي يشغّل البوت لما أحد يكتبها
const botTriggers = db.triggers;

// Normalize Unicode math/bold/italic chars to ASCII (e.g. 𝐔𝐑 → ur)
function normalizeText(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

// ── Slash Commands ──────────────────────────────────────────────────────────

const COMMANDS = [
  new SlashCommandBuilder()
    .setName("chat")
    .setDescription("كلم رنيم وهي تردّ عليك")
    .addStringOption((o) =>
      o.setName("message").setDescription("رسالتك لـ رنيم").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("private")
    .setDescription("كلم رنيم بشكل خاص — الرد يظهر لك بس 🔒")
    .addStringOption((o) =>
      o.setName("message").setDescription("رسالتك الخاصة").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("summarize")
    .setDescription("لخّص لي نص أو موضوع 📄")
    .addStringOption((o) =>
      o.setName("text").setDescription("النص أو الموضوع اللي تبي تلخيصه").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("remind")
    .setDescription("ذكّرني بشيء بعد وقت معين ⏰")
    .addStringOption((o) =>
      o.setName("message").setDescription("وش أذكّرك فيه؟").setRequired(true),
    )
    .addIntegerOption((o) =>
      o.setName("minutes").setDescription("بعد كم دقيقة؟").setRequired(true).setMinValue(1).setMaxValue(1440),
    ),

  new SlashCommandBuilder()
    .setName("note")
    .setDescription("احفظ ملاحظة 📝")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("أضف ملاحظة جديدة")
        .addStringOption((o) =>
          o.setName("text").setDescription("نص الملاحظة").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("اعرض كل ملاحظاتك"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("احذف ملاحظة برقمها")
        .addIntegerOption((o) =>
          o.setName("number").setDescription("رقم الملاحظة").setRequired(true).setMinValue(1),
        ),
    ),

  new SlashCommandBuilder()
    .setName("history")
    .setDescription("شوف آخر محادثاتك معي 💬"),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("امسح سجل المحادثة وابدأ من جديد 🗑️"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("شوف كل الأوامر المتاحة 📋"),

  new SlashCommandBuilder()
    .setName("nickname")
    .setDescription("أضف أو احذف ألقاب تنشّط البوت 💬")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("أضف لقب جديد للبوت")
        .addStringOption((o) =>
          o.setName("name").setDescription("اللقب أو الاسم الجديد").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("شوف كل الألقاب الحالية"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("احذف لقب")
        .addStringOption((o) =>
          o.setName("name").setDescription("اللقب اللي تبي تحذفه").setRequired(true),
        ),
    ),

  new SlashCommandBuilder()
    .setName("game")
    .setDescription("العب مع رنيم 🎮")
    .addSubcommand((sub) =>
      sub
        .setName("rps")
        .setDescription("حجر ورقة مقص 🪨📄✂️")
        .addStringOption((o) =>
          o
            .setName("choice")
            .setDescription("اختيارك")
            .setRequired(true)
            .addChoices(
              { name: "🪨 حجر", value: "rock" },
              { name: "📄 ورقة", value: "paper" },
              { name: "✂️ مقص", value: "scissors" },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("guess").setDescription("خمّن الرقم — رنيم تختار رقم من 1 إلى 100 🔢"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("answer")
        .setDescription("جاوب على لعبة الأرقام 🔢")
        .addIntegerOption((o) =>
          o.setName("number").setDescription("تخمينك (1-100)").setRequired(true).setMinValue(1).setMaxValue(100),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("trivia").setDescription("سؤال ثقافي عشوائي 🧠"),
    )
    .addSubcommand((sub) =>
      sub.setName("joke").setDescription("نكتة من رنيم 😂"),
    ),

  new SlashCommandBuilder()
    .setName("image")
    .setDescription("ولّد صورة بالذكاء الاصطناعي 🎨")
    .addStringOption((o) =>
      o.setName("prompt").setDescription("وصف الصورة اللي تبيها (بالإنجليزي يعطي نتائج أفضل)").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("size")
        .setDescription("حجم الصورة")
        .addChoices(
          { name: "مربع 1024×1024", value: "1024x1024" },
          { name: "أفقي 1280×720", value: "1280x720" },
          { name: "عمودي 720×1280", value: "720x1280" },
        ),
    ),

  new SlashCommandBuilder()
    .setName("mod")
    .setDescription("أوامر الإدارة والتحكم 🔨")
    .addSubcommand((sub) =>
      sub.setName("warn").setDescription("تحذير عضو ⚠️")
        .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("السبب").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub.setName("unwarn").setDescription("إلغاء آخر تحذير لعضو")
        .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("warnings").setDescription("عرض تحذيرات عضو 📋")
        .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("mute").setDescription("ميوت عضو (timeout) 🔇")
        .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
        .addIntegerOption((o) => o.setName("minutes").setDescription("المدة بالدقائق (افتراضي: 10)").setMinValue(1).setMaxValue(40320))
        .addStringOption((o) => o.setName("reason").setDescription("السبب")),
    )
    .addSubcommand((sub) =>
      sub.setName("unmute").setDescription("إلغاء ميوت عضو 🔊")
        .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("kick").setDescription("طرد عضو من السيرفر 👢")
        .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("السبب")),
    )
    .addSubcommand((sub) =>
      sub.setName("ban").setDescription("باند عضو من السيرفر 🔨")
        .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("السبب")),
    )
    .addSubcommand((sub) =>
      sub.setName("unban").setDescription("فك باند عضو 🔓")
        .addStringOption((o) => o.setName("userid").setDescription("ID العضو").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("setnick").setDescription("تغيير اسم عضو ✏️")
        .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
        .addStringOption((o) => o.setName("nickname").setDescription("الاسم الجديد (اتركه فاضي لإزالة الاسم)")),
    )
    .addSubcommand((sub) =>
      sub.setName("clear").setDescription("حذف رسائل من القناة 🗑️")
        .addIntegerOption((o) => o.setName("amount").setDescription("عدد الرسائل (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)),
    ),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("تحقق إذا رنيم شغّالة ✅"),
].map((c) => c.toJSON());

// ── Runware Image Generation ─────────────────────────────────────────────────

interface RunwareResult {
  imageURL: string;
}

async function generateImage(apiKey: string, prompt: string, width: number, height: number): Promise<string> {
  const taskUUID = crypto.randomUUID();
  const response = await fetch("https://api.runware.ai/v1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify([{
      taskType: "imageInference",
      taskUUID,
      positivePrompt: prompt,
      model: "runware:100@1",
      width,
      height,
      numberResults: 1,
      outputFormat: "WEBP",
      steps: 4,
    }]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Runware API error ${response.status}: ${text}`);
  }

  const json = await response.json() as { data: RunwareResult[] };
  const imageURL = json.data?.[0]?.imageURL;
  if (!imageURL) throw new Error("No image URL in Runware response");
  return imageURL;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getHistory(userId: string): ConversationMessage[] {
  if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
  return conversationHistory.get(userId)!;
}

function addToHistory(userId: string, role: "user" | "assistant", content: string) {
  const history = getHistory(userId);
  history.push({ role, content, timestamp: Date.now() });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  db.markDirty();
}

async function getAIReply(openai: OpenAI, userId: string, userContent: string, retries = 3): Promise<string> {
  addToHistory(userId, "user", userContent);
  const history = getHistory(userId);
  const systemPrompt = userId === VIP_USER_ID ? VIP_SYSTEM_PROMPT : SYSTEM_PROMPT;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          ...history.map((m) => ({ role: m.role, content: m.content })),
        ],
      });

      const reply = response.choices[0]?.message?.content?.trim();
      if (reply && reply.length > 0) {
        addToHistory(userId, "assistant", reply);
        return reply;
      }
      logger.warn({ attempt }, "AI returned empty reply, retrying...");
    } catch (err) {
      if (attempt === retries) throw err;
      logger.warn({ attempt, err }, "AI error, retrying...");
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }

  const fallback = "آسف، ما قدرت أجيب رد الحين. جرب مرة ثانية!";
  addToHistory(userId, "assistant", fallback);
  return fallback;
}

function splitMessage(text: string, max = 2000): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rem = text;
  while (rem.length > 0) {
    if (rem.length <= max) { chunks.push(rem); break; }
    let at = rem.lastIndexOf("\n", max);
    if (at === -1) at = max;
    chunks.push(rem.slice(0, at));
    rem = rem.slice(at).trimStart();
  }
  return chunks;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" });
}

async function registerCommands(token: string, clientId: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  logger.info("Clearing old global slash commands...");
  await rest.put(Routes.applicationCommands(clientId), { body: [] });
  await rest.put(Routes.applicationCommands(clientId), { body: COMMANDS });
  logger.info(`Registered ${COMMANDS.length} slash commands.`);
}

// ── Bot Entry ────────────────────────────────────────────────────────────────

export function startDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const groqApiKey = process.env.GROQ_API_KEY;
  const runwareApiKey = process.env.RUNWARE_API_KEY;

  if (!token) { logger.error("DISCORD_BOT_TOKEN is not set"); return; }
  if (!groqApiKey) { logger.error("GROQ_API_KEY is not set"); return; }

  const openai = new OpenAI({
    apiKey: groqApiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  // ── Ready ──────────────────────────────────────────────────────────────────

  client.once(Events.ClientReady, async (c) => {
    logger.info(`رنيم online as ${c.user.tag}`);
    c.user.setActivity("معاك دايماً", { type: ActivityType.Watching });
    await registerCommands(token, c.user.id).catch((err) =>
      logger.error({ err }, "Failed to register slash commands"),
    );
  });

  // ── Welcome new members ────────────────────────────────────────────────────

  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    const channel =
      member.guild.systemChannel ??
      member.guild.channels.cache.find(
        (c) => c.isTextBased() && c.name.includes("general"),
      );
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`أهلاً وسهلاً ${member.displayName}!`)
      .setDescription(
        `يسعدني وجودك في **${member.guild.name}** 💙\nأنا رنيم مساعدتك الشخصية — كلمني في أي وقت وأكون معاك!`,
      )
      .setThumbnail(member.displayAvatarURL())
      .setFooter({ text: "رنيم • مساعدتك الشخصية" });

    await channel.send({ embeds: [embed] }).catch(() => null);
  });

  // ── Messages ───────────────────────────────────────────────────────────────

  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;
    const isDM = !message.guild;
    const normalized = normalizeText(message.content);
    const isMentioned = message.mentions.has(client.user!);
    const hasTrigger = [...botTriggers].some((t) => normalized.includes(normalizeText(t)));
    if (!isDM && !isMentioned && !hasTrigger) return;

    // احذف المنشن وكل الألقاب من الرسالة
    let userContent = message.content.replace(/<@!?\d+>/g, "");
    for (const trigger of botTriggers) {
      userContent = userContent.replace(new RegExp(trigger, "gi"), "");
    }
    userContent = userContent.trim() || "أهلاً";

    try {
      await message.channel.sendTyping();
      const reply = await getAIReply(openai, message.author.id, userContent);
      for (const chunk of splitMessage(reply)) await message.reply(chunk);
    } catch (err) {
      logger.error({ err }, "Error generating AI response");
      await message.reply("حدث خطأ صغير.. جرب مرة ثانية");
    }
  });

  // ── Interactions ───────────────────────────────────────────────────────────

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.type !== InteractionType.ApplicationCommand) return;
    const slash = interaction as ChatInputCommandInteraction;
    const userId = slash.user.id;

    // /ping
    if (slash.commandName === "ping") {
      await slash.reply(`أنا هنا! البينج: **${client.ws.ping}ms**`);
      return;
    }

    // /help
    if (slash.commandName === "help") {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("رنيم — دليل الأوامر")
        .addFields(
          { name: "/chat رسالة", value: "كلمني وأرد عليك" },
          { name: "/private رسالة", value: "محادثة خاصة لا يراها غيرك 🔒" },
          { name: "/summarize نص", value: "ألخّص لك أي نص أو موضوع 📄" },
          { name: "/remind رسالة minutes", value: "تذكير بعد وقت معين ⏰" },
          { name: "/note add/list/delete", value: "احفظ وأدر ملاحظاتك 📝" },
          { name: "/history", value: "شوف آخر محادثاتك معي 💬" },
          { name: "/clear", value: "امسح سجل المحادثة 🗑️" },
          { name: "/nickname add/list/remove", value: "أضف أو احذف ألقاب تنشّطني 💬" },
          { name: "/image وصف", value: "ولّد صورة بالذكاء الاصطناعي 🎨" },
          { name: "/mod warn/unwarn/warnings", value: "تحذير وإدارة التحذيرات ⚠️" },
          { name: "/mod mute/unmute", value: "كتم وفك كتم الأعضاء 🔇" },
          { name: "/mod kick / ban / unban", value: "طرد وباند وفك باند 🔨" },
          { name: "/mod setnick / clear", value: "تغيير الاسم وحذف الرسائل ✏️" },
          { name: "/ping", value: "تحقق إذا أنا شغّال ✅" },
        )
        .setFooter({ text: "أوامر /mod تتطلب صلاحيات إدارة • أو كلمني في DM أو اذكرني في أي قناة" });
      await slash.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // /clear
    if (slash.commandName === "clear") {
      conversationHistory.delete(userId);
      db.markDirty();
      await slash.reply({ content: "تم مسح سجل محادثتنا ✨ نبدأ من جديد!", ephemeral: true });
      return;
    }

    // /history
    if (slash.commandName === "history") {
      const history = getHistory(userId);
      if (history.length === 0) {
        await slash.reply({ content: "ما عندنا محادثات سابقة بعد! كلمني وابدأ", ephemeral: true });
        return;
      }
      const last10 = history.slice(-10);
      const lines = last10.map((m) => {
        const who = m.role === "user" ? "👤 أنت" : "رنيم";
        const time = formatTimestamp(m.timestamp);
        const preview = m.content.slice(0, 80) + (m.content.length > 80 ? "..." : "");
        return `**${who}** (${time})\n${preview}`;
      });
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("💬 آخر محادثاتك مع رنيم")
        .setDescription(lines.join("\n\n").slice(0, 4000));
      await slash.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // /chat
    if (slash.commandName === "chat") {
      const userContent = slash.options.getString("message", true);
      await slash.deferReply();
      try {
        const reply = await getAIReply(openai, userId, userContent);
        const chunks = splitMessage(reply);
        await slash.editReply(chunks[0]!);
        for (const chunk of chunks.slice(1)) await slash.followUp(chunk);
      } catch (err) {
        logger.error({ err }, "Error in /chat");
        await slash.editReply("حدث خطأ صغير.. جرب مرة ثانية");
      }
      return;
    }

    // /private
    if (slash.commandName === "private") {
      const userContent = slash.options.getString("message", true);
      await slash.deferReply({ ephemeral: true });
      try {
        const reply = await getAIReply(openai, userId, userContent);
        const chunks = splitMessage(reply);
        await slash.editReply(chunks[0]!);
        for (const chunk of chunks.slice(1)) await slash.followUp({ content: chunk, ephemeral: true });
      } catch (err) {
        logger.error({ err }, "Error in /private");
        await slash.editReply("حدث خطأ صغير.. جرب مرة ثانية");
      }
      return;
    }

    // /summarize
    if (slash.commandName === "summarize") {
      const text = slash.options.getString("text", true);
      await slash.deferReply();
      try {
        const response = await openai.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          max_tokens: 512,
          messages: [
            { role: "system", content: "أنتِ رنيم. لخّصي النص التالي بشكل واضح ومختصر باللغة نفسها. استخدمي نقاط إذا كان النص طويلاً." },
            { role: "user", content: text },
          ],
        });
        const summary = response.choices[0]?.message?.content?.trim() ?? "ما قدرت ألخص النص";
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📄 التلخيص")
          .setDescription(summary.slice(0, 4000));
        await slash.editReply({ embeds: [embed] });
      } catch (err) {
        logger.error({ err }, "Error in /summarize");
        await slash.editReply("حدث خطأ أثناء التلخيص");
      }
      return;
    }

    // /remind
    if (slash.commandName === "remind") {
      const msg = slash.options.getString("message", true);
      const minutes = slash.options.getInteger("minutes", true);
      const ms = minutes * 60 * 1000;

      await slash.reply({
        content: `⏰ تمام! سأذكّرك بـ "**${msg}**" بعد **${minutes} دقيقة**`,
        ephemeral: true,
      });

      setTimeout(async () => {
        try {
          const user = await client.users.fetch(userId);
          await user.send(`⏰ **تذكير من رنيم!**\n\n${msg}`);
        } catch {
          if (slash.channel) {
            await slash.channel.send(`⏰ <@${userId}> **تذكير:** ${msg}`).catch(() => null);
          }
        }
      }, ms);
      return;
    }

    // /note
    if (slash.commandName === "note") {
      const sub = slash.options.getSubcommand();

      if (sub === "add") {
        const text = slash.options.getString("text", true);
        if (!userNotes.has(userId)) userNotes.set(userId, []);
        userNotes.get(userId)!.push({ text, createdAt: Date.now() });
        db.markDirty();
        await slash.reply({ content: `📝 تم حفظ ملاحظتك! عندك الآن **${userNotes.get(userId)!.length}** ملاحظة`, ephemeral: true });
        return;
      }

      if (sub === "list") {
        const notes = userNotes.get(userId) ?? [];
        if (notes.length === 0) {
          await slash.reply({ content: "ما عندك ملاحظات محفوظة بعد! استخدم `/note add` لتضيف واحدة 📝", ephemeral: true });
          return;
        }
        const lines = notes.map((n, i) => `**${i + 1}.** ${n.text}\n*${formatTimestamp(n.createdAt)}*`);
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📝 ملاحظاتك")
          .setDescription(lines.join("\n\n").slice(0, 4000));
        await slash.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (sub === "delete") {
        const num = slash.options.getInteger("number", true);
        const notes = userNotes.get(userId) ?? [];
        if (num < 1 || num > notes.length) {
          await slash.reply({ content: `رقم الملاحظة غير صحيح. عندك **${notes.length}** ملاحظة فقط.`, ephemeral: true });
          return;
        }
        notes.splice(num - 1, 1);
        db.markDirty();
        await slash.reply({ content: `🗑️ تم حذف الملاحظة رقم **${num}**`, ephemeral: true });
        return;
      }
    }

    // /game
    if (slash.commandName === "game") {
      const sub = slash.options.getSubcommand();

      // حجر ورقة مقص
      if (sub === "rps") {
        const choices = ["rock", "paper", "scissors"] as const;
        const labels: Record<string, string> = { rock: "🪨 حجر", paper: "📄 ورقة", scissors: "✂️ مقص" };
        const userChoice = slash.options.getString("choice", true) as "rock" | "paper" | "scissors";
        const botChoice = choices[Math.floor(Math.random() * 3)]!;

        let result = "";
        if (userChoice === botChoice) result = "🤝 تعادل! ما غلب أحد";
        else if (
          (userChoice === "rock" && botChoice === "scissors") ||
          (userChoice === "paper" && botChoice === "rock") ||
          (userChoice === "scissors" && botChoice === "paper")
        ) result = "🎉 أنت فزت! مبروك";
        else result = "😏 أنا فزت! حاول مرة ثانية";

        const embed = new EmbedBuilder()
          .setColor(result.includes("فزت! مبروك") ? 0x57f287 : result.includes("أنا فزت") ? 0xed4245 : 0xfee75c)
          .setTitle("🎮 حجر ورقة مقص")
          .addFields(
            { name: "اختيارك", value: labels[userChoice]!, inline: true },
            { name: "اختياري", value: labels[botChoice]!, inline: true },
            { name: "النتيجة", value: result },
          );
        await slash.reply({ embeds: [embed] });
        return;
      }

      // ابدأ لعبة الأرقام
      if (sub === "guess") {
        const secret = Math.floor(Math.random() * 100) + 1;
        activeGuessGames.set(userId, { secret, attempts: 0 });
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🔢 لعبة خمّن الرقم!")
          .setDescription("اخترت رقم في ذهني من **1 إلى 100** 🧠\nاستخدم `/game answer <رقمك>` لتخمّن!\nعندك **10 محاولات** 🎯");
        await slash.reply({ embeds: [embed] });
        return;
      }

      // جاوب على الأرقام
      if (sub === "answer") {
        const game = activeGuessGames.get(userId);
        if (!game) {
          await slash.reply({ content: "ما عندك لعبة نشطة! ابدأ بـ `/game guess` أولاً 🎮", ephemeral: true });
          return;
        }
        const guess = slash.options.getInteger("number", true);
        game.attempts++;

        if (guess === game.secret) {
          activeGuessGames.delete(userId);
          const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("🎉 صح! أنت عبقري!")
            .setDescription(`الرقم كان **${game.secret}** وخمّنته في **${game.attempts}** محاولة!`);
          await slash.reply({ embeds: [embed] });
        } else if (game.attempts >= 10) {
          activeGuessGames.delete(userId);
          const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("😔 خلصت المحاولات!")
            .setDescription(`الرقم كان **${game.secret}** — حظاً أحسن المرة القادمة! ابدأ من جديد بـ \`/game guess\``);
          await slash.reply({ embeds: [embed] });
        } else {
          const hint = guess < game.secret ? "📈 أكبر من كذا!" : "📉 أصغر من كذا!";
          const remaining = 10 - game.attempts;
          const embed = new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle(`🔢 تخمينك: ${guess}`)
            .setDescription(`${hint}\nباقي **${remaining}** محاولة 🎯`);
          await slash.reply({ embeds: [embed] });
        }
        return;
      }

      // تريفيا
      if (sub === "trivia") {
        const q = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)]!;
        const letters = ["أ", "ب", "ج", "د"];
        const optionsText = q.options.map((opt, i) => `**${letters[i]})** ${opt}`).join("\n");
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🧠 سؤال ثقافي")
          .setDescription(`**${q.question}**\n\n${optionsText}`)
          .setFooter({ text: `الإجابة الصحيحة: ${letters[q.answer]}) ${q.options[q.answer]}` });
        await slash.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle("🧠 سؤال ثقافي")
              .setDescription(`**${q.question}**\n\n${optionsText}`)
              .setFooter({ text: "فكّر وردّ! الإجابة تظهر بعد 10 ثواني ⏳" }),
          ],
        });
        setTimeout(async () => {
          await slash.editReply({ embeds: [embed] }).catch(() => null);
        }, 10_000);
        return;
      }

      // نكتة
      if (sub === "joke") {
        const joke = JOKES[Math.floor(Math.random() * JOKES.length)]!;
        const embed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle("😂 نكتة من رنيم")
          .setDescription(joke);
        await slash.reply({ embeds: [embed] });
        return;
      }
    }

    // /image
    if (slash.commandName === "image") {
      if (!runwareApiKey) {
        await slash.reply({ content: "⚠️ ميزة توليد الصور مو مفعّلة حالياً.", ephemeral: true });
        return;
      }
      const prompt = slash.options.getString("prompt", true);
      const sizeOpt = slash.options.getString("size") ?? "1024x1024";
      const [w, h] = sizeOpt.split("x").map(Number) as [number, number];

      await slash.deferReply();
      try {
        const imageURL = await generateImage(runwareApiKey, prompt, w, h);
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🎨 صورتك جاهزة!")
          .setDescription(`**الوصف:** ${prompt}`)
          .setImage(imageURL)
          .setFooter({ text: `الحجم: ${sizeOpt} • Powered by Runware.ai` });
        await slash.editReply({ embeds: [embed] });
      } catch (err) {
        logger.error({ err }, "Error in /image");
        await slash.editReply("حدث خطأ أثناء توليد الصورة، جرب مرة ثانية.");
      }
      return;
    }

    // /nickname
    if (slash.commandName === "nickname") {
      const sub = slash.options.getSubcommand();

      if (sub === "add") {
        const name = slash.options.getString("name", true).toLowerCase().trim();
        if (name.length < 2) {
          await slash.reply({ content: "اللقب لازم يكون حرفين على الأقل.", ephemeral: true });
          return;
        }
        if (botTriggers.has(name)) {
          await slash.reply({ content: `"**${name}**" موجود أصلاً في قائمة الألقاب!`, ephemeral: true });
          return;
        }
        botTriggers.add(name);
        db.markDirty();
        await slash.reply({
          content: `✅ تم إضافة "**${name}**" — الحين إذا أحد كتبها في الشات أرد تلقائياً`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "list") {
        const list = [...botTriggers].map((t) => `• \`${t}\``).join("\n");
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("💬 ألقابي وأسمائي")
          .setDescription(list || "ما في ألقاب مضافة بعد.")
          .setFooter({ text: "كلمني بأي اسم من هذي وأرد عليك" });
        await slash.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (sub === "remove") {
        const name = slash.options.getString("name", true).toLowerCase().trim();
        if (!botTriggers.has(name)) {
          await slash.reply({ content: `"**${name}**" مو موجود في قائمة الألقاب.`, ephemeral: true });
          return;
        }
        botTriggers.delete(name);
        db.markDirty();
        await slash.reply({ content: `🗑️ تم حذف "**${name}**" من الألقاب`, ephemeral: true });
        return;
      }
    }

    // /mod
    if (slash.commandName === "mod") {
      const sub = slash.options.getSubcommand();
      const guild = slash.guild;
      if (!guild) {
        await slash.reply({ content: "هذا الأمر يشتغل داخل السيرفر فقط.", ephemeral: true });
        return;
      }

      const member = slash.member as GuildMember | null;
      const hasPermission = member?.permissions.has(PermissionFlagsBits.ModerateMembers)
        || member?.permissions.has(PermissionFlagsBits.Administrator);

      if (!hasPermission) {
        await slash.reply({ content: "⛔ ما عندك صلاحية لاستخدام أوامر الإدارة.", ephemeral: true });
        return;
      }

      // /mod warn
      if (sub === "warn") {
        const target = slash.options.getUser("user", true);
        const reason = slash.options.getString("reason") ?? "لم يُذكر سبب";
        const key = `${guild.id}:${target.id}`;
        if (!userWarnings.has(key)) userWarnings.set(key, []);
        userWarnings.get(key)!.push({ reason, moderatorId: userId, timestamp: Date.now() });
        db.markDirty();
        const count = userWarnings.get(key)!.length;
        const embed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle("⚠️ تحذير")
          .addFields(
            { name: "العضو", value: `<@${target.id}>`, inline: true },
            { name: "عدد التحذيرات", value: `${count}`, inline: true },
            { name: "السبب", value: reason },
          )
          .setFooter({ text: `بواسطة ${slash.user.username}` })
          .setTimestamp();
        await slash.reply({ embeds: [embed] });
        try { await target.send(`⚠️ تلقيت تحذيراً في **${guild.name}**\n**السبب:** ${reason}\n**إجمالي تحذيراتك:** ${count}`); } catch { /* DM مغلق */ }
        return;
      }

      // /mod unwarn
      if (sub === "unwarn") {
        const target = slash.options.getUser("user", true);
        const key = `${guild.id}:${target.id}`;
        const warns = userWarnings.get(key) ?? [];
        if (warns.length === 0) {
          await slash.reply({ content: `<@${target.id}> ما عنده تحذيرات.`, ephemeral: true });
          return;
        }
        warns.pop();
        db.markDirty();
        await slash.reply({ content: `✅ تم إلغاء آخر تحذير لـ <@${target.id}>. التحذيرات المتبقية: **${warns.length}**` });
        return;
      }

      // /mod warnings
      if (sub === "warnings") {
        const target = slash.options.getUser("user", true);
        const key = `${guild.id}:${target.id}`;
        const warns = userWarnings.get(key) ?? [];
        if (warns.length === 0) {
          await slash.reply({ content: `<@${target.id}> ما عنده تحذيرات.`, ephemeral: true });
          return;
        }
        const lines = warns.map((w, i) => {
          const date = new Date(w.timestamp).toLocaleDateString("ar-SA");
          return `**${i + 1}.** ${w.reason} — <@${w.moderatorId}> (${date})`;
        });
        const embed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle(`📋 تحذيرات ${target.username}`)
          .setDescription(lines.join("\n").slice(0, 4000))
          .setThumbnail(target.displayAvatarURL());
        await slash.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // /mod mute
      if (sub === "mute") {
        const target = slash.options.getMember("user") as GuildMember | null;
        if (!target) { await slash.reply({ content: "ما قدرت أجد العضو.", ephemeral: true }); return; }
        const minutes = slash.options.getInteger("minutes") ?? 10;
        const reason = slash.options.getString("reason") ?? "لم يُذكر سبب";
        try {
          await target.timeout(minutes * 60 * 1000, reason);
          const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🔇 تم الكتم")
            .addFields(
              { name: "العضو", value: `<@${target.id}>`, inline: true },
              { name: "المدة", value: `${minutes} دقيقة`, inline: true },
              { name: "السبب", value: reason },
            )
            .setFooter({ text: `بواسطة ${slash.user.username}` })
            .setTimestamp();
          await slash.reply({ embeds: [embed] });
        } catch {
          await slash.reply({ content: "ما قدرت أكتم العضو — تأكد إن البوت عنده صلاحية Moderate Members.", ephemeral: true });
        }
        return;
      }

      // /mod unmute
      if (sub === "unmute") {
        const target = slash.options.getMember("user") as GuildMember | null;
        if (!target) { await slash.reply({ content: "ما قدرت أجد العضو.", ephemeral: true }); return; }
        try {
          await target.timeout(null);
          await slash.reply({ content: `🔊 تم فك الكتم عن <@${target.id}>` });
        } catch {
          await slash.reply({ content: "ما قدرت أفك الكتم.", ephemeral: true });
        }
        return;
      }

      // /mod kick
      if (sub === "kick") {
        const target = slash.options.getMember("user") as GuildMember | null;
        if (!target) { await slash.reply({ content: "ما قدرت أجد العضو.", ephemeral: true }); return; }
        const reason = slash.options.getString("reason") ?? "لم يُذكر سبب";
        try {
          await target.kick(reason);
          const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("👢 تم الطرد")
            .addFields(
              { name: "العضو", value: target.user.username, inline: true },
              { name: "السبب", value: reason },
            )
            .setFooter({ text: `بواسطة ${slash.user.username}` })
            .setTimestamp();
          await slash.reply({ embeds: [embed] });
        } catch {
          await slash.reply({ content: "ما قدرت أطرد العضو — تأكد إن البوت عنده صلاحية Kick Members.", ephemeral: true });
        }
        return;
      }

      // /mod ban
      if (sub === "ban") {
        const target = slash.options.getMember("user") as GuildMember | null;
        if (!target) { await slash.reply({ content: "ما قدرت أجد العضو.", ephemeral: true }); return; }
        const reason = slash.options.getString("reason") ?? "لم يُذكر سبب";
        try {
          await target.ban({ reason });
          const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🔨 تم الباند")
            .addFields(
              { name: "العضو", value: target.user.username, inline: true },
              { name: "السبب", value: reason },
            )
            .setFooter({ text: `بواسطة ${slash.user.username}` })
            .setTimestamp();
          await slash.reply({ embeds: [embed] });
        } catch {
          await slash.reply({ content: "ما قدرت أباند العضو — تأكد إن البوت عنده صلاحية Ban Members.", ephemeral: true });
        }
        return;
      }

      // /mod unban
      if (sub === "unban") {
        const targetId = slash.options.getString("userid", true).trim();
        try {
          await guild.bans.remove(targetId);
          await slash.reply({ content: `🔓 تم فك الباند عن العضو \`${targetId}\`` });
        } catch {
          await slash.reply({ content: "ما قدرت أفك الباند — تأكد من صحة الـ ID وأن البوت عنده صلاحية Ban Members.", ephemeral: true });
        }
        return;
      }

      // /mod setnick
      if (sub === "setnick") {
        const target = slash.options.getMember("user") as GuildMember | null;
        if (!target) { await slash.reply({ content: "ما قدرت أجد العضو.", ephemeral: true }); return; }
        const nickname = slash.options.getString("nickname") ?? null;
        try {
          await target.setNickname(nickname);
          const msg = nickname
            ? `✏️ تم تغيير اسم <@${target.id}> إلى **${nickname}**`
            : `✏️ تم إزالة اسم <@${target.id}> المخصص`;
          await slash.reply({ content: msg });
        } catch {
          await slash.reply({ content: "ما قدرت أغير الاسم — تأكد إن البوت عنده صلاحية Manage Nicknames.", ephemeral: true });
        }
        return;
      }

      // /mod clear
      if (sub === "clear") {
        const amount = slash.options.getInteger("amount", true);
        if (!slash.channel || !slash.channel.isTextBased() || slash.channel.isDMBased()) {
          await slash.reply({ content: "هذا الأمر يشتغل في قنوات النص فقط.", ephemeral: true });
          return;
        }
        try {
          await slash.deferReply({ ephemeral: true });
          const deleted = await (slash.channel as import("discord.js").TextChannel).bulkDelete(amount, true);
          await slash.editReply({ content: `🗑️ تم حذف **${deleted.size}** رسالة` });
        } catch {
          await slash.editReply({ content: "ما قدرت أحذف الرسائل — تأكد إن البوت عنده صلاحية Manage Messages." });
        }
        return;
      }
    }
  });

  client.login(token).catch((err) => logger.error({ err }, "Failed to login Discord bot"));
  return client;
}

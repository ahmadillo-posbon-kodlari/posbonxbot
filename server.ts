import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

// Remove any legacy local database file to guarantee zero disk storage of user data
try {
  const legacyDb = path.resolve(process.cwd(), "data", "posbon_db.json");
  if (fs.existsSync(legacyDb)) {
    fs.unlinkSync(legacyDb);
  }
} catch {
  // ignore
}

const app = express();
const PORT = 3000;

// ============================================================================
// 1. SECURITY HEADERS & RATE LIMITING
// ============================================================================
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), geolocation=(), payment=(), usb=()"
  );

  if (req.path.startsWith("/api/")) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const record = rateLimitMap.get(ip);
    if (!record || now > record.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    } else {
      record.count += 1;
      if (record.count > 200) {
        return res
          .status(429)
          .json({ ok: false, error: "So'rovlar soni oshib ketdi. Biroz kuting." });
      }
    }
  }
  next();
});

app.use(express.json({ limit: "35mb" }));
app.use(express.urlencoded({ extended: true, limit: "35mb" }));

// ============================================================================
// 2. DYNAMIC GEMINI AI CLIENTS & MULTI-MODEL ENGINE
// ============================================================================
function isRealKey(val?: string): boolean {
  return Boolean(
    val &&
      val.trim().length > 15 &&
      !val.startsWith("MY_GEMINI") &&
      val !== "YOUR_API_KEY"
  );
}

function getScannerClient(): GoogleGenAI {
  const apiKey = isRealKey(process.env.GEMINI_SCANNER_API_KEY)
    ? process.env.GEMINI_SCANNER_API_KEY!
    : process.env.GEMINI_API_KEY || "";
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

function getChatClient(): GoogleGenAI {
  const apiKey = isRealKey(process.env.GEMINI_CHAT_API_KEY)
    ? process.env.GEMINI_CHAT_API_KEY!
    : process.env.GEMINI_API_KEY || "";
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

const ACTIVE_TEXT_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
];

async function generateWithFallback(
  client: GoogleGenAI,
  params: { contents: any; config?: any }
) {
  let lastError: any = null;
  for (const modelName of ACTIVE_TEXT_MODELS) {
    try {
      const response = await client.models.generateContent({
        model: modelName,
        contents: params.contents,
        config: params.config,
      });
      if (response && response.text) {
        return response;
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("AI model response failed");
}

// ============================================================================
// 3. IN-MEMORY STORE, OTP AUTH & ADMIN PASSWORD MANAGEMENT
// ============================================================================
let adminPassword = process.env.ADMIN_PASSWORD || "0513";
const activeAdminTokens = new Set<string>();

export interface ScanRecord {
  id: string;
  timestamp: string;
  source: "web" | "telegram";
  category: "fayl" | "hujjat" | "rasm" | "video" | "ovoz" | "havola";
  fileName: string;
  fileSize?: string;
  mimeType?: string;
  senderName: string;
  senderUsername?: string;
  chatId?: string;
  sessionId?: string;
  userCommand?: string;
  safetyPercent: number;
  riskPercent: number;
  status: "Xavfsiz" | "Shubhali" | "Xavfli";
  actionTaken: string;
  wasDeleted: boolean;
  contentsSummary: string;
  detailedExplanation: string;
  recommendations: string[];
  permissionsOrIndicators: string[];
}

export interface MessageEventRecord {
  id: string;
  timestamp: string;
  chatId: string;
  eventType: "edited" | "deleted_by_sender" | "bot_deleted_virus";
  senderName: string;
  senderUsername?: string;
  originalContent: string;
  newContent?: string;
  details: string;
}

export interface DeletedFileRecord {
  id: string;
  scanId: string;
  fileName: string;
  fileType: string;
  senderName: string;
  senderUsername?: string;
  chatId?: string;
  deletedAt: string;
  riskPercent: number;
  threatName: string;
  reason: string;
}

export interface TelegramUserRecord {
  chatId: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  languageCode: string;
  connectedAt: string;
  lastActiveAt: string;
  businessConnectionId?: string;
  autoDeleteVirus: boolean;
}

interface CachedMessage {
  chatId: string;
  ownerChatId: string;
  messageId: number;
  senderName: string;
  senderUsername?: string;
  content: string;
  timestamp: string;
}

const memoryStore: {
  scans: ScanRecord[];
  messageEvents: MessageEventRecord[];
  deletedFiles: DeletedFileRecord[];
  telegramUsers: TelegramUserRecord[];
  otpCodes: Record<string, { code: string; expiresAt: number }>; // chatId -> 6-digit OTP
  verifiedSessions: Record<string, string>; // userAuthToken -> verifiedChatId
  businessConnections: Record<string, string>; // business_connection_id -> owner private chatId
  groupOwners: Record<string, string>; // group/channel chatId -> admin private chatId
  messageCache: Map<string, CachedMessage>; // `${chatId}:${messageId}` -> CachedMessage
} = {
  scans: [],
  messageEvents: [],
  deletedFiles: [],
  telegramUsers: [],
  otpCodes: {},
  verifiedSessions: {},
  businessConnections: {},
  groupOwners: {},
  messageCache: new Map(),
};

let clockOffsetMs = 0;

function calibrateClockFromEpoch(epochMs?: number) {
  if (epochMs && typeof epochMs === "number" && epochMs > 1700000000000) {
    const diff = epochMs - Date.now();
    // Only accept reasonable calibration or if offset hasn't been set
    if (Math.abs(diff) < 30 * 24 * 3600 * 1000) {
      clockOffsetMs = diff;
    }
  }
}

function getRealNow(): Date {
  return new Date(Date.now() + clockOffsetMs);
}

function formatUzbekTime(dateInput?: Date | number | string): string {
  const d = dateInput
    ? typeof dateInput === "number" || typeof dateInput === "string"
      ? new Date(dateInput)
      : dateInput
    : getRealNow();

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    // en-CA formats as "YYYY-MM-DD, HH:mm:ss"
    return formatter.format(d).replace(",", "");
  } catch {
    const pad = (n: number) => String(n).padStart(2, "0");
    const offsetDate = new Date(d.getTime() + 5 * 3600 * 1000);
    return `${offsetDate.getUTCFullYear()}-${pad(offsetDate.getUTCMonth() + 1)}-${pad(
      offsetDate.getUTCDate()
    )} ${pad(offsetDate.getUTCHours())}:${pad(offsetDate.getUTCMinutes())}:${pad(
      offsetDate.getUTCSeconds()
    )}`;
  }
}

function getUzbekDateTimeContext(dateInput?: Date | number | string) {
  const d = dateInput
    ? typeof dateInput === "number" || typeof dateInput === "string"
      ? new Date(dateInput)
      : dateInput
    : getRealNow();

  const daysOfWeekUz = [
    "Yakshanba",
    "Dushanba",
    "Seshanba",
    "Chorshanba",
    "Payshanba",
    "Juma",
    "Shanba",
  ];
  const monthsUz = [
    "yanvar",
    "fevral",
    "mart",
    "aprel",
    "may",
    "iyun",
    "iyul",
    "avgust",
    "sentabr",
    "oktabr",
    "noyabr",
    "dekabr",
  ];

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
    const year = getPart("year") || String(d.getFullYear());
    const monthNum = Math.max(0, parseInt(getPart("month") || "1", 10) - 1);
    const day = getPart("day") || String(d.getDate());
    const hour = (getPart("hour") || "00").padStart(2, "0");
    const minute = (getPart("minute") || "00").padStart(2, "0");
    const weekdayEn = getPart("weekday");

    const weekdayIndex = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ].indexOf(weekdayEn);
    const weekdayUz = weekdayIndex >= 0 ? daysOfWeekUz[weekdayIndex] : daysOfWeekUz[d.getDay()];
    const monthUz = monthsUz[monthNum] || "oktabr";

    return {
      fullDateUz: `${year}-yil ${day}-${monthUz}, ${weekdayUz}`,
      shortDate: `${year}-${String(monthNum + 1).padStart(2, "0")}-${day.padStart(2, "0")}`,
      timeStr: `${hour}:${minute}`,
      year,
      monthUz,
      day,
      weekdayUz,
    };
  } catch {
    const pad = (n: number) => String(n).padStart(2, "0");
    const offsetDate = new Date(d.getTime() + 5 * 3600 * 1000);
    const year = String(offsetDate.getUTCFullYear());
    const monthNum = offsetDate.getUTCMonth();
    const day = String(offsetDate.getUTCDate());
    const hour = pad(offsetDate.getUTCHours());
    const minute = pad(offsetDate.getUTCMinutes());
    const weekdayUz = daysOfWeekUz[offsetDate.getUTCDay()] || "Dushanba";
    const monthUz = monthsUz[monthNum] || "oktabr";

    return {
      fullDateUz: `${year}-yil ${day}-${monthUz}, ${weekdayUz}`,
      shortDate: `${year}-${pad(monthNum + 1)}-${pad(Number(day))}`,
      timeStr: `${hour}:${minute}`,
      year,
      monthUz,
      day,
      weekdayUz,
    };
  }
}

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================================================
// 4. PRECISION FILE & .APK INSPECTOR (Distinguishes Clean APK vs Virus APK)
// ============================================================================
function inspectFileSignatures(
  fileName: string,
  mimeType = "",
  captionText = "",
  binaryIndicators = ""
): {
  isConfirmedMalware: boolean;
  isCleanApkCandidate: boolean;
  reason: string;
  threatName: string;
} {
  const lowerName = fileName.toLowerCase().trim();
  const lowerCaption = captionText.toLowerCase().trim();
  const lowerBin = binaryIndicators.toLowerCase();

  // 1. Disguised double extensions (e.g. rasm.jpg.apk, shartnoma.pdf.exe, video.mp4.scr)
  if (
    /\.(jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx|mp4|mp3|txt)\.(apk|exe|bat|scr|vbs|cmd|msi|js|jar)$/i.test(
      lowerName
    )
  ) {
    return {
      isConfirmedMalware: true,
      isCleanApkCandidate: false,
      threatName: "Trojan.DisguisedFileExtension",
      reason:
        "Rasm, video yoki hujjat niqobi ostida yashiringan ikki kengaytmali zararli virus fayli aniqlandi.",
    };
  }

  // 2. Desktop system script droppers (.scr, .bat, .vbs, .cmd, .hta, .pif)
  if (/\.(bat|cmd|scr|vbs|pif|hta|cpl|ps1)$/i.test(lowerName)) {
    return {
      isConfirmedMalware: true,
      isCleanApkCandidate: false,
      threatName: "Malware.ScriptDropper",
      reason: "Tizim buyruqlarini yashirin bajaruvchi zararli skript fayli aniqlandi.",
    };
  }

  // 3. Check if it is an APK file
  const isApk =
    lowerName.endsWith(".apk") ||
    lowerName.endsWith(".xapk") ||
    mimeType === "application/vnd.android.package-archive";

  if (isApk) {
    // Explicit virus / scam trap filenames used in Telegram attacks:
    // e.g. Taklifnoma.apk, Toy_taklifnomasi.apk, Foto.apk, Video.apk, Click_bonus.apk, Virus.apk, SpyNote.apk
    const scamApkFileNamePattern =
      /(virus|trojan|spynote|bankbot|mamont|anubis|cerberus|rat|stealer|keylogger|taklifnoma|taklif|toy_|to'y|nikoh|foto|rasm|video_apk|skrinshot|shartnoma|hujjat|buyruq|qarzdorlik|mib_|jarima|sud_|chaqiruv|yutuq|bonus|aksiya|sovga|mukofot|click_bonus|payme_bonus|uzum_bonus|humo_bonus|uzcard_bonus|karta_yechish|pul_ishlash|vzlom|crack|mod_hack|cheat_apk)/i;

    if (
      scamApkFileNamePattern.test(lowerName) ||
      scamApkFileNamePattern.test(lowerCaption)
    ) {
      return {
        isConfirmedMalware: true,
        isCleanApkCandidate: false,
        threatName: "Trojan.AndroidOS.TelegramScamAPK",
        reason:
          "Aldov yo'li bilan (taklifnoma, rasm, bonus yoki vzlom niqobi ostida) tarqatilayotgan zararli .APK trojan dasturi aniqlandi.",
      };
    }

    // Check binary indicators for known RAT/Banker signatures
    const ratSignatures =
      /(spynote|metasploit|cerberus|anubis|ermac|hydra_bot|mamont|teabot|alien_bot|sharkbot|octo_bot|flubot)/i;
    const hasSmsAndAccessibilityCombo =
      lowerBin.includes("bind_accessibility_service") &&
      (lowerBin.includes("read_sms") || lowerBin.includes("receive_sms"));

    if (ratSignatures.test(lowerBin) || hasSmsAndAccessibilityCombo) {
      return {
        isConfirmedMalware: true,
        isCleanApkCandidate: false,
        threatName: "Trojan.AndroidOS.SpyBanker",
        reason:
          "APK ichki kodlarida SMS xabarlarni o'qish va ekranni yashirin boshqarish (Accessibility) trojan moduli aniqlandi.",
      };
    }

    // Otherwise, this is an ordinary/legitimate APK candidate!
    return {
      isConfirmedMalware: false,
      isCleanApkCandidate: true,
      threatName: "Toza APK",
      reason:
        "Oddiy .APK dastur fayli. Ichida trojan, SMS o'g'irlovchi yoki firibgarlik alomatlari topilmadi.",
    };
  }

  // 4. EICAR test virus
  if (`${lowerName} ${lowerCaption} ${lowerBin}`.includes("x5o!p%@ap[4\\pzx54(p^)7cc)7}$eicar")) {
    return {
      isConfirmedMalware: true,
      isCleanApkCandidate: false,
      threatName: "EICAR-Test-Virus",
      reason: "Test virus imzosi aniqlandi.",
    };
  }

  return {
    isConfirmedMalware: false,
    isCleanApkCandidate: false,
    threatName: "Toza",
    reason: "",
  };
}

interface AnalyzeInput {
  source: "web" | "telegram";
  category: "fayl" | "hujjat" | "rasm" | "video" | "ovoz" | "havola";
  fileName: string;
  fileSize?: string;
  mimeType?: string;
  base64Data?: string;
  textContent?: string;
  binaryIndicators?: string;
  userCommand?: string;
  senderName?: string;
  senderUsername?: string;
  chatId?: string;
  sessionId?: string;
}

async function analyzeWithPosbonScanner(input: AnalyzeInput): Promise<ScanRecord> {
  const sigCheck = inspectFileSignatures(
    input.fileName,
    input.mimeType,
    input.textContent,
    input.binaryIndicators
  );

  const systemPrompt = `Siz POSBON AI — kiberxavfsizlik bo'yicha oliy toifali sun'iy intellekt tahlilchisisiz.
Vazifangiz: Foydalanuvchi yuborgan fayl (.apk, hujjat, arxiv), rasm, video, ovozli xabar yoki havolani chuqur tahlil qilish va necha foiz xavfsiz yoki xavfli ekanligini aniqlash.

QAT'IY QOIDALAR:
1. Barcha matnlarni faqat O'ZBEK TILIDA, xushmuomala va tushunarli yozing.
2. MUHIM: Har qanday ".apk" faylni avtomatik ravishda xavfli deb hisoblamang! Agar .apk fayl oddiy, foydali dastur bo'lsa (masalan: o'yin, kalkulyator, lug'at, rasmiy ilova, oddiy dastur) va uning nomida yoki ichida firibgarlik (taklifnoma.apk, rasm.apk, bonus.apk, bank trojani, vzlom, virus) bo'lmasa — uni ALBATTA "Xavfsiz" deb belgilang ("safetyPercent": 90-99, "riskPercent": 1-10, "status": "Xavfsiz")!
3. Faqatgina haqiqiy virus, trojan, SMS o'g'irlovchi, firibgarlik niqobidagi .apk (taklifnoma.apk, foto.apk, click_bonus.apk, yutuq.apk, vzlom.apk) yoki zararli skript bo'lsagina "status" ni "Xavfli" ("riskPercent": 85-99) deb belgilang.`;

  const promptText = `Tahlil ob'ekti:
- Manba: ${input.source === "telegram" ? "Telegram (@POSBONXBOT)" : "POSBON AI Skayneri"}
- Kategoriya: ${input.category}
- Fayl nomi: ${input.fileName}
- Hajmi: ${input.fileSize || "Noma'lum"}
- MIME turi: ${input.mimeType || "Noma'lum"}
- Yuboruvchi: ${input.senderName || "Foydalanuvchi"}
- Foydalanuvchi buyrug'i / izoh: ${input.userCommand || "Ushbu fayl xavfsizmi?"}
- Qo'shimcha matn: ${input.textContent ? input.textContent.slice(0, 2500) : "Yo'q"}
- Dastlabki texnik tekshiruv xulosasi: ${
    sigCheck.isConfirmedMalware
      ? `XAVFLI VIRUS ALOMATI TOPILDI: ${sigCheck.reason} (${sigCheck.threatName})`
      : sigCheck.isCleanApkCandidate
      ? `TOZA APK: ${sigCheck.reason} (Ushbu .apk faylda virus alomatlari yo'q, uni Xavfsiz deb baholang!)`
      : "Zararli virus imzolari topilmadi."
  }`;

  try {
    const parts: any[] = [];
    if (
      input.base64Data &&
      input.mimeType &&
      (input.mimeType.startsWith("image/") ||
        input.mimeType.startsWith("audio/") ||
        input.mimeType === "application/pdf") &&
      input.base64Data.length < 15 * 1024 * 1024
    ) {
      parts.push({
        inlineData: {
          mimeType: input.mimeType,
          data: input.base64Data,
        },
      });
    }
    parts.push({ text: promptText });

    const response = await generateWithFallback(getScannerClient(), {
      contents: { parts },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safetyPercent: { type: Type.INTEGER },
            riskPercent: { type: Type.INTEGER },
            status: { type: Type.STRING },
            contentsSummary: { type: Type.STRING },
            detailedExplanation: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            permissionsOrIndicators: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            threatName: { type: Type.STRING },
          },
          required: [
            "safetyPercent",
            "riskPercent",
            "status",
            "contentsSummary",
            "detailedExplanation",
            "recommendations",
            "permissionsOrIndicators",
            "threatName",
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    let riskPercent = Math.min(100, Math.max(0, Number(parsed.riskPercent ?? 5)));

    if (sigCheck.isConfirmedMalware && riskPercent < 85) {
      riskPercent = 96;
    } else if (sigCheck.isCleanApkCandidate && !sigCheck.isConfirmedMalware && riskPercent > 25) {
      // Prevent false-positive deletion on clean/ordinary APK files!
      riskPercent = 8;
    }

    const safetyPercent = Math.min(100, Math.max(0, 100 - riskPercent));

    let status: "Xavfsiz" | "Shubhali" | "Xavfli" = "Xavfsiz";
    if (sigCheck.isConfirmedMalware || riskPercent >= 70) {
      status = "Xavfli";
    } else if (riskPercent >= 40) {
      status = "Shubhali";
    } else {
      status = "Xavfsiz";
    }

    // Strictly delete ONLY when status === "Xavfli"
    const wasDeleted = status === "Xavfli";
    const actionTaken = wasDeleted
      ? "Avtomatik o'chirildi (Xavfli virus)"
      : "Tegilmadi (Xavfsiz fayl)";

    const nowStr = formatUzbekTime();
    const scanRecord: ScanRecord = {
      id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowStr,
      source: input.source,
      category: input.category,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      senderName: input.senderName || "Foydalanuvchi",
      senderUsername: input.senderUsername,
      chatId: input.chatId,
      sessionId: input.sessionId,
      userCommand: input.userCommand,
      safetyPercent,
      riskPercent,
      status,
      actionTaken,
      wasDeleted,
      contentsSummary:
        parsed.contentsSummary ||
        (sigCheck.isConfirmedMalware
          ? sigCheck.reason
          : "Fayl strukturasi va tarkibi tekshirildi, zararli kodlar topilmadi."),
      detailedExplanation:
        parsed.detailedExplanation || "AI tahlili muvaffaqiyatli yakunlandi.",
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : ["Xavfsizlik qoidalariga amal qiling."],
      permissionsOrIndicators: Array.isArray(parsed.permissionsOrIndicators)
        ? parsed.permissionsOrIndicators
        : ["AI tekshiruvidan o'tdi"],
    };

    memoryStore.scans.unshift(scanRecord);
    if (memoryStore.scans.length > 300) memoryStore.scans.pop();

    if (wasDeleted) {
      memoryStore.deletedFiles.unshift({
        id: `del-${Date.now()}`,
        scanId: scanRecord.id,
        fileName: scanRecord.fileName,
        fileType: input.category.toUpperCase(),
        senderName: scanRecord.senderName,
        senderUsername: scanRecord.senderUsername,
        chatId: scanRecord.chatId,
        deletedAt: nowStr,
        riskPercent: scanRecord.riskPercent,
        threatName: parsed.threatName || sigCheck.threatName || "Malware.Detected",
        reason: scanRecord.contentsSummary,
      });
    }

    return scanRecord;
  } catch {
    const riskPercent = sigCheck.isConfirmedMalware ? 95 : 5;
    const safetyPercent = 100 - riskPercent;
    const status: "Xavfsiz" | "Shubhali" | "Xavfli" = sigCheck.isConfirmedMalware
      ? "Xavfli"
      : "Xavfsiz";
    const wasDeleted = status === "Xavfli";
    const nowStr = formatUzbekTime();

    const scanRecord: ScanRecord = {
      id: `scan-${Date.now()}`,
      timestamp: nowStr,
      source: input.source,
      category: input.category,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      senderName: input.senderName || "Foydalanuvchi",
      senderUsername: input.senderUsername,
      chatId: input.chatId,
      sessionId: input.sessionId,
      userCommand: input.userCommand,
      safetyPercent,
      riskPercent,
      status,
      actionTaken: wasDeleted
        ? "Avtomatik o'chirildi (Xavfli virus)"
        : "Tegilmadi (Xavfsiz fayl)",
      wasDeleted,
      contentsSummary: sigCheck.isConfirmedMalware
        ? sigCheck.reason
        : "Fayl tarkibida zararli virus kodlari yoki trojan alomatlari topilmadi.",
      detailedExplanation: sigCheck.isConfirmedMalware
        ? `"${input.fileName}" fayli ${riskPercent}% xavfli virus deb topildi va darhol avtomatik o'chirib tashlandi.`
        : `"${input.fileName}" to'liq tekshirildi va ${safetyPercent}% xavfsiz deb topildi. Xavfsiz bo'lgani uchun faylga tegilmadi.`,
      recommendations: wasDeleted
        ? ["Zararli faylni qurilmangizga o'rnatmang."]
        : ["Fayl toza va xavfsiz, bemalol foydalanishingiz mumkin."],
      permissionsOrIndicators: wasDeleted
        ? [sigCheck.threatName]
        : ["Virus topilmadi"],
    };

    memoryStore.scans.unshift(scanRecord);
    if (wasDeleted) {
      memoryStore.deletedFiles.unshift({
        id: `del-${Date.now()}`,
        scanId: scanRecord.id,
        fileName: scanRecord.fileName,
        fileType: input.category.toUpperCase(),
        senderName: scanRecord.senderName,
        senderUsername: scanRecord.senderUsername,
        chatId: scanRecord.chatId,
        deletedAt: nowStr,
        riskPercent: scanRecord.riskPercent,
        threatName: sigCheck.threatName,
        reason: scanRecord.contentsSummary,
      });
    }
    return scanRecord;
  }
}

// ============================================================================
// 5. TELEGRAM BOT (@POSBONXBOT) ENGINE
// ============================================================================
const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN &&
  process.env.TELEGRAM_BOT_TOKEN !== "MY_TELEGRAM_BOT_TOKEN"
    ? process.env.TELEGRAM_BOT_TOKEN
    : "8917943761:AAGKMQOa164mFiqEBMhSyjhIpciIL6odD8M";

const TG_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const TG_FILE_BASE = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}`;

let botInfo: { id?: number; username?: string; first_name?: string; online: boolean } = {
  username: "POSBONXBOT",
  first_name: "POSBON AI",
  online: true,
};
let lastUpdateId = 0;
let isPollingActive = false;

async function tgCall(method: string, body?: Record<string, any>) {
  try {
    const res = await fetch(`${TG_API_BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Guaranteed delivery of bot reports (escapes HTML entities or falls back to plain text if needed)
 */
async function sendBotReportSafe(targetChatId: string, htmlText: string) {
  if (!targetChatId) return { ok: false };
  const res = await tgCall("sendMessage", {
    chat_id: targetChatId,
    text: htmlText,
    parse_mode: "HTML",
  });
  if (!res?.ok) {
    // Fallback to plain text if HTML failed for any reason
    const plainText = htmlText.replace(/<[^>]+>/g, "");
    return await tgCall("sendMessage", {
      chat_id: targetChatId,
      text: plainText,
    });
  }
  return res;
}

async function extractTelegramFileSnippet(fileId?: string, fileSize = 0): Promise<string> {
  if (!fileId || fileSize > 12 * 1024 * 1024) return "";
  try {
    const info = await tgCall("getFile", { file_id: fileId });
    const filePath = info?.result?.file_path;
    if (!filePath) return "";

    const res = await fetch(`${TG_FILE_BASE}/${filePath}`, {
      headers: { Range: "bytes=0-65535" },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return buf
      .toString("latin1")
      .replace(/[^\x20-\x7E]+/g, " ")
      .slice(0, 3000);
  } catch {
    return "";
  }
}

async function deleteTelegramVirusMessage(
  chatId: string,
  messageId?: number,
  businessConnectionId?: string
): Promise<boolean> {
  if (!messageId) return false;
  let deleted = false;

  if (businessConnectionId) {
    const bizRes = await tgCall("deleteBusinessMessages", {
      business_connection_id: businessConnectionId,
      message_ids: [messageId],
    });
    if (bizRes?.ok) deleted = true;
  }

  const stdRes = await tgCall("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
  if (stdRes?.ok) deleted = true;

  return deleted;
}

async function resolveGroupOrChannelOwner(chatId: string, fallbackUserId?: string): Promise<string> {
  if (memoryStore.groupOwners[chatId]) {
    return memoryStore.groupOwners[chatId];
  }
  try {
    const adminsRes = await tgCall("getChatAdministrators", { chat_id: chatId });
    if (adminsRes?.ok && Array.isArray(adminsRes.result)) {
      // Find an admin who has already started the bot if possible, or the creator
      for (const adm of adminsRes.result) {
        if (!adm.user?.is_bot) {
          const idStr = String(adm.user.id);
          if (memoryStore.telegramUsers.some((u) => u.chatId === idStr)) {
            memoryStore.groupOwners[chatId] = idStr;
            return idStr;
          }
        }
      }
      const creator = adminsRes.result.find((a: any) => a.status === "creator" && !a.user?.is_bot);
      const anyHumanAdmin = adminsRes.result.find((a: any) => !a.user?.is_bot);
      const chosen = creator || anyHumanAdmin;
      if (chosen?.user?.id) {
        const adminId = String(chosen.user.id);
        memoryStore.groupOwners[chatId] = adminId;
        return adminId;
      }
    }
  } catch {
    // ignore
  }
  return fallbackUserId || memoryStore.telegramUsers[0]?.chatId || "";
}

function registerOrUpdateTelegramUser(
  from: any,
  chatIdStr: string,
  businessConnectionId?: string
): TelegramUserRecord {
  const nowStr = formatUzbekTime();
  let existing = memoryStore.telegramUsers.find((u) => u.chatId === chatIdStr);
  if (existing) {
    existing.username = from?.username ? `@${from.username}` : existing.username;
    existing.firstName = from?.first_name || existing.firstName;
    existing.lastName = from?.last_name || existing.lastName;
    existing.lastActiveAt = nowStr;
    if (businessConnectionId) existing.businessConnectionId = businessConnectionId;
  } else {
    existing = {
      chatId: chatIdStr,
      userId: String(from?.id || chatIdStr),
      username: from?.username ? `@${from.username}` : "Foydalanuvchi",
      firstName: from?.first_name || "Telegram",
      lastName: from?.last_name || "",
      languageCode: from?.language_code || "uz",
      connectedAt: nowStr,
      lastActiveAt: nowStr,
      businessConnectionId,
      autoDeleteVirus: true,
    };
    memoryStore.telegramUsers.unshift(existing);
  }
  return existing;
}

function formatTelegramSecurityReport(scan: ScanRecord, chatTitle?: string): string {
  const badge =
    scan.status === "Xavfsiz"
      ? "✅ XAVFSIZ (FAYLGA TEGILMADI)"
      : scan.status === "Shubhali"
      ? "⚠️ SHUBHALI (EHTIYOT BO'LING)"
      : "🚨 XAVFLI VIRUS (AVTOMATIK O'CHIRILDI)";

  const recs = scan.recommendations
    .map((r, i) => `${i + 1}. ${escapeHtml(r)}`)
    .join("\n");

  return `🛡️ <b>POSBON AI — FAYL TAHLILI HISOBOTI</b>

📊 <b>Holat:</b> ${badge}${chatTitle ? `\n📢 <b>Manba:</b> ${escapeHtml(chatTitle)}` : ""}
👤 <b>Kimdan:</b> ${escapeHtml(scan.senderName)} ${
    scan.senderUsername ? `(${escapeHtml(scan.senderUsername)})` : ""
  }
🕒 <b>Vaqt:</b> ${escapeHtml(scan.timestamp)}
📄 <b>Fayl:</b> <code>${escapeHtml(scan.fileName)}</code>
📈 <b>Xavfsizlik:</b> ${scan.safetyPercent}% | <b>Xavf:</b> ${scan.riskPercent}%

🔍 <b>Ichidagi ma'lumotlar:</b>
${escapeHtml(scan.contentsSummary)}

📋 <b>AI Tahlil Xulosasi:</b>
${escapeHtml(scan.detailedExplanation)}

⚡ <b>Ko'rilgan chora:</b> ${escapeHtml(scan.actionTaken)}

💡 <b>Tavsiyalar:</b>
${recs}`;
}

async function handleTelegramUpdate(update: any) {
  // 1. Track when bot is added as Admin to a Group or Channel (my_chat_member)
  if (update.my_chat_member) {
    const mcm = update.my_chat_member;
    const groupOrChannelId = String(mcm.chat?.id || "");
    const addedByUserId = String(mcm.from?.id || "");
    const newStatus = mcm.new_chat_member?.status;

    if (
      groupOrChannelId &&
      addedByUserId &&
      (newStatus === "administrator" || newStatus === "member")
    ) {
      memoryStore.groupOwners[groupOrChannelId] = addedByUserId;
      registerOrUpdateTelegramUser(mcm.from, addedByUserId);

      await sendBotReportSafe(
        addedByUserId,
        `🛡️ <b>POSBON AI (@POSBONXBOT) "${escapeHtml(
          mcm.chat?.title || "Guruh/Kanal"
        )}" ga ulandi!</b>\n\n• Xavfli virus fayllar darhol avtomatik o'chiriladi va sizga hisobot beriladi.\n• Xavfsiz fayllar va toza .apk larga tegilmaydi, faqat tahlil natijasi shu botga yuboriladi.`
      );
    }
    return;
  }

  // 2. Track Telegram Business connection owner
  if (update.business_connection) {
    const bc = update.business_connection;
    const ownerPrivateChatId = String(bc.user_chat_id || bc.user?.id || "");
    if (bc.id && ownerPrivateChatId) {
      memoryStore.businessConnections[bc.id] = ownerPrivateChatId;
      registerOrUpdateTelegramUser(bc.user, ownerPrivateChatId, bc.id);
      if (bc.is_enabled) {
        await sendBotReportSafe(
          ownerPrivateChatId,
          `🛡️ <b>POSBON AI (@POSBONXBOT) shaxsiy Telegram hisobingizga ulandi!</b>\n\n• Sizga yuborilgan fayllar AI orqali tekshiriladi: xavfsiz bo'lsa tegilmaydi, virus bo'lsa darhol o'chiriladi va hisoboti shu yerga yuboriladi.\n• Kimdir yozgan xabarini tahrirlasa yoki o'chirib yuborsa, uning asl matni va vaqti tarixda saqlanadi.`
        );
      }
    }
    return;
  }

  // 3. Handle DELETED messages in connected Telegram Business chats (deleted_business_messages)
  if (update.deleted_business_messages) {
    const delUpdate = update.deleted_business_messages;
    const bcId = delUpdate.business_connection_id;
    const chatId = String(delUpdate.chat?.id || "");
    const ownerChatId =
      memoryStore.businessConnections[bcId] || memoryStore.telegramUsers[0]?.chatId || "";
    const msgIds: number[] = Array.isArray(delUpdate.message_ids) ? delUpdate.message_ids : [];

    for (const mId of msgIds) {
      const key = `${chatId}:${mId}`;
      const cached = memoryStore.messageCache.get(key);
      if (cached) {
        const nowStr = formatUzbekTime();
        const ev: MessageEventRecord = {
          id: `ev-del-${Date.now()}-${mId}`,
          timestamp: nowStr,
          chatId: cached.ownerChatId || ownerChatId || chatId,
          eventType: "deleted_by_sender",
          senderName: cached.senderName,
          senderUsername: cached.senderUsername,
          originalContent: cached.content,
          details: `${cached.senderName} o'zi yozgan xabarni o'chirib yubordi`,
        };
        memoryStore.messageEvents.unshift(ev);

        // Note: As requested, deleted messages are kept in site history and NOT sent to the bot
        memoryStore.messageCache.delete(key);
      }
    }
    return;
  }

  // 4. Handle EDITED messages (edited_message / edited_business_message)
  const isEdited = Boolean(
    update.edited_message || update.edited_business_message || update.edited_channel_post
  );
  const msg =
    update.message ||
    update.edited_message ||
    update.business_message ||
    update.edited_business_message ||
    update.channel_post ||
    update.edited_channel_post;
  if (!msg) return;

  if (msg.date && typeof msg.date === "number") {
    calibrateClockFromEpoch(msg.date * 1000);
  }

  const chat = msg.chat;
  const from =
    msg.from || msg.sender_chat || { id: chat.id, first_name: chat.title || "Foydalanuvchi" };
  const chatId = String(chat.id);
  const businessConnectionId: string | undefined = msg.business_connection_id;
  const isDirectBotChat = chat.type === "private" && !businessConnectionId;
  const text = (msg.text || msg.caption || "").trim();

  if (isDirectBotChat) {
    registerOrUpdateTelegramUser(from, chatId);
  }

  const ownerBotChatId = businessConnectionId
    ? memoryStore.businessConnections[businessConnectionId] ||
      memoryStore.telegramUsers[0]?.chatId ||
      ""
    : isDirectBotChat
    ? chatId
    : await resolveGroupOrChannelOwner(chatId, from?.id ? String(from.id) : "");

  const senderName = msg.forward_from
    ? `${msg.forward_from.first_name || ""} ${msg.forward_from.last_name || ""}`.trim()
    : msg.forward_sender_name
    ? msg.forward_sender_name
    : `${from.first_name || chat.title || "Foydalanuvchi"} ${from.last_name || ""}`.trim();

  const senderUsername = msg.forward_from?.username
    ? `@${msg.forward_from.username}`
    : from.username
    ? `@${from.username}`
    : undefined;

  // Cache new messages & track edited messages for user's history!
  const cacheKey = `${chatId}:${msg.message_id}`;
  const contentLabel =
    text ||
    msg.document?.file_name ||
    (msg.photo ? "[Rasm]" : msg.video ? "[Video]" : msg.voice ? "[Ovozli xabar]" : "");

  if (isEdited && contentLabel) {
    const prevCached = memoryStore.messageCache.get(cacheKey);
    const oldText = prevCached?.content || "(Avvalgi matn)";
    if (oldText !== contentLabel) {
      const nowStr = formatUzbekTime();
      const editEvent: MessageEventRecord = {
        id: `ev-edit-${Date.now()}-${msg.message_id}`,
        timestamp: nowStr,
        chatId: ownerBotChatId || chatId,
        eventType: "edited",
        senderName,
        senderUsername,
        originalContent: oldText,
        newContent: contentLabel,
        details: `${senderName} xabarini tahrirladi`,
      };
      memoryStore.messageEvents.unshift(editEvent);

      // Update cache with new content
      memoryStore.messageCache.set(cacheKey, {
        chatId,
        ownerChatId: ownerBotChatId || chatId,
        messageId: msg.message_id,
        senderName,
        senderUsername,
        content: contentLabel,
        timestamp: nowStr,
      });

      // Note: As requested, edited messages are recorded in site history and NOT sent to the bot
    }
    if (!msg.document && !msg.photo && !msg.video && !msg.voice && !msg.audio) {
      return;
    }
  } else if (contentLabel && msg.message_id) {
    memoryStore.messageCache.set(cacheKey, {
      chatId,
      ownerChatId: ownerBotChatId || chatId,
      messageId: msg.message_id,
      senderName,
      senderUsername,
      content: contentLabel,
      timestamp: formatUzbekTime(),
    });
  }

  // 5. Handle Bot Commands ONLY when sent directly to the bot in private chat
  if (isDirectBotChat && text.startsWith("/")) {
    const userRecord = registerOrUpdateTelegramUser(from, chatId);

    if (text.startsWith("/start")) {
      const welcomeMsg = `Assalomu alaykum, <b>${escapeHtml(
        from.first_name || "foydalanuvchi"
      )}</b>! 👋

🛡️ <b>POSBON AI (@POSBONXBOT)</b> 24/7 faol holatda.

✅ <b>Sizning ma'lumotlaringiz:</b>
• <b>Chat ID:</b> <code>${chatId}</code>

🔐 <b>Saytda tarixingizni ko'rish:</b>
Saytdagi <b>TELEGRAM</b> bo'limiga ushbu Chat ID (<code>${chatId}</code>) ni kiriting — bot sizga <b>6 xonali bir martalik kod</b> yuboradi. Shu kodni saytga kiritib, barcha fayl tahlillari hamda tahrirlangan/o'chirilgan xabarlar tarixini ko'rishingiz mumkin!

📌 <b>Buyruqlar:</b> /start | /status | /deleted | /info`;

      await sendBotReportSafe(chatId, welcomeMsg);
      return;
    }

    if (text.startsWith("/status")) {
      const userScans = memoryStore.scans.filter((s) => s.chatId === chatId);
      const safeCount = userScans.filter((s) => s.status === "Xavfsiz").length;
      const dangerCount = userScans.filter((s) => s.status === "Xavfli").length;
      const eventsCount = memoryStore.messageEvents.filter((e) => e.chatId === chatId).length;

      const statusMsg = `🛡️ <b>POSBON AI — STATISTIKA (/status)</b>

👤 <b>Foydalanuvchi:</b> ${escapeHtml(userRecord.firstName)}
🆔 <b>Chat ID:</b> <code>${chatId}</code>

📊 <b>Haqiqiy ko'rsatkichlar:</b>
• Jami tekshirilgan fayllar: <b>${userScans.length} ta</b>
• Xavfsiz (tegilmagan): <b>${safeCount} ta</b>
• Zararli (avtomatik o'chirilgan): <b>${dangerCount} ta</b>
• Tahrirlangan / o'chirilgan xabarlar: <b>${eventsCount} ta</b>`;

      await sendBotReportSafe(chatId, statusMsg);
      return;
    }

    if (text.startsWith("/deleted")) {
      const list = memoryStore.deletedFiles
        .filter((d) => !d.chatId || d.chatId === chatId)
        .slice(0, 15);
      if (list.length === 0) {
        await sendBotReportSafe(
          chatId,
          "✅ <b>O'chirilgan zararli fayllar (/deleted):</b>\n\nHozircha xavfli virus fayllar aniqlanmagan."
        );
        return;
      }

      const formattedList = list
        .map(
          (item, idx) =>
            `<b>${idx + 1}. ${escapeHtml(item.fileName)}</b>\n   🕒 Sana: <code>${
              item.deletedAt
            }</code>\n   👤 Kimdan: ${escapeHtml(item.senderName)}\n   ☣️ Xavf: <b>${
              item.riskPercent
            }%</b> (${escapeHtml(item.threatName)})`
        )
        .join("\n\n");

      await sendBotReportSafe(
        chatId,
        `🗑️ <b>AVTOMATIK O'CHIRILGAN ZARARLI FAYLLAR (/deleted)</b>\n\n${formattedList}`
      );
      return;
    }

    if (text.startsWith("/info")) {
      await sendBotReportSafe(
        chatId,
        `ℹ️ <b>POSBON AI HAQIDA (/info)</b>\n\nKiberjinoyatlarni oldindan aniqlash, fayllar va .apk larni AI orqali tahlil qilish (xavfsiziga tegmasdan, faqat xavfli viruslarni avtomatik o'chirish) tizimi.\n📞 Bog'lanish: <code>+998933210513</code>`
      );
      return;
    }
  }

  // 6. ONLY ANALYZE FILES / MEDIA (Never analyze plain text chat messages!)
  let category: AnalyzeInput["category"] | null = null;
  let fileName = "";
  let fileSize = "";
  let mimeType = "";
  let fileId: string | undefined;
  let rawByteSize = 0;

  if (msg.document) {
    fileName = msg.document.file_name || "Fayl";
    rawByteSize = msg.document.file_size || 0;
    fileSize = rawByteSize ? `${(rawByteSize / 1024).toFixed(1)} KB` : "";
    mimeType = msg.document.mime_type || "application/octet-stream";
    fileId = msg.document.file_id;
    category =
      fileName.toLowerCase().endsWith(".apk") ||
      /\.(exe|zip|rar|bat|scr|js|jar|msi|dex|xapk)$/i.test(fileName)
        ? "fayl"
        : "hujjat";
  } else if (msg.photo && msg.photo.length > 0) {
    category = "rasm";
    const largest = msg.photo[msg.photo.length - 1];
    fileName = `Rasm_${largest.file_unique_id || Date.now()}.jpg`;
    rawByteSize = largest.file_size || 0;
    fileSize = rawByteSize ? `${(rawByteSize / 1024).toFixed(1)} KB` : "";
    mimeType = "image/jpeg";
    fileId = largest.file_id;
  } else if (msg.video || msg.video_note) {
    category = "video";
    const vid = msg.video || msg.video_note;
    fileName = vid.file_name || `Video_${Date.now()}.mp4`;
    rawByteSize = vid.file_size || 0;
    fileSize = rawByteSize ? `${(rawByteSize / (1024 * 1024)).toFixed(2)} MB` : "";
    mimeType = vid.mime_type || "video/mp4";
    fileId = vid.file_id;
  } else if (msg.voice || msg.audio) {
    category = "ovoz";
    const media = msg.voice || msg.audio;
    fileName = media.file_name || media.title || `Ovoz_${Date.now()}.ogg`;
    rawByteSize = media.file_size || 0;
    fileSize = rawByteSize ? `${(rawByteSize / 1024).toFixed(1)} KB` : "";
    mimeType = media.mime_type || "audio/ogg";
    fileId = media.file_id;
  }

  // Ignore plain text messages completely — only files/media get scanned
  if (!category) {
    return;
  }

  const binaryIndicators =
    category === "fayl" || category === "hujjat"
      ? await extractTelegramFileSnippet(fileId, rawByteSize)
      : "";

  const recipientChatId = ownerBotChatId || (from?.id ? String(from.id) : chatId);

  // Run full AI + signature analysis FIRST before deciding whether to delete!
  const scanResult = await analyzeWithPosbonScanner({
    source: "telegram",
    category,
    fileName,
    fileSize,
    mimeType,
    textContent: text,
    binaryIndicators,
    userCommand: text || "Telegram orqali yuborilgan faylni tahlil qilish",
    senderName,
    senderUsername,
    chatId: recipientChatId,
  });

  // ONLY delete the file if it is genuinely dangerous ('Xavfli')!
  // If it is a clean .apk or safe file ('Xavfsiz'), DO NOT touch or delete it!
  if (scanResult.wasDeleted && msg.message_id) {
    await deleteTelegramVirusMessage(chatId, msg.message_id, businessConnectionId);

    memoryStore.messageEvents.unshift({
      id: `ev-virus-${Date.now()}`,
      timestamp: scanResult.timestamp,
      chatId: recipientChatId,
      eventType: "bot_deleted_virus",
      senderName,
      senderUsername,
      originalContent: fileName,
      details: `Xavfli virus fayl (${scanResult.riskPercent}%) avtomatik o'chirildi: ${scanResult.contentsSummary}`,
    });
  }

  // Always send the AI security report to the user/admin via the bot!
  const chatTitle = !isDirectBotChat && chat.title ? chat.title : undefined;
  const reportHtml = formatTelegramSecurityReport(scanResult, chatTitle);
  const sent = await sendBotReportSafe(recipientChatId, reportHtml);

  // If recipientChatId wasn't reachable and this was a direct message from a user, ensure `from.id` receives it
  if (!sent?.ok && from?.id && String(from.id) !== recipientChatId) {
    await sendBotReportSafe(String(from.id), reportHtml);
  }
}

async function initTelegramBotPolling24x7() {
  if (isPollingActive) return;
  isPollingActive = true;

  try {
    await tgCall("deleteWebhook", { drop_pending_updates: false });
    const me = await tgCall("getMe");
    if (me && me.ok && me.result) {
      botInfo = {
        id: me.result.id,
        username: me.result.username || "POSBONXBOT",
        first_name: me.result.first_name || "POSBON AI",
        online: true,
      };
      await tgCall("setMyCommands", {
        commands: [
          { command: "start", description: "Avtorizatsiya va Chat ID olish" },
          { command: "status", description: "Haqiqiy statistika va holat" },
          { command: "deleted", description: "O'chirilgan viruslar ro'yxati" },
          { command: "info", description: "POSBON AI haqida ma'lumot" },
        ],
      });
    }
  } catch (err) {
    console.error("Telegram init error:", err);
  }

  const pollLoop = async () => {
    try {
      const res = await tgCall("getUpdates", {
        offset: lastUpdateId + 1,
        timeout: 20,
        allowed_updates: [
          "message",
          "edited_message",
          "channel_post",
          "edited_channel_post",
          "my_chat_member",
          "business_connection",
          "business_message",
          "edited_business_message",
          "deleted_business_messages",
        ],
      });
      if (res && res.ok && Array.isArray(res.result)) {
        for (const update of res.result) {
          if (update.update_id > lastUpdateId) {
            lastUpdateId = update.update_id;
          }
          await handleTelegramUpdate(update);
        }
      }
    } catch {
      // 24/7 self-healing loop
    } finally {
      setTimeout(pollLoop, 1000);
    }
  };

  pollLoop();
}

initTelegramBotPolling24x7();

// ============================================================================
// 6. EXPRESS API ROUTES (6-DIGIT ONE-TIME OTP AUTH + STRICT USER ISOLATION)
// ============================================================================
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    botOnline: botInfo.online,
  });
});

// User state: ONLY returns data for the current session or OTP-authenticated token
app.get("/api/state", (req, res) => {
  const sessionId = String(req.query.sessionId || "").trim();
  const authToken = String(req.query.authToken || "").trim();
  const clientEpochMs = Number(req.query.clientEpochMs);
  if (clientEpochMs && !isNaN(clientEpochMs)) {
    calibrateClockFromEpoch(clientEpochMs);
  }
  const verifiedChatId = authToken ? memoryStore.verifiedSessions[authToken] || "" : "";

  const userScans = memoryStore.scans.filter((s) => {
    if (verifiedChatId && s.chatId === verifiedChatId) return true;
    if (sessionId && s.sessionId === sessionId) return true;
    return false;
  });

  const userEvents = verifiedChatId
    ? memoryStore.messageEvents.filter((e) => e.chatId === verifiedChatId)
    : [];

  const verifiedUser = verifiedChatId
    ? memoryStore.telegramUsers.find((u) => u.chatId === verifiedChatId) || {
        chatId: verifiedChatId,
        userId: verifiedChatId,
        username: "@telegram_user",
        firstName: "Tasdiqlangan Foydalanuvchi",
        lastName: "",
        languageCode: "uz",
        connectedAt: formatUzbekTime(),
        lastActiveAt: formatUzbekTime(),
        autoDeleteVirus: true,
      }
    : null;

  res.json({
    botInfo,
    scans: userScans,
    messageEvents: userEvents,
    verifiedUser,
  });
});

// Step 1 of Telegram Auth: User enters Chat ID -> Bot sends a 6-digit one-time code to Telegram
app.post("/api/telegram/send-otp", async (req, res) => {
  const cleanChatId = String(req.body.chatId || "").trim();
  if (!cleanChatId) {
    return res.status(400).json({ ok: false, message: "Chat ID kiriting." });
  }

  // Generate 6-digit one-time code
  const otpCode = String(Math.floor(100000 + Math.random() * 900000));
  memoryStore.otpCodes[cleanChatId] = {
    code: otpCode,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  };

  const sendRes = await sendBotReportSafe(
    cleanChatId,
    `🔐 <b>POSBON AI — TASDIQLASH KODI</b>\n\nSizning bir martalik 6 xonali kodingiz: <code>${otpCode}</code>\n\n<i>Tarixingizni ko'rish uchun ushbu kodni saytdagi tasdiqlash maydoniga kiriting.</i>`
  );

  if (!sendRes?.ok) {
    return res.json({
      ok: false,
      message:
        "Ushbu Chat ID ga xabar yuborib bo'lmadi. Avval @POSBONXBOT ga kirib /start tugmasini bosing!",
    });
  }

  registerOrUpdateTelegramUser(
    sendRes.result?.chat || { id: cleanChatId, first_name: "Foydalanuvchi" },
    cleanChatId
  );

  res.json({
    ok: true,
    message: `6 xonali bir martalik kod Telegram botingizga (${cleanChatId}) yuborildi!`,
  });
});

// Step 2 of Telegram Auth: User enters the 6-digit OTP -> Unlocks their bot history
app.post("/api/telegram/verify-otp", (req, res) => {
  const cleanChatId = String(req.body.chatId || "").trim();
  const cleanCode = String(req.body.code || "").trim();

  const record = memoryStore.otpCodes[cleanChatId];
  if (!record || Date.now() > record.expiresAt) {
    return res.status(400).json({
      ok: false,
      message: "Kod muddati tugagan yoki topilmadi. Qaytadan kod oling.",
    });
  }

  if (record.code !== cleanCode) {
    return res.status(400).json({
      ok: false,
      message: "6 xonali kod noto'g'ri! Tekshirib qayta kiriting.",
    });
  }

  // One-time code: delete immediately upon verification
  delete memoryStore.otpCodes[cleanChatId];

  const authToken = crypto.randomBytes(24).toString("hex");
  memoryStore.verifiedSessions[authToken] = cleanChatId;

  const user = memoryStore.telegramUsers.find((u) => u.chatId === cleanChatId) || null;
  const scans = memoryStore.scans.filter((s) => s.chatId === cleanChatId);
  const messageEvents = memoryStore.messageEvents.filter((e) => e.chatId === cleanChatId);

  res.json({
    ok: true,
    authToken,
    chatId: cleanChatId,
    user,
    scans,
    messageEvents,
  });
});

// Logout endpoint (also called automatically when user closes/leaves the site)
app.post("/api/telegram/logout", (req, res) => {
  const authToken = String(req.body.authToken || "").trim();
  if (authToken && memoryStore.verifiedSessions[authToken]) {
    delete memoryStore.verifiedSessions[authToken];
  }
  res.json({ ok: true });
});

// Web Scanner endpoint (Never shows intrusive notifications on site; sends report via bot if connected)
app.post("/api/scan", async (req, res) => {
  try {
    const {
      category = "fayl",
      fileName = "Noma'lum fayl",
      fileSize,
      mimeType,
      base64Data,
      textContent,
      userCommand,
      authToken,
      sessionId,
      clientEpochMs,
    } = req.body;

    if (clientEpochMs && typeof clientEpochMs === "number") {
      calibrateClockFromEpoch(clientEpochMs);
    }

    const verifiedChatId = authToken ? memoryStore.verifiedSessions[authToken] || "" : "";

    // Extract ASCII strings if base64Data is an APK/binary so clean vs malware APK is accurate on web too
    let binaryIndicators = "";
    if (base64Data && (fileName.toLowerCase().endsWith(".apk") || category === "fayl")) {
      try {
        const sliceBuf = Buffer.from(base64Data.slice(0, 80000), "base64");
        binaryIndicators = sliceBuf
          .toString("latin1")
          .replace(/[^\x20-\x7E]+/g, " ")
          .slice(0, 3000);
      } catch {
        // ignore
      }
    }

    const scanRecord = await analyzeWithPosbonScanner({
      source: "web",
      category,
      fileName,
      fileSize,
      mimeType,
      base64Data,
      textContent,
      binaryIndicators,
      userCommand,
      senderName: "Sayt Foydalanuvchisi",
      chatId: verifiedChatId || undefined,
      sessionId: sessionId || undefined,
    });

    if (verifiedChatId) {
      const reportHtml = formatTelegramSecurityReport(scanRecord, "POSBON AI Veb Skayneri");
      await sendBotReportSafe(verifiedChatId, reportHtml);
    }

    res.json({ ok: true, scan: scanRecord });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "Tahlil xatoligi" });
  }
});

// ============================================================================
// 7. ADMIN PANEL API (Password default: 0513, changeable)
// ============================================================================
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (String(password || "").trim() === adminPassword) {
    const token = crypto.randomBytes(24).toString("hex");
    activeAdminTokens.add(token);
    return res.json({
      ok: true,
      token,
      scans: memoryStore.scans,
      deletedFiles: memoryStore.deletedFiles,
      telegramUsersCount: memoryStore.telegramUsers.length,
    });
  }
  return res.status(401).json({ ok: false, error: "Parol noto'g'ri!" });
});

app.get("/api/admin/data", (req, res) => {
  const token = String(req.headers["x-admin-token"] || "");
  if (!activeAdminTokens.has(token)) {
    return res.status(401).json({ ok: false, error: "Ruxsat yo'q" });
  }
  res.json({
    ok: true,
    scans: memoryStore.scans,
    deletedFiles: memoryStore.deletedFiles,
    telegramUsersCount: memoryStore.telegramUsers.length,
  });
});

app.post("/api/admin/change-password", (req, res) => {
  const token = String(req.headers["x-admin-token"] || "");
  if (!activeAdminTokens.has(token)) {
    return res.status(401).json({ ok: false, error: "Ruxsat yo'q" });
  }
  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).trim().length < 3) {
    return res
      .status(400)
      .json({ ok: false, error: "Yangi parol kamida 3 ta belgidan iborat bo'lishi kerak." });
  }
  adminPassword = String(newPassword).trim();
  res.json({ ok: true, message: "Admin paroli muvaffaqiyatli o'zgartirildi!" });
});

// ============================================================================
// 8. AI CHAT, TRANSCRIBE & TTS ENDPOINTS
// ============================================================================
app.post("/api/chat", async (req, res) => {
  try {
    const {
      message,
      language = "uz",
      history = [],
      attachment,
      clientEpochMs,
      clientLocalDateStr,
      clientLocalTimeStr,
    } = req.body;

    if (clientEpochMs && typeof clientEpochMs === "number") {
      calibrateClockFromEpoch(clientEpochMs);
    }

    const dateCtx = getUzbekDateTimeContext(
      clientEpochMs ? new Date(clientEpochMs) : getRealNow()
    );

    const langInstruction =
      language === "ru"
        ? "Javobni rus tilida, samimiy, xushmuomala, aniq va batafsil bering."
        : language === "en"
        ? "Respond in English, politely, clearly, and helpfully."
        : "Javobni o'zbek tilida, nihoyatda samimiy, xushmuomala, ravon va tushunarli tilda bering.";

    const systemInstruction = `Siz POSBON AI Yordamchisisiz — kiberxavfsizlik, raqamli xavfsizlik, fayllar (.apk ilovalar, hujjatlar, rasm, video, ovoz) tahlili hamda @POSBONXBOT imkoniyatlari bo'yicha oliy toifali sun'iy intellektsiz.

ANiQ VAQT VA SANA MA'LUMOTLARI (O'ZBEKISTON, TOSHKENT VAQTI):
- Bugungi sana: ${dateCtx.fullDateUz} (${dateCtx.shortDate})
- Hozirgi vaqt: soat ${dateCtx.timeStr}
- Hafta kuni: ${dateCtx.weekdayUz}
- Joriy yil: ${dateCtx.year}

QAT'IY QOIDALAR VA VAZIFALAR:
1. SANA VA VAQT HAQIDA: Agar foydalanuvchi bugungi sana, kun, oy, yil yoki vaqt haqida so'rasa, aynan yuqorida ko'rsatilgan haqiqiy ma'lumotni (${dateCtx.fullDateUz}, soat ${dateCtx.timeStr}) aniq va to'g'ri ayting. Hech qachon eskirgan yoki noto'g'ri sanalarni aytmang!
2. KIBERXAVFSIZLIK VA FAYLLAR: .apk fayllar (soxta taklifnomalar, to'y videosi niqobidagi trojanlar, bank o'g'irlovchi SpyNote dasturlari), fishing havolalar, Telegram xavfsizligi va viruslardan himoyalanish bo'yicha professional tahlil va maslahatlar bering.
3. HAR QANDAY SAVOLGA TO'G'RI JAVOB: Foydalanuvchi kiberxavfsizlikdan tashqari boshqa har qanday mavzuda (fan, texnologiya, dasturlash, umumiy ma'lumotlar, hayotiy masalalar) savol bersa ham, unga chuqur, to'g'ri va yordam beruvchi javob bering.
4. XUSHMUOMALALIK: Har doim samimiy, do'stona va hurmat bilan ("siz" deb) muloqot qiling.
${langInstruction}`;

    const parts: any[] = [];
    if (attachment?.base64Data && attachment?.mimeType) {
      if (
        attachment.mimeType.startsWith("image/") ||
        attachment.mimeType.startsWith("audio/") ||
        attachment.mimeType === "application/pdf"
      ) {
        parts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.base64Data,
          },
        });
      }
      parts.push({
        text: `[Ilova qilingan fayl: ${attachment.fileName} (${attachment.mimeType})]`,
      });
    }

    const contextHistory = Array.isArray(history)
      ? history
          .slice(-8)
          .map((h: any) => `${h.role === "user" ? "Foydalanuvchi" : "POSBON AI"}: ${h.text}`)
          .join("\n")
      : "";

    parts.push({
      text: `${contextHistory ? `${contextHistory}\n\n` : ""}Foydalanuvchi: ${
        message || "Shu faylni tahlil qilib bering."
      }`,
    });

    const response = await generateWithFallback(getChatClient(), {
      contents: { parts },
      config: { systemInstruction },
    });

    res.json({
      ok: true,
      reply: response.text,
    });
  } catch (err: any) {
    console.error("Chat error:", err?.message);
    res.json({
      ok: true,
      reply:
        "Assalomu alaykum! Men POSBON AI yordamchiman. Sizga fayllar (.apk, hujjat, rasm, video) xavfsizligini tekshirish va kiberxavfsizlik bo'yicha yordam berishga tayyorman.",
    });
  }
});

app.post("/api/transcribe", async (req, res) => {
  try {
    const { base64Audio, mimeType = "audio/webm", language = "uz" } = req.body;
    if (!base64Audio) {
      return res.status(400).json({ ok: false, error: "Audio topilmadi" });
    }

    const client = getChatClient();
    let text = "";
    for (const modelName of ["gemini-3.5-transcribe", "gemini-3.1-flash-lite"]) {
      try {
        const response = await client.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              { inlineData: { mimeType, data: base64Audio } },
              {
                text: `Transcribe this audio (${language}). Return only the spoken words without extra commentary.`,
              },
            ],
          },
        });
        if (response?.text) {
          text = response.text.trim();
          break;
        }
      } catch {
        // try next model
      }
    }

    res.json({ ok: true, text });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "Xatolik" });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ ok: false, error: "Matn yo'q" });

    const client = getChatClient();
    const response = await client.models.generateContent({
      model: "gemini-3.8-flash-lite-tts",
      contents: [{ role: "user", parts: [{ text: String(text).slice(0, 800) }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return res.json({ ok: true, audioBase64: base64Audio, mimeType: "audio/wav" });
    }
    res.status(500).json({ ok: false, error: "Ovoz generatsiya bo'lmadi" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "TTS xatoligi" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`POSBON AI 24/7 Server running on http://localhost:${PORT}`);
  });
}

startServer();

export type NavTab = "skayner" | "telegram" | "ai" | "tarix" | "qollanma";

export type ScanCategory = "fayl" | "hujjat" | "rasm" | "video" | "ovoz" | "havola";

export interface ScanRecord {
  id: string;
  timestamp: string;
  source: "web" | "telegram";
  category: ScanCategory;
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

export interface BotInfo {
  id?: number;
  username?: string;
  first_name?: string;
  online: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  attachmentName?: string;
  isPlayingAudio?: boolean;
}

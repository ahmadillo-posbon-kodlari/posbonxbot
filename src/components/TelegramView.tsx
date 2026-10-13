import React, { useState } from "react";
import {
  Bot,
  RefreshCw,
  UserPlus,
  ExternalLink,
  ShieldCheck,
  KeyRound,
  LogOut,
  History,
} from "lucide-react";
import { BotInfo, TelegramUserRecord, ScanRecord, MessageEventRecord } from "../types";

interface TelegramViewProps {
  botInfo: BotInfo;
  verifiedUser: TelegramUserRecord | null;
  onAuthenticated: (data: {
    authToken: string;
    chatId: string;
    user: TelegramUserRecord | null;
    scans: ScanRecord[];
    messageEvents: MessageEventRecord[];
  }) => void;
  onLogout: () => void;
  onOpenHistory: () => void;
  onRefreshState: () => void;
}

export const TelegramView: React.FC<TelegramViewProps> = ({
  botInfo,
  verifiedUser,
  onAuthenticated,
  onLogout,
  onOpenHistory,
  onRefreshState,
}) => {
  const [chatIdInput, setChatIdInput] = useState<string>("");
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [otpCodeInput, setOtpCodeInput] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = chatIdInput.trim();
    if (!cleanId) return;

    setIsLoading(true);
    setErrorMsg("");
    setStatusMsg("");
    try {
      const res = await fetch("/api/telegram/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: cleanId }),
      });
      const data = await res.json();
      if (data.ok) {
        setOtpSent(true);
        setStatusMsg(data.message || "6 xonali kod Telegram botingizga yuborildi!");
      } else {
        setErrorMsg(
          data.message || "Avval @POSBONXBOT ga kirib /start bosing, so'ng Chat ID kiriting."
        );
      }
    } catch {
      setErrorMsg("Server bilan bog'lanishda xatolik.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = chatIdInput.trim();
    const cleanCode = otpCodeInput.trim();
    if (!cleanId || cleanCode.length !== 6) {
      setErrorMsg("6 xonali bir martalik kodni to'liq kiriting.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/telegram/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: cleanId, code: cleanCode }),
      });
      const data = await res.json();
      if (data.ok && data.authToken) {
        setOtpSent(false);
        setOtpCodeInput("");
        setStatusMsg("");
        onAuthenticated({
          authToken: data.authToken,
          chatId: data.chatId,
          user: data.user,
          scans: data.scans || [],
          messageEvents: data.messageEvents || [],
        });
      } else {
        setErrorMsg(data.message || "Kod noto'g'ri!");
      }
    } catch {
      setErrorMsg("Tasdiqlashda xatolik yuz berdi.");
    } finally {
      setIsLoading(false);
    }
  };

  const botHandle = `@${botInfo.username || "PosbonXBot"}`;
  const deepLinkUrl = `https://t.me/${botInfo.username || "POSBONXBOT"}`;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 shadow-sm border border-slate-200/80 dark:border-slate-800 transition-colors">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-950/60 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                Telegram Avtorizatsiya
              </h1>
              <a
                href={deepLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs sm:text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline inline-block"
              >
                {botHandle}
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefreshState}
            title="Yangilash"
            className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-sky-600 dark:text-sky-400 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Direct Telegram Bot Open Button */}
        <div className="mb-5 pb-5 border-b border-slate-100 dark:border-slate-800">
          <a
            href={deepLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 px-5 rounded-2xl bg-[#009a5e] hover:bg-[#008550] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>Telegram Orqali Ulash (@PosbonXBot)</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-90" />
          </a>
        </div>

        {verifiedUser ? (
          /* Authenticated User Profile Box */
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {verifiedUser.firstName} {verifiedUser.lastName}
                  </p>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    Chat ID: {verifiedUser.chatId}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="px-3.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/60 hover:bg-red-100 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Chiqish</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenHistory}
              className="w-full py-3.5 px-5 rounded-2xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <History className="w-4 h-4" />
              <span>Bot Tarixini Ko'rish (Fayllar va Xabarlar)</span>
            </button>
          </div>
        ) : (
          /* Step 1 & Step 2: Chat ID -> 6-Digit One-Time Code Verification */
          <div className="space-y-4">
            <form onSubmit={handleRequestOtp} className="flex items-center gap-2.5">
              <input
                type="text"
                value={chatIdInput}
                onChange={(e) => setChatIdInput(e.target.value)}
                placeholder="Chat ID kiriting"
                className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 font-mono tabular-nums"
              />
              <button
                type="submit"
                disabled={isLoading || !chatIdInput.trim()}
                className="py-3 px-5 rounded-2xl bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                {isLoading && !otpSent ? "..." : otpSent ? "Qayta yuborish" : "Ulash"}
              </button>
            </form>

            {otpSent && (
              <form
                onSubmit={handleVerifyOtp}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <KeyRound className="w-4 h-4" />
                  <span>Botga yuborilgan 6 xonali bir martalik kodni kiriting:</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <input
                    type="text"
                    maxLength={6}
                    autoFocus
                    value={otpCodeInput}
                    onChange={(e) => setOtpCodeInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="6 xonali kod (masalan: 482915)"
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-base font-bold tracking-widest text-center text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || otpCodeInput.length !== 6}
                    className="py-2.5 px-5 rounded-xl bg-[#009a5e] hover:bg-[#008550] disabled:opacity-50 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Tasdiqlash
                  </button>
                </div>
              </form>
            )}

            {statusMsg && (
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                {statusMsg}
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400 font-medium">
                {errorMsg}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

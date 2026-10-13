import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield,
  Bot,
  Sparkles,
  History,
  HelpCircle,
  Sun,
  Moon,
} from "lucide-react";
import {
  NavTab,
  ScanRecord,
  MessageEventRecord,
  TelegramUserRecord,
  BotInfo,
} from "./types";
import { ScannerView } from "./components/ScannerView";
import { TelegramView } from "./components/TelegramView";
import { AssistantView } from "./components/AssistantView";
import { HistoryView } from "./components/HistoryView";
import { GuideView } from "./components/GuideView";
import { AdminModal } from "./components/AdminModal";

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>("skayner");
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // Ephemeral session ID & OTP-verified authToken (never persisted to disk/localStorage)
  const [sessionId] = useState<string>(() => {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  });
  const [authToken, setAuthToken] = useState<string>("");
  const authTokenRef = useRef<string>("");

  const [botInfo, setBotInfo] = useState<BotInfo>({
    username: "POSBONXBOT",
    first_name: "POSBON AI",
    online: true,
  });
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [messageEvents, setMessageEvents] = useState<MessageEventRecord[]>([]);
  const [verifiedUser, setVerifiedUser] = useState<TelegramUserRecord | null>(null);

  // Triple-click logo trigger for Admin Panel
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const logoClickTimesRef = useRef<number[]>([]);

  useEffect(() => {
    authTokenRef.current = authToken;
  }, [authToken]);

  // Automatically log out of profile when user leaves/closes the website
  useEffect(() => {
    const handleUnload = () => {
      if (authTokenRef.current) {
        const blob = new Blob(
          [JSON.stringify({ authToken: authTokenRef.current })],
          { type: "application/json" }
        );
        navigator.sendBeacon?.("/api/telegram/logout", blob);
      }
    };
    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("pagehide", handleUnload);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  const handleLogoTripleClick = () => {
    const now = Date.now();
    const recent = logoClickTimesRef.current.filter((t) => now - t < 900);
    recent.push(now);
    logoClickTimesRef.current = recent;

    if (recent.length >= 3) {
      logoClickTimesRef.current = [];
      setShowAdminModal(true);
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
      document.body.classList.add("dark", "bg-slate-950");
      document.body.classList.remove("bg-[#f3f6f9]");
    } else {
      root.classList.remove("dark");
      document.body.classList.remove("dark", "bg-slate-950");
      document.body.classList.add("bg-[#f3f6f9]");
    }
  }, [darkMode]);

  const fetchAppState = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        sessionId,
        authToken,
        clientEpochMs: String(Date.now()),
      });
      const res = await fetch(`/api/state?${params.toString()}`);
      const data = await res.json();
      if (data.botInfo) setBotInfo(data.botInfo);
      if (Array.isArray(data.scans)) setScans(data.scans);
      if (Array.isArray(data.messageEvents)) setMessageEvents(data.messageEvents);
      setVerifiedUser(data.verifiedUser || null);
    } catch {
      // ignore
    }
  }, [sessionId, authToken]);

  useEffect(() => {
    fetchAppState();
    const interval = setInterval(fetchAppState, 3500);
    return () => clearInterval(interval);
  }, [fetchAppState]);

  const handleScanComplete = (newScan: ScanRecord) => {
    setScans((prev) => [newScan, ...prev.filter((s) => s.id !== newScan.id)]);
  };

  const handleAuthenticated = (data: {
    authToken: string;
    chatId: string;
    user: TelegramUserRecord | null;
    scans: ScanRecord[];
    messageEvents: MessageEventRecord[];
  }) => {
    setAuthToken(data.authToken);
    setVerifiedUser(
      data.user || {
        chatId: data.chatId,
        userId: data.chatId,
        username: "@telegram_user",
        firstName: "Tasdiqlangan Foydalanuvchi",
        lastName: "",
        languageCode: "uz",
        connectedAt: "",
        lastActiveAt: "",
        autoDeleteVirus: true,
      }
    );
    setScans(data.scans);
    setMessageEvents(data.messageEvents);
    setActiveTab("tarix");
  };

  const handleLogout = async () => {
    if (authToken) {
      try {
        await fetch("/api/telegram/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authToken }),
        });
      } catch {
        // ignore
      }
    }
    setAuthToken("");
    setVerifiedUser(null);
    setScans([]);
    setMessageEvents([]);
  };

  return (
    <div
      className={`h-[100dvh] overflow-hidden flex flex-col transition-colors duration-150 ${
        darkMode ? "dark bg-slate-950 text-slate-100" : "bg-[#f3f6f9] text-slate-900"
      }`}
    >
      {/* Top Bar (Triple-click POSBON AI logo to open Admin Panel) */}
      <header className="shrink-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-8 h-14 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={handleLogoTripleClick}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer select-none"
        >
          POSBON AI
        </button>

        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setActiveTab("skayner")}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "skayner" ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""
            }`}
          >
            Skayner
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("telegram")}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "telegram" ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""
            }`}
          >
            Telegram
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ai")}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "ai" ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""
            }`}
          >
            AI Suhbat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tarix")}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "tarix" ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""
            }`}
          >
            Tarix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("qollanma")}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "qollanma" ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""
            }`}
          >
            Qo'llanma
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {darkMode ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Kun rejimi</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-slate-700" />
                <span>Tun rejimi</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
        {activeTab === "skayner" && (
          <ScannerView
            sessionId={sessionId}
            authToken={authToken}
            onScanComplete={handleScanComplete}
          />
        )}

        {activeTab === "telegram" && (
          <TelegramView
            botInfo={botInfo}
            verifiedUser={verifiedUser}
            onAuthenticated={handleAuthenticated}
            onLogout={handleLogout}
            onOpenHistory={() => setActiveTab("tarix")}
            onRefreshState={fetchAppState}
          />
        )}

        {activeTab === "ai" && <AssistantView />}

        {activeTab === "tarix" && (
          <HistoryView scans={scans} messageEvents={messageEvents} />
        )}

        {activeTab === "qollanma" && <GuideView />}
      </main>

      {/* Bottom Navigation Menu: SKAYNER | TELEGRAM | AI | TARIX | QO'LLANMA */}
      <nav
        aria-label="Asosiy navigatsiya"
        className="shrink-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200/90 dark:border-slate-800 h-16 px-2 sm:px-6 transition-colors"
      >
        <div className="max-w-3xl mx-auto h-full grid grid-cols-5 items-center">
          <button
            type="button"
            onClick={() => setActiveTab("skayner")}
            className={`flex flex-col items-center justify-center h-full transition-colors cursor-pointer ${
              activeTab === "skayner"
                ? "text-[#00a86b] dark:text-emerald-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-semibold"
            }`}
          >
            <Shield className="w-5 h-5" />
            <span className="text-[11px] tracking-tight mt-1 whitespace-nowrap">SKAYNER</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("telegram")}
            className={`flex flex-col items-center justify-center h-full transition-colors cursor-pointer ${
              activeTab === "telegram"
                ? "text-sky-600 dark:text-sky-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-semibold"
            }`}
          >
            <Bot className="w-5 h-5" />
            <span className="text-[11px] tracking-tight mt-1 whitespace-nowrap">TELEGRAM</span>
          </button>

          <div className="flex flex-col items-center justify-center h-full relative">
            <button
              type="button"
              onClick={() => setActiveTab("ai")}
              className="group flex flex-col items-center justify-center cursor-pointer -mt-5"
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-transform group-active:scale-95 ${
                  activeTab === "ai"
                    ? "bg-[#009a5e] text-white ring-4 ring-emerald-500/20"
                    : "bg-[#0f172a] dark:bg-emerald-600 text-white"
                }`}
              >
                <Sparkles className="w-5 h-5" />
              </div>
              <span
                className={`text-[11px] font-bold tracking-tight mt-1 whitespace-nowrap ${
                  activeTab === "ai"
                    ? "text-[#009a5e] dark:text-emerald-400"
                    : "text-slate-800 dark:text-slate-200"
                }`}
              >
                AI
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("tarix")}
            className={`flex flex-col items-center justify-center h-full transition-colors cursor-pointer ${
              activeTab === "tarix"
                ? "text-[#00a86b] dark:text-emerald-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-semibold"
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-[11px] tracking-tight mt-1 whitespace-nowrap">TARIX</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("qollanma")}
            className={`flex flex-col items-center justify-center h-full transition-colors cursor-pointer ${
              activeTab === "qollanma"
                ? "text-[#00a86b] dark:text-emerald-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-semibold"
            }`}
          >
            <HelpCircle className="w-5 h-5" />
            <span className="text-[11px] tracking-tight mt-1 whitespace-nowrap">QO'LLANMA</span>
          </button>
        </div>
      </nav>

      {/* Secret Admin Panel Modal (Opened by triple-clicking POSBON AI logo) */}
      {showAdminModal && <AdminModal onClose={() => setShowAdminModal(false)} />}
    </div>
  );
}

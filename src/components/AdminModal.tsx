import React, { useState } from "react";
import {
  Lock,
  X,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { ScanRecord } from "../types";

interface AdminModalProps {
  onClose: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ onClose }) => {
  const [password, setPassword] = useState<string>("");
  const [adminToken, setAdminToken] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [allScans, setAllScans] = useState<ScanRecord[]>([]);
  const [newPassword, setNewPassword] = useState<string>("");
  const [pwdMsg, setPwdMsg] = useState<string>("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok && data.token) {
        setAdminToken(data.token);
        setAllScans(data.scans || []);
      } else {
        setAuthError(data.error || "Parol noto'g'ri!");
      }
    } catch {
      setAuthError("Server bilan bog'lanishda xatolik.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshData = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch("/api/admin/data", {
        headers: { "x-admin-token": adminToken },
      });
      const data = await res.json();
      if (data.ok) {
        setAllScans(data.scans || []);
      }
    } catch {
      // ignore
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg("");
    if (!newPassword.trim()) return;
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({ newPassword: newPassword.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setPwdMsg(data.message || "Parol yangilandi!");
        setNewPassword("");
      } else {
        setPwdMsg(data.error || "Xatolik");
      }
    } catch {
      setPwdMsg("Xatolik yuz berdi");
    }
  };

  const totalCount = allScans.length;
  const safeCount = allScans.filter((s) => s.status === "Xavfsiz").length;
  const dangerCount = allScans.filter((s) => s.status === "Xavfli").length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl max-h-[88vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              POSBON AI — Boshqaruv Paneli (Admin)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!adminToken ? (
          /* Password Login View */
          <form onSubmit={handleLogin} className="p-6 sm:p-8 space-y-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Admin parolini kiriting:
            </label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parol..."
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3.5 text-base text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
            />
            {authError && (
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                {authError}
              </p>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              {isLoading ? "Tekshirilmoqda..." : "Kirish"}
            </button>
          </form>
        ) : (
          /* Unlocked Admin Dashboard */
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Real Global Statistics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">Jami tekshirilgan</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                  {totalCount}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 text-center">
                <p className="text-xs text-emerald-700 dark:text-emerald-400">Xavfsiz</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-1">
                  {safeCount}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-red-50/70 dark:bg-red-950/40 text-center">
                <p className="text-xs text-red-700 dark:text-red-400">Zararli (Virus)</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 font-mono tabular-nums mt-1">
                  {dangerCount}
                </p>
              </div>
            </div>

            {/* Change Admin Password Section */}
            <form
              onSubmit={handleChangePassword}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                <KeyRound className="w-4 h-4 text-emerald-600" />
                <span>Admin parolini o'zgartirish:</span>
              </div>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Yangi parol kiriting..."
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Saqlash
              </button>
              {pwdMsg && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {pwdMsg}
                </span>
              )}
            </form>

            {/* Full Global Scan History */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Umumiy Tekshiruvlar Tarixi ({allScans.length})
                </h3>
                <button
                  type="button"
                  onClick={handleRefreshData}
                  className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Yangilash</span>
                </button>
              </div>

              {allScans.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-500">
                  Hozircha tekshiruvlar yo'q.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {allScans.map((scan) => (
                    <div
                      key={scan.id}
                      className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {scan.status === "Xavfsiz" ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        ) : scan.status === "Shubhali" ? (
                          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                        ) : (
                          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {scan.fileName}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                            {scan.timestamp} · {scan.source === "telegram" ? "Telegram" : "Sayt"} · {scan.senderName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <span
                          className={`text-xs font-bold ${
                            scan.status === "Xavfsiz"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {scan.status === "Xavfsiz"
                            ? `${scan.safetyPercent}% Xavfsiz`
                            : `${scan.riskPercent}% Xavfli`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Edit3,
  Trash2,
} from "lucide-react";
import { ScanRecord, MessageEventRecord } from "../types";

interface HistoryViewProps {
  scans: ScanRecord[];
  messageEvents: MessageEventRecord[];
}

export const HistoryView: React.FC<HistoryViewProps> = ({ scans, messageEvents }) => {
  const [activeSubTab, setActiveSubTab] = useState<"scans" | "events">("scans");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalCount = scans.length;
  const safeCount = scans.filter((s) => s.status === "Xavfsiz").length;
  const dangerCount = scans.filter((s) => s.status === "Xavfli" || s.status === "Shubhali").length;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      {/* Real Statistics Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            Tarix va Statistika
          </h1>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveSubTab("scans")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeSubTab === "scans"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Fayllar ({scans.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("events")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeSubTab === "events"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              O'chirilgan / Tahrirlangan ({messageEvents.length})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800 text-center transition-colors">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tekshirilgan</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
              {totalCount}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-100/80 dark:border-emerald-900/40 text-center transition-colors">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Xavfsiz</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-0.5">
              {safeCount}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-red-50/80 dark:bg-red-950/40 border border-red-100/80 dark:border-red-900/40 text-center transition-colors">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">Zararli</p>
            <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 font-mono tabular-nums mt-0.5">
              {dangerCount}
            </p>
          </div>
        </div>
      </div>

      {/* Tab 1: Scanned Files History (Who sent what file, when, and AI verdict) */}
      {activeSubTab === "scans" ? (
        <div className="space-y-2.5">
          {scans.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200/80 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Hozircha tekshirilgan fayllar yo'q
              </p>
            </div>
          ) : (
            scans.map((scan) => {
              const isExpanded = expandedId === scan.id;
              return (
                <div
                  key={scan.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-colors"
                >
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : scan.id)}
                    className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          scan.status === "Xavfsiz"
                            ? "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400"
                            : scan.status === "Shubhali"
                            ? "bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400"
                            : "bg-red-50 dark:bg-red-950/70 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {scan.status === "Xavfsiz" ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : scan.status === "Shubhali" ? (
                          <AlertTriangle className="w-5 h-5" />
                        ) : (
                          <ShieldAlert className="w-5 h-5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {scan.fileName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {scan.timestamp} · Kimdan: {scan.senderName}{" "}
                          {scan.senderUsername ? `(${scan.senderUsername})` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right font-mono tabular-nums">
                        <span
                          className={`text-xs font-bold ${
                            scan.status === "Xavfsiz"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {scan.status === "Xavfsiz"
                            ? `${scan.safetyPercent}% Xavfsiz`
                            : `${scan.riskPercent}% Zararli`}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                      <p>
                        <strong className="text-slate-900 dark:text-white">Holat: </strong>
                        {scan.actionTaken}
                      </p>
                      <p>
                        <strong className="text-slate-900 dark:text-white">Ma'lumot: </strong>
                        {scan.contentsSummary}
                      </p>
                      <p>
                        <strong className="text-slate-900 dark:text-white">Tahlil: </strong>
                        {scan.detailedExplanation}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Tab 2: Edited & Deleted Messages History */
        <div className="space-y-2.5">
          {messageEvents.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200/80 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Hozircha o'chirilgan yoki tahrirlangan xabarlar yo'q
              </p>
            </div>
          ) : (
            messageEvents.map((ev) => (
              <div
                key={ev.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {ev.eventType === "edited" ? (
                      <Edit3 className="w-4 h-4 text-amber-500 shrink-0" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {ev.senderName} {ev.senderUsername ? `(${ev.senderUsername})` : ""}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-500 tabular-nums">
                    {ev.timestamp}
                  </span>
                </div>

                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {ev.details}
                </p>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                  <p className="text-slate-700 dark:text-slate-300">
                    <strong>{ev.eventType === "edited" ? "Avvalgi matn:" : "O'chirilgan:"} </strong>
                    {ev.originalContent}
                  </p>
                  {ev.newContent && (
                    <p className="text-emerald-600 dark:text-emerald-400">
                      <strong>Yangi matn: </strong>
                      {ev.newContent}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

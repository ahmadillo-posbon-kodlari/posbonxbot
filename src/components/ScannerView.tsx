import React, { useState, useRef } from "react";
import {
  Shield,
  FileCode,
  FileText,
  Image as ImageIcon,
  Video,
  Globe,
  Mic,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Square,
} from "lucide-react";
import { ScanCategory, ScanRecord } from "../types";

interface ScannerViewProps {
  sessionId: string;
  authToken: string;
  onScanComplete: (record: ScanRecord) => void;
}

const CATEGORIES: {
  id: ScanCategory;
  label: string;
  icon: React.FC<{ className?: string }>;
  accept: string;
}[] = [
  { id: "fayl", label: "Fayl", icon: FileCode, accept: "*/*" },
  { id: "hujjat", label: "Hujjat", icon: FileText, accept: ".pdf,.doc,.docx,.xls,.xlsx,.txt,*/*" },
  { id: "rasm", label: "Rasm", icon: ImageIcon, accept: "image/*" },
  { id: "video", label: "Video", icon: Video, accept: "video/*" },
  { id: "ovoz", label: "Ovoz", icon: Mic, accept: "audio/*" },
  { id: "havola", label: "Havola", icon: Globe, accept: "*/*" },
];

export const ScannerView: React.FC<ScannerViewProps> = ({
  sessionId,
  authToken,
  onScanComplete,
}) => {
  const [activeCategory, setActiveCategory] = useState<ScanCategory>("fayl");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [base64Data, setBase64Data] = useState<string>("");
  const [textOrUrl, setTextOrUrl] = useState<string>("");
  const [userCommand, setUserCommand] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [result, setResult] = useState<ScanRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setErrorMsg("");

    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const commaIndex = res.indexOf(",");
      if (commaIndex !== -1) {
        setBase64Data(res.slice(commaIndex + 1));
      }
    };
    reader.readAsDataURL(file);
  };

  const startVoiceRecording = async () => {
    try {
      setErrorMsg("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const voiceFile = new File([blob], `Ovoz_${Date.now()}.webm`, {
          type: "audio/webm",
        });
        setSelectedFile(voiceFile);

        const reader = new FileReader();
        reader.onload = () => {
          const res = String(reader.result || "");
          const commaIndex = res.indexOf(",");
          if (commaIndex !== -1) {
            setBase64Data(res.slice(commaIndex + 1));
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setErrorMsg("Mikrofonga ruxsat berilmadi.");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleRunScan = async () => {
    if (!selectedFile && !textOrUrl.trim()) {
      setErrorMsg("Iltimos, fayl tanlang yoki havola kiriting.");
      return;
    }

    setErrorMsg("");
    setIsScanning(true);
    setResult(null);

    try {
      const fileName = selectedFile
        ? selectedFile.name
        : textOrUrl.trim().split(/\s+/)[0].slice(0, 60) || "Tekshiruv";

      const fileSize = selectedFile
        ? selectedFile.size > 1024 * 1024
          ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`
          : `${(selectedFile.size / 1024).toFixed(1)} KB`
        : undefined;

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: activeCategory,
          fileName,
          fileSize,
          mimeType: selectedFile?.type || "text/plain",
          base64Data: base64Data || undefined,
          textContent: textOrUrl.trim() || undefined,
          userCommand: userCommand.trim() || "Bu xavfsizmi yoki ishonchlimi?",
          authToken: authToken || undefined,
          sessionId,
          clientEpochMs: Date.now(),
        }),
      });

      const data = await res.json();
      if (data.ok && data.scan) {
        setResult(data.scan);
        onScanComplete(data.scan);
      } else {
        setErrorMsg(data.error || "Xatolik yuz berdi.");
      }
    } catch {
      setErrorMsg("Server bilan bog'lanishda xatolik.");
    } finally {
      setIsScanning(false);
    }
  };

  const currentCatObj = CATEGORIES.find((c) => c.id === activeCategory) || CATEGORIES[0];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 shadow-sm border border-slate-200/80 dark:border-slate-800 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Xavfsizlik Skayneri
          </h1>
          <Shield className="w-5 h-5 text-[#00a86b] dark:text-emerald-400 shrink-0" />
        </div>

        {/* Category Tabs */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-4">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setActiveCategory(cat.id);
                  setErrorMsg("");
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {activeCategory !== "havola" ? (
          <div className="mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept={currentCatObj.accept}
              onChange={handleFileChange}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-colors bg-slate-50/40 dark:bg-slate-800/30"
            >
              <Upload className="w-6 h-6 text-[#00a86b] dark:text-emerald-400 mx-auto mb-2" />
              {selectedFile ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 break-all">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <p className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200">
                  Fayl tanlash
                </p>
              )}
            </div>

            {activeCategory === "ovoz" && (
              <div className="mt-2.5 flex justify-center">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ovoz yozish</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/60 text-xs font-semibold text-red-600 dark:text-red-400 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>To'xtatish</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4">
            <textarea
              rows={2}
              value={textOrUrl}
              onChange={(e) => setTextOrUrl(e.target.value)}
              placeholder="Havola (URL) yoki xabar matnini kiriting..."
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        <div className="mb-4">
          <input
            type="text"
            value={userCommand}
            onChange={(e) => setUserCommand(e.target.value)}
            placeholder="Buyruq bering (masalan: Bu xavfsizmi?)"
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 text-xs text-red-600 dark:text-red-400">
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          disabled={isScanning}
          onClick={handleRunScan}
          className="w-full py-3.5 px-6 rounded-2xl bg-[#68b99a] hover:bg-[#56a889] active:scale-[0.99] disabled:opacity-60 text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Shield className="w-4 h-4" />
          <span>{isScanning ? "Tekshirilmoqda..." : "Tekshirish"}</span>
        </button>
      </div>

      {result && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  result.status === "Xavfsiz"
                    ? "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400"
                    : result.status === "Shubhali"
                    ? "bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400"
                    : "bg-red-50 dark:bg-red-950/70 text-red-600 dark:text-red-400"
                }`}
              >
                {result.status === "Xavfsiz" ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : result.status === "Shubhali" ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <ShieldAlert className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  {result.fileName}
                </h2>
                <p
                  className={`text-xs font-semibold ${
                    result.status === "Xavfsiz"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {result.actionTaken}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 rounded-xl shrink-0 font-mono tabular-nums">
              <div className="text-center">
                <p className="text-[10px] text-slate-500">Xavfsiz</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {result.safetyPercent}%
                </p>
              </div>
              <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="text-center">
                <p className="text-[10px] text-slate-500">Xavf</p>
                <p className="text-sm font-bold text-red-600 dark:text-red-400">
                  {result.riskPercent}%
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <p>
              <strong className="text-slate-900 dark:text-white">Ma'lumot: </strong>
              {result.contentsSummary}
            </p>
            <p>
              <strong className="text-slate-900 dark:text-white">Tahlil: </strong>
              {result.detailedExplanation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

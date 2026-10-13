import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles,
  Volume2,
  VolumeX,
  PhoneCall,
  PhoneOff,
  Trash2,
  Paperclip,
  Mic,
  Square,
  Send,
  FileCheck,
} from "lucide-react";
import { ChatMessage } from "../types";

export const AssistantView: React.FC = () => {
  const [language, setLanguage] = useState<"uz" | "ru" | "en">("uz");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [onlineVoiceActive, setOnlineVoiceActive] = useState<boolean>(false);
  const [voiceStatusText, setVoiceStatusText] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-welcome",
      role: "assistant",
      text: "Assalomu alaykum! Men POSBON AI Yordamchiman. Savolingizni yozing, fayl yuboring yoki 'Online Ovoz' tugmasini bosib jonli ovozda suhbatlashing.",
      timestamp: "Hozir",
    },
  ]);
  const [inputText, setInputText] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [attachedFile, setAttachedFile] = useState<{
    fileName: string;
    mimeType: string;
    base64Data: string;
  } | null>(null);

  const [isRecordingMic, setIsRecordingMic] = useState<boolean>(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  const onlineVoiceRef = useRef<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    onlineVoiceRef.current = onlineVoiceActive;
  }, [onlineVoiceActive]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const stopAllAudio = () => {
    currentAudioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setPlayingMessageId(null);
  };

  const startOnlineVoiceListener = useCallback(() => {
    if (!onlineVoiceRef.current) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }

      const recognition = new SpeechRecognition();
      recognition.lang =
        language === "ru" ? "ru-RU" : language === "en" ? "en-US" : "uz-UZ";
      recognition.interimResults = true;
      recognition.continuous = false;

      let finalTranscript = "";

      recognition.onstart = () => {
        setIsRecordingMic(true);
        setVoiceStatusText("Tinglayapman, gapiring...");
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interim += transcript;
          }
        }
        setInputText(finalTranscript || interim);
      };

      recognition.onend = () => {
        setIsRecordingMic(false);
        const spoken = finalTranscript.trim();
        if (spoken && onlineVoiceRef.current) {
          setVoiceStatusText("Javob tayyorlanmoqda...");
          handleSendMessage(spoken, true);
        } else if (onlineVoiceRef.current) {
          // Continue listening if still in online voice mode
          setTimeout(() => {
            if (onlineVoiceRef.current) startOnlineVoiceListener();
          }, 400);
        } else {
          setVoiceStatusText("");
        }
      };

      recognition.onerror = () => {
        setIsRecordingMic(false);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        return;
      } catch {
        // fallback below
      }
    }

    // Fallback to MediaRecorder if SpeechRecognition is unavailable
    toggleMicRecording(true);
  }, [language]);

  const playTtsForMessage = async (
    msgId: string,
    text: string,
    resumeOnlineVoiceAfter = false
  ) => {
    if (isMuted) {
      if (resumeOnlineVoiceAfter && onlineVoiceRef.current) {
        startOnlineVoiceListener();
      }
      return;
    }

    if (playingMessageId === msgId && !resumeOnlineVoiceAfter) {
      stopAllAudio();
      return;
    }

    stopAllAudio();
    setPlayingMessageId(msgId);
    if (resumeOnlineVoiceAfter) {
      setVoiceStatusText("POSBON AI gapirmoqda...");
    }

    const onFinishSpeaking = () => {
      setPlayingMessageId(null);
      if (resumeOnlineVoiceAfter && onlineVoiceRef.current) {
        startOnlineVoiceListener();
      } else {
        setVoiceStatusText("");
      }
    };

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.ok && data.audioBase64) {
        const audio = new Audio(
          `data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`
        );
        currentAudioRef.current = audio;
        audio.onended = onFinishSpeaking;
        audio.onerror = onFinishSpeaking;
        await audio.play();
        return;
      }
    } catch {
      // Fallback to browser SpeechSynthesis
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = language === "ru" ? "ru-RU" : language === "en" ? "en-US" : "uz-UZ";
      utter.onend = onFinishSpeaking;
      utter.onerror = onFinishSpeaking;
      window.speechSynthesis.speak(utter);
    } else {
      onFinishSpeaking();
    }
  };

  const handleSendMessage = async (overrideText?: string, fromOnlineVoice = false) => {
    const textToSend = (overrideText !== undefined ? overrideText : inputText).trim();
    if (!textToSend && !attachedFile) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: textToSend || `Fayl: ${attachedFile?.fileName}`,
      timestamp: new Date().toLocaleTimeString("uz-UZ", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      attachmentName: attachedFile?.fileName,
    };

    const currentAttachment = attachedFile;
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setAttachedFile(null);
    setIsSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          language,
          history: messages.slice(-6),
          attachment: currentAttachment,
          clientEpochMs: Date.now(),
          clientLocalDateStr: new Date().toLocaleDateString("uz-UZ"),
          clientLocalTimeStr: new Date().toLocaleTimeString("uz-UZ", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        }),
      });
      const data = await res.json();
      const replyText =
        data.reply || "Savolingiz qabul qilindi. Qanday yordam bera olaman?";

      const aiMsgId = `ai-${Date.now()}`;
      const aiMsg: ChatMessage = {
        id: aiMsgId,
        role: "assistant",
        text: replyText,
        timestamp: new Date().toLocaleTimeString("uz-UZ", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, aiMsg]);

      if (fromOnlineVoice || onlineVoiceRef.current) {
        playTtsForMessage(aiMsgId, replyText, true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: "assistant",
          text: "Savolingiz qabul qilindi. Iltimos, xabaringizni yana bir bor yuboring.",
          timestamp: "Hozir",
        },
      ]);
      if (onlineVoiceRef.current) {
        startOnlineVoiceListener();
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      if (idx !== -1) {
        setAttachedFile({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          base64Data: result.slice(idx + 1),
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleMicRecording = async (autoSendAfter = false) => {
    if (isRecordingMic) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setIsRecordingMic(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = async () => {
          const resStr = String(reader.result || "");
          const commaIdx = resStr.indexOf(",");
          if (commaIdx === -1) return;
          const base64Audio = resStr.slice(commaIdx + 1);

          try {
            const resp = await fetch("/api/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                base64Audio,
                mimeType: "audio/webm",
                language,
              }),
            });
            const data = await resp.json();
            if (data.ok && data.text) {
              if (autoSendAfter || onlineVoiceRef.current) {
                handleSendMessage(data.text, true);
              } else {
                setInputText((prev) => (prev ? `${prev} ${data.text}` : data.text));
              }
            }
          } catch {
            // ignore
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingMic(true);
    } catch {
      setVoiceStatusText("Mikrofonga ruxsat berilmadi.");
    }
  };

  const handleToggleOnlineVoice = () => {
    const nextState = !onlineVoiceActive;
    setOnlineVoiceActive(nextState);
    onlineVoiceRef.current = nextState;

    if (nextState) {
      stopAllAudio();
      startOnlineVoiceListener();
    } else {
      setVoiceStatusText("");
      stopAllAudio();
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setIsRecordingMic(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto h-full flex flex-col">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col h-[calc(100dvh-148px)] overflow-hidden">
        {/* Top Chat Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
                POSBON AI Yordamchi
              </h1>
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                {voiceStatusText || "Online · Matn, Fayl va Ovozli Suhbat"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "uz" | "ru" | "en")}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="uz">uz O'zbek</option>
              <option value="ru">ru Русский</option>
              <option value="en">en English</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setIsMuted(!isMuted);
                if (!isMuted) stopAllAudio();
              }}
              className="w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleToggleOnlineVoice}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                onlineVoiceActive
                  ? "bg-red-600 text-white"
                  : "bg-[#009a5e] hover:bg-[#008550] text-white"
              }`}
            >
              {onlineVoiceActive ? (
                <>
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>To'xtatish</span>
                </>
              ) : (
                <>
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Online Ovoz</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                setMessages([
                  {
                    id: `welcome-${Date.now()}`,
                    role: "assistant",
                    text: "Suhbat tozalandi. Savolingizni yozing yoki 'Online Ovoz' orqali gaplashing.",
                    timestamp: "Hozir",
                  },
                ])
              }
              className="w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-red-600 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages Feed */}
        <div
          ref={chatScrollRef}
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-slate-50/40 dark:bg-slate-950/30"
        >
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "bg-[#009a5e] text-white rounded-br-xs"
                      : "bg-[#f1f5f9] dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-xs border border-slate-200/60 dark:border-slate-700"
                  }`}
                >
                  {msg.attachmentName && (
                    <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5 pb-1.5 border-b border-white/20">
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>{msg.attachmentName}</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {!isUser && (
                    <div className="mt-2 pt-1.5 border-t border-slate-200/80 dark:border-slate-700 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => playTtsForMessage(msg.id, msg.text)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#009a5e] dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>
                          {playingMessageId === msg.id ? "O'qilmoqda..." : "Ovozda eshitish"}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isSending && (
            <div className="flex items-start">
              <div className="bg-[#f1f5f9] dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl px-4 py-2.5 text-xs font-medium">
                POSBON AI javob yozmoqda...
              </div>
            </div>
          )}
        </div>

        {attachedFile && (
          <div className="px-5 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 border-t border-emerald-200 dark:border-emerald-900 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 shrink-0">
            <span className="truncate">{attachedFile.fileName}</span>
            <button
              type="button"
              onClick={() => setAttachedFile(null)}
              className="text-red-600 font-semibold hover:underline cursor-pointer ml-2"
            >
              O'chirish
            </button>
          </div>
        )}

        {/* Bottom Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0"
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileAttach}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => toggleMicRecording(false)}
            className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 cursor-pointer ${
              isRecordingMic
                ? "border-red-500 bg-red-50 dark:bg-red-950 text-red-600"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {isRecordingMic ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              isRecordingMic
                ? "Ovoz yozilmoqda... Gapiring..."
                : "Savol yozing, mikrofonni bosing yoki fayl yuboring..."
            }
            className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
          />

          <button
            type="submit"
            disabled={isSending}
            className="w-11 h-10 rounded-2xl bg-[#68b99a] hover:bg-[#56a889] text-white flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

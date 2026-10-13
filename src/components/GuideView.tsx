import React from "react";
import {
  HelpCircle,
  Shield,
  Bot,
  Phone,
  CheckCircle2,
  Trash2,
  Sparkles,
  ExternalLink,
  Lock,
} from "lucide-react";

export const GuideView: React.FC = () => {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-8">
      {/* Main About & Security Guarantee Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Qo'llanma va Biz Haqimizda
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              POSBON AI — 24/7 Kiberjinoyatlarni aniqlash va bartaraf etish tizimi
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
          <strong>POSBON AI</strong> — foydalanuvchilarni zararli <code>.apk</code> fayllar,
          viruslar, trojan dasturlari va fishing hujumlaridan himoya qiluvchi tizimdir. Sayt va{" "}
          <code>@POSBONXBOT</code> 24/7 rejimda uzluksiz ishlaydi.
        </p>

        <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50 flex items-start gap-3">
          <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white block mb-0.5">
              100% Maxfiylik va Himoya Kafolati:
            </strong>
            Foydalanuvchilarning shaxsiy ma'lumotlari va tekshirilgan fayllari hech qayerda
            saqlanib qolmaydi. Tizim himoyalangan serverda ishlaydi va tashqi hujumlardan to'liq
            himoyalangan.
          </div>
        </div>
      </div>

      {/* Step-by-Step Guide */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Bot className="w-5 h-5 text-emerald-600" />
          <span>Sayt va @POSBONXBOT dan Foydalanish Qo'llanmasi</span>
        </h2>

        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
              1. SKAYNER bo'limi orqali tekshirish
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>SKAYNER</strong> bo'limida kerakli turni (Fayl, Hujjat, Rasm, Video, Ovoz yoki
              Havola) tanlang, faylni yuklang va <strong>Tekshirish</strong> tugmasini bosing. AI
              soniyalar ichida fayl necha foiz xavfsiz yoki xavfli ekanini hamda ichida nima
              borligini ko'rsatadi.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
              2. Telegram Akkauntga Ulash va Avtomatik Virus O'chirish
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
              <strong>TELEGRAM</strong> bo'limiga o'tib, <strong>"Telegram Orqali Ulash"</strong>{" "}
              tugmasini bosing va <code>@POSBONXBOT</code> ga <code>/start</code> yuboring:
            </p>
            <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 list-disc pl-5">
              <li>
                <strong>Bot orqali tekshirish:</strong> Sizga kimdir shubhali <code>.apk</code> yoki
                fayl yuborsa, uni <code>@POSBONXBOT</code> ga uzating (Forward qiling). Bot virus
                bo'lsa darhol o'chiradi va to'liq hisobot beradi.
              </li>
              <li>
                <strong>Shaxsiy chatlarda avtomatik o'chirish (Telegram Chatbot ulash):</strong>{" "}
                Telegram sozlamalaridan <em>Telegram Business → Chatbots</em> bo'limiga{" "}
                <code>@POSBONXBOT</code> ni qo'shib qo'ysangiz, sizga shaxsiyga kelgan har qanday
                virus yoki <code>.apk</code> faylni bot o'sha zahoti avtomatik o'chirib tashlaydi!
              </li>
              <li>
                <strong>Guruh va kanallarda himoya:</strong> <code>@POSBONXBOT</code> ni guruhga
                qo'shib, <em>"Xabarlarni o'chirish" (Delete messages)</em> huquqini bersangiz,
                guruhga tashlangan har qanday virus va <code>.apk</code> fayllarni 1 soniya ichida
                avtomatik o'chirib yuboradi.
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Xavfsiz fayllarga tegilmaydi</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Agar yuborilgan rasm, hujjat yoki xabar toza bo'lsa, bot unga tegmaydi va xavfsiz
                ekanligi haqida ma'lumot beradi.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-red-50/60 dark:bg-red-950/30 border border-red-200/70 dark:border-red-900/50">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-400 mb-1">
                <Trash2 className="w-4 h-4" />
                <span>Zararli viruslar darhol o'chiriladi</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Zararli <code>.apk</code> yoki virus aniqlansa, bot uni darhol o'chiradi va{" "}
                <code>/deleted</code> ro'yxatiga sanasi bilan qayd etadi.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bot Commands Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          <span>Telegram Bot Buyruqlari</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
            <code className="text-sm font-bold text-emerald-600 dark:text-emerald-400">/start</code>
            <p className="text-slate-600 dark:text-slate-300 mt-1">
              Botni ishga tushiradi va Chat ID raqamingizni avtomatik aniqlaydi.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
            <code className="text-sm font-bold text-emerald-600 dark:text-emerald-400">/status</code>
            <p className="text-slate-600 dark:text-slate-300 mt-1">
              24/7 himoya holati va tekshirilgan fayllar statistikasini ko'rsatadi.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
            <code className="text-sm font-bold text-emerald-600 dark:text-emerald-400">/deleted</code>
            <p className="text-slate-600 dark:text-slate-300 mt-1">
              O'chirilgan barcha zararli virus va .apk fayllar ro'yxatini sanasi bilan chiqaradi.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
            <code className="text-sm font-bold text-emerald-600 dark:text-emerald-400">/info</code>
            <p className="text-slate-600 dark:text-slate-300 mt-1">
              POSBON AI tizimi haqida ma'lumot va bog'lanish raqami.
            </p>
          </div>
        </div>
      </div>

      {/* Contact Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
            <Shield className="w-5 h-5" />
            <span>Biz Haqimizda</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
            POSBON AI — kiberjinoyatlarni oldindan aniqlash va foydalanuvchilarni zararli
            viruslardan himoya qilish loyihasi. Murojaat va savollar uchun:
          </p>
        </div>

        <div className="flex flex-col sm:items-end gap-2.5 shrink-0">
          <a
            href="tel:+998933210513"
            className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Phone className="w-4 h-4" />
            <span className="font-mono tabular-nums">+998 93 321 05 13</span>
          </a>
          <a
            href="https://t.me/POSBONXBOT"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <span>@POSBONXBOT</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};

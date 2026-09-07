import type { FARMER_TEXT_EN } from "./en";

/**
 * The Urdu half of the
 * Farmer UI catalog. `Record<keyof typeof FARMER_TEXT_EN, string>` forces
 * this object to carry EXACTLY the same keys as `en.ts` — missing or
 * mistyped a key here is a TypeScript error, not a silent English fallback
 * at runtime for a key that was simply forgotten.
 *
 * Plain, everyday Urdu appropriate for a farmer (not literary/formal Urdu,
 * not a word-for-word machine translation) — matches this project's own
 * existing Farmer-communication-style principle (`prompt-builder.ts`'s
 * `FARMER_COMMUNICATION_STYLE`): simple, practical language.
 * Farm/brand names ("AgriNexus", "AURA") are kept in Latin script
 * deliberately — they are proper nouns/product names, not translatable
 * words, the same way an English UI wouldn't translate a company's name.
 */
export const FARMER_TEXT_UR: Record<keyof typeof FARMER_TEXT_EN, string> = {
  // ---- common ----
  "common.appName": "AgriNexus",
  "common.farmerBadge": "کسان",
  "common.loading": "لوڈ ہو رہا ہے…",
  "common.cancel": "منسوخ کریں",
  "common.save": "محفوظ کریں",
  "common.close": "بند کریں",
  "common.unassigned": "غیر تفویض شدہ",
  "common.notConfigured": "ترتیب نہیں دیا گیا",

  // ---- nav ----
  "nav.home": "ہوم",
  "nav.digitalTwin": "ڈیجیٹل ٹوئن",
  "nav.aura": "AURA",
  "nav.settings": "ترتیبات",

  // ---- dashboard ----
  "dashboard.welcomeBack": "خوش آمدید",
  "dashboard.noFarmTitle": "ابھی تک کوئی فارم تفویض نہیں کیا گیا",
  "dashboard.noFarmDescription": "آپ کا اکاؤنٹ کسی فارم سے منسلک نہیں ہے۔ ایڈمن سیٹنگز سے ایڈمنسٹریٹر سے فارم تفویض کروائیں۔",
  "dashboard.activeMissions": "جاری مشن",
  "dashboard.fleetAvailable": "دستیاب فلیٹ",
  "dashboard.dronesAvailable": "دستیاب ڈرون",
  "dashboard.robotsAvailable": "دستیاب روبوٹ",
  "dashboard.weather": "موسم",
  "dashboard.noWeatherData": "ابھی ڈیٹا دستیاب نہیں — اس فارم کے لیے حقیقی مقام ترتیب نہیں دیا گیا۔",
  "dashboard.attention": "توجہ",
  "dashboard.recentCompletedOperations": "حالیہ مکمل شدہ آپریشنز",
  "dashboard.digitalTwinCardTitle": "ڈیجیٹل ٹوئن",
  "dashboard.digitalTwinCardDescription": "اپنا فارم 3D میں دیکھیں۔",
  "dashboard.askAuraCardTitle": "AURA سے پوچھیں",
  "dashboard.askAuraCardDescription": "اپنے فارم، مشنز، یا فصلوں کے بارے میں پوچھیں۔",
  // ---- dashboard: Attention row actions ----
  "dashboard.viewOnDigitalTwin": "ڈیجیٹل ٹوئن پر دیکھیں",
  // ---- dashboard: Farm State hero ----
  "dashboard.farmState": "فارم کی صورتحال",
  "dashboard.farmStateHealthy": "صحت مند",
  "dashboard.farmStateAttention": "توجہ درکار",
  "dashboard.farmStateCritical": "نازک صورتحال",
  "dashboard.farmStateHealthyReason": "کوئی نازک مسئلہ نہیں ملا",
  "dashboard.reasonCriticalFindings": "نازک مسائل",
  "dashboard.reasonCriticalAlerts": "نازک الرٹس",
  "dashboard.reasonMediumFindings": "درمیانی سطح کے مسائل",
  "dashboard.reasonWarningAlerts": "حل طلب وارننگ الرٹس",

  // ---- AURA page ----
  "aura.subtitle": "آپ کا AgriNexus AI معاون",
  "aura.placeholder": "AURA کو پیغام بھیجیں…",
  "aura.imagePlaceholder": "اس تصویر کے بارے میں سوال شامل کریں (اختیاری)…",
  "aura.imageLanguagePrompt": "AURA کو کس زبان میں جواب دینا چاہیے؟",
  "aura.attachImage": "تصویر منسلک کریں",
  "aura.sendMessage": "پیغام بھیجیں",
  "aura.clearConversation": "گفتگو صاف کریں",
  "aura.stopAuraSpeaking": "AURA کو بولنے سے روکیں",
  "aura.preparingVoice": "آواز تیار ہو رہی ہے…",
  "aura.stop": "روکیں",
  "aura.tapToHear": "AURA کا جواب سننے کے لیے تھپتھپائیں",
  "aura.tapToHearHint": "آواز چلانے کے لیے آپ کے براؤزر کو ایک تھپتھپاہٹ درکار ہے — سننے کے لیے تھپتھپائیں",
  "aura.replayLastReply": "AURA کا آخری جواب دوبارہ سنیں",
  "aura.replayLastReplyHint": "آخری جواب دوبارہ سنیں",
  "aura.speaking": "بول رہا ہے…",
  "aura.emptyStateTitle": "AURA سے کچھ بھی پوچھیں",
  "aura.emptyStateDescription": "AgriNexus کے لیے آپ کا AI معاون — فارم، ڈیجیٹل ٹوئن، یا پلیٹ فارم کے بارے میں پوچھیں۔",
  "aura.historyTitle": "AURA تاریخ",
  "aura.newChat": "نئی بات چیت",
  "aura.noConversationsYet": "ابھی تک کوئی بات چیت نہیں۔",
  "aura.groupToday": "آج",
  "aura.groupYesterday": "کل",
  "aura.groupOlder": "پرانی",
  "aura.clearHistory": "تاریخ صاف کریں",
  "aura.deleteConversationLabel": "بات چیت حذف کریں",
  "aura.deleteAllTitle": "تمام AURA بات چیتیں حذف کریں؟",
  "aura.deleteAllDescription": "یہ اس اکاؤنٹ کی ہر محفوظ شدہ AURA بات چیت حذف کر دے گا۔ آپ کے فارم کا ڈیٹا، نتائج، مشنز، اور الرٹس متاثر نہیں ہوں گے۔",
  "aura.deleteAll": "سب حذف کریں",

  // ---- voice controls ----
  "voice.speakToAura": "AURA سے بولیں",
  "voice.stopRecording": "ریکارڈنگ روکیں",
  "voice.listening": "سن رہا ہے… روکنے کے لیے تھپتھپائیں",
  "voice.requestingMic": "مائیکروفون کی اجازت مانگی جا رہی ہے…",
  "voice.understanding": "سمجھا جا رہا ہے…",
  "voice.micDenied": "مائیکروفون تک رسائی نہیں دی گئی۔ آپ اب بھی اپنا پیغام لکھ سکتے ہیں۔",
  "voice.notSupported": "اس ڈیوائس پر آواز کی ریکارڈنگ دستیاب نہیں۔ براہ کرم اپنا پیغام لکھیں۔",
  "voice.couldntHear": "اس ریکارڈنگ میں کچھ سنائی نہیں دیا۔ دوبارہ کوشش کریں۔",
  "voice.couldntUnderstand": "وہ ریکارڈنگ سمجھی نہیں جا سکی۔",
  "voice.couldntProcess": "اس ریکارڈنگ پر عمل نہیں ہو سکا۔",

  // ---- settings ----
  "settings.title": "ترتیبات",
  "settings.profile": "پروفائل",
  "settings.name": "نام",
  "settings.email": "ای میل",
  "settings.role": "کردار",
  "settings.language": "زبان",
  "settings.appLanguage": "ایپ کی زبان",
  "settings.appLanguageNote": "مکمل ایپ ترجمہ بعد کے مرحلے میں آئے گا — یہ ابھی آپ کی ترجیح محفوظ کرتا ہے۔",
  "settings.appearance": "ظاہری شکل",
  "settings.darkMode": "ڈارک موڈ",
  "settings.darkModeNote": "پوری کسان تجربے کے لیے ایک پرسکون، کم روشنی والا تھیم۔",
  "settings.aura": "AURA",
  "settings.voiceAvailableNote": "AURA خود بخود آپ کی بولی یا لکھی گئی زبان میں جواب دیتا ہے — اردو یا انگریزی۔ اس کے لیے کوئی الگ زبان کی ترتیب نہیں ہے۔",
  "settings.confirmBeforeMission": "مشن تفویض کرنے سے پہلے تصدیق طلب کریں",
  "settings.chatHistory": "بات چیت کی تاریخ",
  "settings.clearAllConversations": "تمام بات چیتیں صاف کریں",
  "settings.notifications": "اطلاعات",
  "settings.cropIssueAlerts": "فصل کے مسئلے کے الرٹس",
  "settings.missionCompletion": "مشن کی تکمیل",
  "settings.robotDroneAlerts": "روبوٹ/ڈرون الرٹس",
  "settings.weatherAlerts": "موسم کے الرٹس",
  "settings.farmWeather": "فارم / موسم",
  "settings.weatherLocation": "موسم کا مقام",
  "settings.farmWeatherNote": "آپ کے فارم آپریٹر نے موسم کے صفحے سے مقرر کیا ہے — پوری ایپ میں حقیقی پیشن گوئی کے لیے استعمال ہوتا ہے۔",
  "settings.privacy": "رازداری",
  "settings.privacyNote": "AURA بات چیت کی تاریخ حذف کرنے سے آپ کے فارم کے نتائج، مشنز، یا الرٹس متاثر نہیں ہوتے — وہ ہمیشہ کے لیے محفوظ ریکارڈ رہتے ہیں۔",
  "settings.account": "اکاؤنٹ",
  "settings.signOut": "سائن آؤٹ",

  // ---- create mission (Dashboard trigger) ----
  "mission.createMission": "مشن بنائیں",
};

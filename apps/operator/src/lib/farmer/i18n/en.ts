/**
 * The Farmer UI
 * translation catalog's ENGLISH half. This file is also the canonical KEY
 * SOURCE: `FarmerTranslationKey` (in `use-farmer-translation.ts`) is derived
 * from `keyof typeof FARMER_TEXT_EN`, so `ur.ts` is type-checked against
 * exactly this file's keys — adding a key here without adding it to `ur.ts`
 * is a compile error, and vice versa (no silently-missing translation).
 *
 * Scope is deliberately the Farmer surface named in this change's own
 * "at minimum cover" list (nav, dashboard, AURA page/voice controls,
 * Settings incl. language settings, common buttons/statuses/empty-loading-
 * error states) — NOT every string in the app, and NOT the Operator app or
 * the shared Digital Twin 3D/HUD internals (see the milestone report's own
 * "Digital Twin" finding for why those stay English-only). Farm DATA
 * (alert messages, mission names, plot labels, findings) is never
 * translated here — only static UI chrome.
 *
 * Grouped by feature area purely for human readability; consumers address
 * keys directly (e.g. `t("nav.home")`), never by group.
 */
export const FARMER_TEXT_EN = {
  // ---- common ----
  "common.appName": "AgriNexus",
  "common.farmerBadge": "Farmer",
  "common.loading": "Loading…",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.close": "Close",
  "common.unassigned": "Unassigned",
  "common.notConfigured": "Not configured",

  // ---- nav ----
  "nav.home": "Home",
  "nav.digitalTwin": "Digital Twin",
  "nav.aura": "AURA",
  "nav.settings": "Settings",

  // ---- dashboard ----
  "dashboard.welcomeBack": "Welcome back",
  "dashboard.noFarmTitle": "No farm is assigned yet",
  "dashboard.noFarmDescription": "Your account isn't linked to a farm. Ask an administrator to assign one from Admin Settings.",
  "dashboard.activeMissions": "Active missions",
  "dashboard.fleetAvailable": "Fleet available",
  "dashboard.dronesAvailable": "Drones available",
  "dashboard.robotsAvailable": "Robots available",
  "dashboard.weather": "Weather",
  "dashboard.noWeatherData": "No data available yet — this farm doesn't have a real-world location configured.",
  "dashboard.attention": "Attention",
  "dashboard.recentCompletedOperations": "Recent completed operations",
  "dashboard.digitalTwinCardTitle": "Digital Twin",
  "dashboard.digitalTwinCardDescription": "See your farm in 3D.",
  "dashboard.askAuraCardTitle": "Ask AURA",
  "dashboard.askAuraCardDescription": "Ask about your farm, missions, or crops.",
  // ---- dashboard: Attention row actions — "View on Digital
  // Twin" matches the exact existing wording Operator's own Alerts page
  // already uses for this identical action (`alerts-page.tsx`).
  "dashboard.viewOnDigitalTwin": "View on Digital Twin",
  // ---- dashboard: Farm State hero ----
  "dashboard.farmState": "Farm State",
  "dashboard.farmStateHealthy": "Healthy",
  "dashboard.farmStateAttention": "Needs Attention",
  "dashboard.farmStateCritical": "Critical",
  "dashboard.farmStateHealthyReason": "No critical issues detected",
  "dashboard.reasonCriticalFindings": "critical findings",
  "dashboard.reasonCriticalAlerts": "critical alerts",
  "dashboard.reasonMediumFindings": "medium-severity findings",
  "dashboard.reasonWarningAlerts": "unresolved warning alerts",

  // ---- AURA page ----
  "aura.subtitle": "Your AgriNexus AI assistant",
  "aura.placeholder": "Message AURA…",
  "aura.imagePlaceholder": "Add a question about this image (optional)…",
  "aura.imageLanguagePrompt": "How should AURA answer?",
  "aura.attachImage": "Attach an image",
  "aura.sendMessage": "Send message",
  "aura.clearConversation": "Clear conversation",
  "aura.stopAuraSpeaking": "Stop AURA speaking",
  "aura.preparingVoice": "Preparing voice…",
  "aura.stop": "Stop",
  "aura.tapToHear": "Tap to hear AURA's reply",
  "aura.tapToHearHint": "Your browser needs a tap to play sound — tap to hear AURA",
  "aura.replayLastReply": "Replay AURA's last reply",
  "aura.replayLastReplyHint": "Replay last reply",
  "aura.speaking": "Speaking…",
  "aura.emptyStateTitle": "Ask AURA anything",
  "aura.emptyStateDescription": "Your AI operating assistant for AgriNexus — ask about the farm, the Digital Twin, or the platform.",
  "aura.historyTitle": "AURA History",
  "aura.newChat": "New Chat",
  "aura.noConversationsYet": "No conversations yet.",
  "aura.groupToday": "Today",
  "aura.groupYesterday": "Yesterday",
  "aura.groupOlder": "Older",
  "aura.clearHistory": "Clear History",
  "aura.deleteConversationLabel": "Delete conversation",
  "aura.deleteAllTitle": "Delete all AURA conversations?",
  "aura.deleteAllDescription": "This removes every saved AURA conversation on this account. Your farm data, findings, missions, and alerts are never affected.",
  "aura.deleteAll": "Delete all",

  // ---- voice controls ----
  "voice.speakToAura": "Speak to AURA",
  "voice.stopRecording": "Stop recording",
  "voice.listening": "Listening… tap to stop",
  "voice.requestingMic": "Requesting microphone…",
  "voice.understanding": "Understanding…",
  "voice.micDenied": "Microphone access was denied. You can still type your message.",
  "voice.notSupported": "Voice recording isn't supported on this device. Please type your message instead.",
  "voice.couldntHear": "I couldn't hear anything in that recording. Please try again.",
  "voice.couldntUnderstand": "Could not understand that recording.",
  "voice.couldntProcess": "Could not process that recording.",

  // ---- settings ----
  "settings.title": "Settings",
  "settings.profile": "Profile",
  "settings.name": "Name",
  "settings.email": "Email",
  "settings.role": "Role",
  "settings.language": "Language",
  "settings.appLanguage": "App language",
  "settings.appLanguageNote": "Full app translation is coming in a later phase — this saves your preference now.",
  "settings.appearance": "Appearance",
  "settings.darkMode": "Dark mode",
  "settings.darkModeNote": "A calmer, low-light theme for the whole Farmer experience.",
  "settings.aura": "AURA",
  "settings.voiceAvailableNote": "AURA automatically replies in whichever language you speak or type — English or Urdu. There's no separate language setting to manage.",
  "settings.confirmBeforeMission": "Ask for confirmation before assigning a mission",
  "settings.chatHistory": "Chat history",
  "settings.clearAllConversations": "Clear all conversations",
  "settings.notifications": "Notifications",
  "settings.cropIssueAlerts": "Crop issue alerts",
  "settings.missionCompletion": "Mission completion",
  "settings.robotDroneAlerts": "Robot/drone alerts",
  "settings.weatherAlerts": "Weather alerts",
  "settings.farmWeather": "Farm / Weather",
  "settings.weatherLocation": "Weather location",
  "settings.farmWeatherNote": "Set by your farm operator from the Weather page — used for real forecast data across the app.",
  "settings.privacy": "Privacy",
  "settings.privacyNote": "Deleting AURA chat history never affects your farm's findings, missions, or alerts — those remain permanent operational records.",
  "settings.account": "Account",
  "settings.signOut": "Sign out",

  // ---- create mission (Dashboard trigger) ----
  "mission.createMission": "Create Mission",
} as const;

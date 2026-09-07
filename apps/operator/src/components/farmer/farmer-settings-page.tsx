"use client";

import { useEffect, useState } from "react";
import { LogOut, Moon, Sparkles, User as UserIcon } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Typography,
} from "@agrinexus/ui";

import type { AppSessionUser } from "@/lib/auth/types";
import { useAuraConversationStore } from "@/lib/aura/conversations/aura-conversation-store";
import { FARMER_CONTENT_WIDTH } from "@/components/farmer/farmer-shell";
import {
  FARMER_LANGUAGE_LABELS,
  FARMER_LANGUAGES,
  useFarmerSettingsStore,
  type FarmerLanguage,
  type FarmerNotificationPreferences,
} from "@/lib/farmer/farmer-settings-store";
import { useFarmerTranslation, type FarmerTranslationKey } from "@/lib/farmer/i18n/use-farmer-translation";

/**
 * The Farmer Settings foundation: Profile, Language, AURA,
 * Notifications, Farm/Weather, Privacy, Account. Functional first
 * — plain `@agrinexus/ui` primitives, no new visual system. Every toggle
 * here either does something real today (see `farmer-settings-store.ts`'s
 * own doc comment for exactly which two) or is honestly labeled as a
 * preference recorded for a later phase — nothing here fakes functionality
 * that doesn't exist yet (Part 26/27's explicit rule for voice/multilingual).
 */

function LanguageSelect({ value, onChange, label }: { value: FarmerLanguage; onChange: (language: FarmerLanguage) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Typography variant="small">{label}</Typography>
      <Select value={value} onValueChange={(next) => onChange(next as FarmerLanguage)}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FARMER_LANGUAGES.map((language) => (
            <SelectItem key={language} value={language}>
              {FARMER_LANGUAGE_LABELS[language]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Typography variant="small">{label}</Typography>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

const NOTIFICATION_LABEL_KEYS: Record<keyof FarmerNotificationPreferences, FarmerTranslationKey> = {
  cropIssueAlerts: "settings.cropIssueAlerts",
  missionCompletion: "settings.missionCompletion",
  robotDroneAlerts: "settings.robotDroneAlerts",
  weatherAlerts: "settings.weatherAlerts",
};

async function handleSignOut(): Promise<void> {
  // Mirrors `components/shell/user-menu.tsx`'s `handleSignOut` exactly (see
  // that file's own doc comment for why the redirect is done manually) — no
  // shared export exists for this one-line flow, matching how that
  // component also keeps it module-local.
  try {
    await signOut({ redirect: false });
  } finally {
    window.location.href = "/login";
  }
}

export function FarmerSettingsPage() {
  const { t } = useFarmerTranslation();
  const { data: session } = useSession();
  const user = session?.user as AppSessionUser | undefined;

  const displayLanguage = useFarmerSettingsStore((state) => state.displayLanguage);
  const theme = useFarmerSettingsStore((state) => state.theme);
  const actionConfirmationRequired = useFarmerSettingsStore((state) => state.actionConfirmationRequired);
  const notifications = useFarmerSettingsStore((state) => state.notifications);
  const setDisplayLanguage = useFarmerSettingsStore((state) => state.setDisplayLanguage);
  const setTheme = useFarmerSettingsStore((state) => state.setTheme);
  const setActionConfirmationRequired = useFarmerSettingsStore((state) => state.setActionConfirmationRequired);
  const setNotificationPreference = useFarmerSettingsStore((state) => state.setNotificationPreference);

  const clearAllHistory = useAuraConversationStore((state) => state.clearAllHistory);
  // This button previously called
  // `clearAllHistory()` directly on click with NO confirmation step at all,
  // unlike the AURA panel's own "Clear History" (`aura-history-panel.tsx`),
  // which already gates the identical action behind a real confirmation
  // dialog. A single accidental click here permanently deleted every saved
  // AURA conversation — the most plausible explanation found for the
  // conversation-loss incident. Fixed by reusing the EXACT SAME confirmation
  // pattern `aura-history-panel.tsx` already established, rather than
  // inventing a second one.
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/farm/location")
      .then((response) => response.json())
      .then((data: { location: { latitude: number; longitude: number } | null }) => setLocation(data.location))
      .catch(() => setLocation(null));
  }, []);

  return (
    // "comfortable" tier (see `farmer-shell.tsx`'s own doc
    // comment): deliberately narrower than Dashboard/AURA's "wide" tier,
    // per the audit's own "comfortable reading/form width rather than
    // unnecessarily stretched controls" finding (MVP-UI.1-A audit).
    // Card gap widened slightly (`gap-4` → `gap-6`) so whitespace reads as
    // section grouping rather than uniform filler (audit).
    <div className={cn(FARMER_CONTENT_WIDTH.comfortable, "flex flex-col gap-6 py-6")}>
      {/* Page title promoted from `h4` (the same weight as a card title —
          too weak for a page-level heading) to `h2`, one step below the
          Dashboard's `display` hero heading — Settings is a secondary page,
          not a landing page, so it gets a real but smaller title. */}
      <Typography variant="h2">{t("settings.title")}</Typography>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="size-4" aria-hidden />
            {t("settings.profile")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <Typography variant="small">{t("settings.name")}</Typography>
            <Typography variant="small" className="text-foreground-subtle">{user?.name ?? "—"}</Typography>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Typography variant="small">{t("settings.email")}</Typography>
            <Typography variant="small" className="text-foreground-subtle">{user?.email ?? "—"}</Typography>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Typography variant="small">{t("settings.role")}</Typography>
            <Typography variant="small" className="text-foreground-subtle capitalize">{user?.role ?? "—"}</Typography>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <LanguageSelect value={displayLanguage} onChange={setDisplayLanguage} label={t("settings.appLanguage")} />
          <Typography variant="small" className="text-foreground-subtle">
            {t("settings.appLanguageNote")}
          </Typography>
        </CardContent>
      </Card>

      {/*
        MVP-UI.1-F (Farmer Dark Theme Foundation) — the one real, user-facing
        control this milestone adds: a plain `ToggleRow` (the exact same
        component/pattern already used for every other Settings switch on
        this page, e.g. `confirmBeforeMission` below), not a new control
        type. Wired directly to `farmer-settings-store.ts`'s persisted
        `theme` field — toggling it flips the `dark` class `farmer-shell.tsx`
        applies alongside `.farmer-theme`, which is the ENTIRE mechanism;
        no page-level redesign happens here or anywhere else this milestone.
      */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="size-4" aria-hidden />
            {t("settings.appearance")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ToggleRow
            label={t("settings.darkMode")}
            checked={theme === "dark"}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          />
          <Typography variant="small" className="text-foreground-subtle">
            {t("settings.darkModeNote")}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4" aria-hidden />
            {t("settings.aura")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/*
            MVP-3C.7.2-B, Phase G — the "AURA reply language" selector was
            REMOVED here (not merely hidden): AURA now determines its reply
            language automatically, per turn, from what the Farmer just
            said or typed (see `language-detection.ts` /
            `farmer-aura-page.tsx`), so a static override selector next to
            it would contradict the very requirement it once existed to
            express. The underlying `auraLanguage` store field is KEPT
            internally (see `farmer-settings-store.ts`'s own doc comment)
            as the one, English-only fallback `collect-context.ts` reaches
            for on the rare turn nothing can be confidently detected — it
            no longer has any user-facing control, matching this phase's
            explicit "no separate AURA Reply Language selector" requirement
            without a broader Settings redesign.
          */}
          <Typography variant="small" className="text-foreground-subtle">
            {t("settings.voiceAvailableNote")}
          </Typography>
          <ToggleRow
            label={t("settings.confirmBeforeMission")}
            checked={actionConfirmationRequired}
            onCheckedChange={setActionConfirmationRequired}
          />
          <div className="flex items-center justify-between gap-4">
            <Typography variant="small">{t("settings.chatHistory")}</Typography>
            <button
              type="button"
              className="text-sm font-medium text-critical hover:underline"
              onClick={() => setConfirmClearOpen(true)}
            >
              {t("settings.clearAllConversations")}
            </button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("aura.deleteAllTitle")}</DialogTitle>
            <DialogDescription>{t("aura.deleteAllDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button intent="outline" onClick={() => setConfirmClearOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              intent="destructive"
              onClick={() => {
                void clearAllHistory();
                setConfirmClearOpen(false);
              }}
            >
              {t("aura.deleteAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.notifications")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(Object.keys(NOTIFICATION_LABEL_KEYS) as (keyof FarmerNotificationPreferences)[]).map((key) => (
            <ToggleRow
              key={key}
              label={t(NOTIFICATION_LABEL_KEYS[key])}
              checked={notifications[key]}
              onCheckedChange={(value) => setNotificationPreference(key, value)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.farmWeather")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <Typography variant="small">{t("settings.weatherLocation")}</Typography>
            <Typography variant="small" className="text-foreground-subtle">
              {location === undefined ? t("common.loading") : location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : t("common.notConfigured")}
            </Typography>
          </div>
          <Typography variant="small" className="text-foreground-subtle">
            {t("settings.farmWeatherNote")}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.privacy")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Typography variant="small" className="text-foreground-subtle">
            {t("settings.privacyNote")}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.account")}</CardTitle>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-critical hover:underline"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="size-4" aria-hidden />
            {t("settings.signOut")}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

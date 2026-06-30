import { getOrCreateDistinctId } from "./analyticsIdentity";

const ANALYTICS_CONSENT_KEY = "dxf:analytics";
const ANALYTICS_SESSION_ID_KEY = "dxf:session-id";
const ANALYTICS_SESSION_START_KEY = "dxf:session-start";
const ANALYTICS_SESSION_LAST_SEEN_KEY = "dxf:session-last-seen";
const ANALYTICS_ACTIVE_DAY_KEY = "dxf:last-active-day";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const POSTHOG_API_KEY = import.meta.env.VITE_POSTHOG_API_KEY?.trim() ?? "";
const POSTHOG_API_HOST = normalizeHost(import.meta.env.VITE_POSTHOG_API_HOST ?? "https://eu.i.posthog.com");
const APP_VERSION = chrome.runtime.getManifest().version;
const TIMEZONE = resolveTimezone();

type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;
type SessionContext = {
  id: string;
  startMs: number;
  isNew: boolean;
};

const FEATURE_EVENT_TO_NAME: Record<string, string> = {
  measure_used: "measure",
  compare_used: "compare",
  bookmark_created: "bookmark",
  screenshot_taken: "screenshot",
  find_used: "find",
  minimap_toggled: "minimap",
  coords_toggled: "coords",
  theme_changed: "theme",
  recent_file_reopened: "recent_reopen",
};

let pageEventCount = 0;
let pageFilesOpened = 0;
const pageFeatures = new Set<string>();

export function getAnalyticsEnabled(): boolean {
  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    if (stored === null) return true;
    return stored === "1" || stored === "true";
  } catch {
    return true;
  }
}

export function setAnalyticsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

export function track(event: string, properties: AnalyticsProps = {}): void {
  if (!POSTHOG_API_KEY || !POSTHOG_API_HOST || !getAnalyticsEnabled()) return;
  const now = Date.now();
  const session = touchSession(now);
  const baseProperties = {
    ...properties,
    app_version: APP_VERSION,
    locale: document.documentElement.lang || chrome.i18n.getUILanguage(),
    timezone: TIMEZONE,
    source: "dxf-file-viewer-extension",
    session_id: session.id,
    session_elapsed_sec: Math.max(0, Math.round((now - session.startMs) / 1000)),
  };
  pageEventCount += 1;
  if (event === "viewer_ready") {
    pageFilesOpened += 1;
  }
  const featureName = FEATURE_EVENT_TO_NAME[event];
  if (featureName) {
    pageFeatures.add(featureName);
  }

  sendCaptureWithBase(event, baseProperties);

  if (session.isNew && event !== "session_started") {
    sendCapture("session_started", {
      surface: getSurface(),
      trigger_event: event,
      session_id: session.id,
      session_elapsed_sec: 0,
    });
  }

  const dayStamp = getDayStamp(now);
  if (shouldSendDailyPing(dayStamp)) {
    sendCapture("active_day_ping", {
      surface: getSurface(),
      day: dayStamp,
      session_id: session.id,
      session_elapsed_sec: Math.max(0, Math.round((now - session.startMs) / 1000)),
    });
  }
}

export function getPageSessionStats(): {
  eventsCount: number;
  filesOpenedCount: number;
  featuresUsedCount: number;
  usedMeasure: boolean;
  usedCompare: boolean;
  usedBookmark: boolean;
  usedScreenshot: boolean;
  usedFind: boolean;
} {
  return {
    eventsCount: pageEventCount,
    filesOpenedCount: pageFilesOpened,
    featuresUsedCount: pageFeatures.size,
    usedMeasure: pageFeatures.has("measure"),
    usedCompare: pageFeatures.has("compare"),
    usedBookmark: pageFeatures.has("bookmark"),
    usedScreenshot: pageFeatures.has("screenshot"),
    usedFind: pageFeatures.has("find"),
  };
}

function sendCapture(event: string, properties: AnalyticsProps): void {
  sendCaptureWithBase(event, {
    ...properties,
    app_version: APP_VERSION,
    locale: document.documentElement.lang || chrome.i18n.getUILanguage(),
    timezone: TIMEZONE,
    source: "dxf-file-viewer-extension",
  });
}

function sendCaptureWithBase(event: string, properties: AnalyticsProps): void {
  void getOrCreateDistinctId()
    .then((distinctId) => {
      const payload = {
        api_key: POSTHOG_API_KEY,
        event,
        distinct_id: distinctId,
        properties,
        timestamp: new Date().toISOString(),
      };
      sendPayload(payload);
    })
    .catch(() => {
      const payload = {
        api_key: POSTHOG_API_KEY,
        event,
        distinct_id: `ephemeral-${crypto.randomUUID()}`,
        properties,
        timestamp: new Date().toISOString(),
      };
      sendPayload(payload);
    });
}

function sendPayload(payload: {
  api_key: string;
  event: string;
  distinct_id: string;
  properties: AnalyticsProps;
  timestamp: string;
}): void {
  void fetch(`${POSTHOG_API_HOST}/capture/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
    credentials: "omit",
  }).catch(() => {
    // Best-effort analytics should never break UX.
  });
}

function touchSession(now: number): SessionContext {
  let sessionId: string | null = null;
  let sessionStart = 0;
  let isNew = false;
  try {
    const storedId = window.localStorage.getItem(ANALYTICS_SESSION_ID_KEY);
    const storedStart = Number(window.localStorage.getItem(ANALYTICS_SESSION_START_KEY) ?? "0");
    const storedLast = Number(window.localStorage.getItem(ANALYTICS_SESSION_LAST_SEEN_KEY) ?? "0");
    const expired = !storedId || !storedStart || !storedLast || now - storedLast > SESSION_TIMEOUT_MS;
    if (expired) {
      sessionId = crypto.randomUUID();
      sessionStart = now;
      isNew = true;
    } else {
      sessionId = storedId;
      sessionStart = storedStart;
    }
    window.localStorage.setItem(ANALYTICS_SESSION_ID_KEY, sessionId);
    window.localStorage.setItem(ANALYTICS_SESSION_START_KEY, String(sessionStart));
    window.localStorage.setItem(ANALYTICS_SESSION_LAST_SEEN_KEY, String(now));
    return { id: sessionId, startMs: sessionStart, isNew };
  } catch {
    return {
      id: `ephemeral-session-${crypto.randomUUID()}`,
      startMs: now,
      isNew: true,
    };
  }
}

function shouldSendDailyPing(dayStamp: string): boolean {
  try {
    const lastDay = window.localStorage.getItem(ANALYTICS_ACTIVE_DAY_KEY);
    if (lastDay === dayStamp) return false;
    window.localStorage.setItem(ANALYTICS_ACTIVE_DAY_KEY, dayStamp);
    return true;
  } catch {
    return false;
  }
}

function getDayStamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function getSurface(): "popup" | "viewer" {
  const path = window.location.pathname;
  if (path.includes("/popup/")) return "popup";
  return "viewer";
}

function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  } catch {
    return "unknown";
  }
}

function normalizeHost(host: string): string {
  return host.trim().replace(/\/+$/, "");
}

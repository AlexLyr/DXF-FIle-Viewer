type I18nDataset = DOMStringMap & {
  i18n?: string;
  i18nAriaLabel?: string;
  i18nPlaceholder?: string;
  i18nTitle?: string;
};

type LocalePlaceholder = { content: string };
type LocaleMessage = { message: string; placeholders?: Record<string, LocalePlaceholder> };
type LocaleDictionary = Record<string, LocaleMessage>;

type LocaleInfo = {
  code: string;
  nativeName: string;
  englishName: string;
};

const LOCALE_STORAGE_KEY = "dfv.locale";

const AVAILABLE_LOCALES: ReadonlyArray<LocaleInfo> = [
  { code: "am", nativeName: "አማርኛ", englishName: "Amharic" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic" },
  { code: "bn", nativeName: "বাংলা", englishName: "Bengali" },
  { code: "bg", nativeName: "Български", englishName: "Bulgarian" },
  { code: "ca", nativeName: "Català", englishName: "Catalan" },
  { code: "zh_CN", nativeName: "中文 (简体)", englishName: "Chinese (Simplified)" },
  { code: "zh_TW", nativeName: "中文 (繁體)", englishName: "Chinese (Traditional)" },
  { code: "hr", nativeName: "Hrvatski", englishName: "Croatian" },
  { code: "cs", nativeName: "Čeština", englishName: "Czech" },
  { code: "da", nativeName: "Dansk", englishName: "Danish" },
  { code: "nl", nativeName: "Nederlands", englishName: "Dutch" },
  { code: "en", nativeName: "English", englishName: "English" },
  { code: "et", nativeName: "Eesti", englishName: "Estonian" },
  { code: "fa", nativeName: "فارسی", englishName: "Persian" },
  { code: "fil", nativeName: "Filipino", englishName: "Filipino" },
  { code: "fi", nativeName: "Suomi", englishName: "Finnish" },
  { code: "fr", nativeName: "Français", englishName: "French" },
  { code: "de", nativeName: "Deutsch", englishName: "German" },
  { code: "el", nativeName: "Ελληνικά", englishName: "Greek" },
  { code: "gu", nativeName: "ગુજરાતી", englishName: "Gujarati" },
  { code: "he", nativeName: "עברית", englishName: "Hebrew" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi" },
  { code: "hu", nativeName: "Magyar", englishName: "Hungarian" },
  { code: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian" },
  { code: "it", nativeName: "Italiano", englishName: "Italian" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese" },
  { code: "kn", nativeName: "ಕನ್ನಡ", englishName: "Kannada" },
  { code: "ko", nativeName: "한국어", englishName: "Korean" },
  { code: "lv", nativeName: "Latviešu", englishName: "Latvian" },
  { code: "lt", nativeName: "Lietuvių", englishName: "Lithuanian" },
  { code: "ms", nativeName: "Bahasa Melayu", englishName: "Malay" },
  { code: "ml", nativeName: "മലയാളം", englishName: "Malayalam" },
  { code: "mr", nativeName: "मराठी", englishName: "Marathi" },
  { code: "no", nativeName: "Norsk", englishName: "Norwegian" },
  { code: "pl", nativeName: "Polski", englishName: "Polish" },
  { code: "pt_BR", nativeName: "Português (Brasil)", englishName: "Portuguese (Brazil)" },
  { code: "pt_PT", nativeName: "Português (Portugal)", englishName: "Portuguese (Portugal)" },
  { code: "ro", nativeName: "Română", englishName: "Romanian" },
  { code: "ru", nativeName: "Русский", englishName: "Russian" },
  { code: "sr", nativeName: "Српски", englishName: "Serbian" },
  { code: "sk", nativeName: "Slovenčina", englishName: "Slovak" },
  { code: "sl", nativeName: "Slovenščina", englishName: "Slovenian" },
  { code: "es", nativeName: "Español", englishName: "Spanish" },
  { code: "es_419", nativeName: "Español (LatAm)", englishName: "Spanish (Latin America)" },
  { code: "sw", nativeName: "Kiswahili", englishName: "Swahili" },
  { code: "sv", nativeName: "Svenska", englishName: "Swedish" },
  { code: "ta", nativeName: "தமிழ்", englishName: "Tamil" },
  { code: "te", nativeName: "తెలుగు", englishName: "Telugu" },
  { code: "th", nativeName: "ไทย", englishName: "Thai" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish" },
  { code: "uk", nativeName: "Українська", englishName: "Ukrainian" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese" },
];

const AVAILABLE_LOCALE_CODES = new Set(AVAILABLE_LOCALES.map((x) => x.code));
const cache = new Map<string, LocaleDictionary>();
const listeners = new Set<() => void>();
let currentLocale = "en";
let initPromise: Promise<void> | null = null;

export async function initI18n(): Promise<void> {
  if (initPromise) {
    await initPromise;
    return;
  }
  initPromise = (async () => {
    const stored = readStoredLocale();
    currentLocale = stored ? normalizeLocaleCode(stored) : detectDefaultLocale();
    if (currentLocale === "en") {
      await fetchLocale("en");
      return;
    }
    await Promise.all([fetchLocale("en"), fetchLocale(currentLocale)]);
  })();
  await initPromise;
}

export async function setLocale(lang: string): Promise<void> {
  const next = normalizeLocaleCode(lang);
  if (next === currentLocale) return;
  if (next === "en") {
    await fetchLocale("en");
  } else {
    await Promise.all([fetchLocale("en"), fetchLocale(next)]);
  }
  currentLocale = next;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, currentLocale);
  } catch {
    // ignore
  }
  setHtmlLang();
  listeners.forEach((cb) => cb());
}

export function getLocale(): string {
  return currentLocale;
}

export function getAvailableLocales(): ReadonlyArray<LocaleInfo> {
  return AVAILABLE_LOCALES;
}

export function onLocaleChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function t(key: string, ...subs: string[]): string {
  const localMessage = cache.get(currentLocale)?.[key];
  const fallbackMessage = cache.get("en")?.[key];
  const message = localMessage ?? fallbackMessage;
  if (!message?.message) return key;
  return substituteMessage(message, subs);
}

export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = (el.dataset as I18nDataset).i18n;
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]").forEach((el) => {
    const key = (el.dataset as I18nDataset).i18nAriaLabel;
    if (key) el.setAttribute("aria-label", t(key));
  });
  root.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((el) => {
    const key = (el.dataset as I18nDataset).i18nPlaceholder;
    if (key) el.placeholder = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = (el.dataset as I18nDataset).i18nTitle;
    if (key) el.title = t(key);
  });
}

export function setHtmlLang(): void {
  document.documentElement.lang = getLocale().replace("_", "-");
}

async function fetchLocale(lang: string): Promise<LocaleDictionary> {
  if (cache.has(lang)) {
    return cache.get(lang)!;
  }
  const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load locale ${lang}: ${response.status}`);
    }
    const data = (await response.json()) as LocaleDictionary;
    cache.set(lang, data);
    return data;
  } catch (error) {
    console.error(error);
    if (lang !== "en") {
      return fetchLocale("en");
    }
    cache.set("en", {});
    return {};
  }
}

function readStoredLocale(): string | null {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function detectDefaultLocale(): string {
  return normalizeLocaleCode(chrome.i18n.getUILanguage());
}

function normalizeLocaleCode(locale: string): string {
  const normalized = locale.replace("-", "_");
  if (AVAILABLE_LOCALE_CODES.has(normalized)) return normalized;
  const [base] = normalized.split("_");
  if (base && AVAILABLE_LOCALE_CODES.has(base)) return base;
  return "en";
}

function substituteMessage(message: LocaleMessage, subs: string[]): string {
  let text = message.message;
  if (message.placeholders) {
    text = text.replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$/g, (full, name: string) => {
      const ph = message.placeholders?.[name];
      return ph?.content ?? full;
    });
  }
  text = text.replace(/\$(\d+)/g, (full, indexStr: string) => {
    const idx = Number(indexStr) - 1;
    if (idx < 0 || idx >= subs.length) return full;
    return subs[idx] ?? "";
  });
  return text;
}

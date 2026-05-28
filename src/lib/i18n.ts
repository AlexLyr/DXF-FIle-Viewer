type I18nDataset = DOMStringMap & {
  i18n?: string;
  i18nAriaLabel?: string;
  i18nPlaceholder?: string;
  i18nTitle?: string;
};

export function t(key: string, ...subs: string[]): string {
  const msg = chrome.i18n.getMessage(key, subs.length ? subs : undefined);
  return msg || key;
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
  document.documentElement.lang = chrome.i18n.getUILanguage();
}

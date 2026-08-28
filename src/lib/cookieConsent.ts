export type CookieConsentValue = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  savedAt: string;
  version: "v2";
};

const STORAGE_KEY = "koenen_cookie_consent_v2";

export function getCookieConsent(): CookieConsentValue | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CookieConsentValue) : null;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return Boolean(getCookieConsent()?.analytics);
}

export function hasMarketingConsent(): boolean {
  return Boolean(getCookieConsent()?.marketing);
}

export function openCookieSettings() {
  window.dispatchEvent(new Event("open-cookie-settings"));
}

export function saveCookieConsent(value: CookieConsentValue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

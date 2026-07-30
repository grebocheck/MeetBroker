import { createContext, ReactNode, useContext } from "react";
import type { Locale } from "../types";
import { de } from "../locales/de";
import { en } from "../locales/en";
import { es } from "../locales/es";
import { fr } from "../locales/fr";
import { ja } from "../locales/ja";
import { uk, type MessageKey } from "../locales/uk";

const translations = { uk, en, de, es, fr, ja };
const dateLocales: Record<Locale, string> = {
  uk: "uk-UA",
  en: "en-GB",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  ja: "ja-JP",
};

export const localeOptions: ReadonlyArray<{
  value: Locale;
  label: string;
  shortLabel: string;
}> = [
  { value: "uk", label: "Українська", shortLabel: "UA" },
  { value: "en", label: "English", shortLabel: "EN" },
  { value: "de", label: "Deutsch", shortLabel: "DE" },
  { value: "es", label: "Español", shortLabel: "ES" },
  { value: "fr", label: "Français", shortLabel: "FR" },
  { value: "ja", label: "日本語", shortLabel: "JA" },
];

export function resolveBrowserLocale(language: string): Locale {
  const normalized = language.toLowerCase();
  const direct = localeOptions.find(
    ({ value }) => normalized === value.toLowerCase(),
  );
  if (direct) return direct.value;
  const base = normalized.split("-")[0];
  return localeOptions.find(({ value }) => value === base)?.value ?? "en";
}

type Variables = Record<string, string | number>;
export type Translator = (key: MessageKey, variables?: Variables) => string;

export function translate(
  locale: Locale,
  key: MessageKey,
  variables: Variables = {},
): string {
  return Object.entries(variables).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    translations[locale][key],
  );
}

const I18nContext = createContext<{
  locale: Locale;
  dateLocale: string;
  t: Translator;
}>({
  locale: "uk",
  dateLocale: "uk-UA",
  t: (key, variables) => translate("uk", key, variables),
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider
      value={{
        locale,
        dateLocale: dateLocales[locale],
        t: (key, variables) => translate(locale, key, variables),
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

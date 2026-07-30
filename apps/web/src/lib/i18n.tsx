import { createContext, ReactNode, useContext } from "react";
import type { Locale } from "../types";
import { en } from "../locales/en";
import { uk, type MessageKey } from "../locales/uk";

const translations = { uk, en };
type Variables = Record<string, string | number>;
export type Translator = (key: MessageKey, variables?: Variables) => string;

export function translate(
  locale: Locale,
  key: MessageKey,
  variables: Variables = {},
): string {
  return Object.entries(variables).reduce(
    (message, [name, value]) =>
      message.replaceAll(`{${name}}`, String(value)),
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
  children
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider
      value={{
        locale,
        dateLocale: locale === "uk" ? "uk-UA" : "en-GB",
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

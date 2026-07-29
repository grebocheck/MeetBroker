import { createContext, ReactNode, useContext } from "react";
import type { Locale } from "../types";

const translations = {
  uk: {
    calendar: "Розклад",
    myBookings: "Мої бронювання",
    openEvents: "Відкриті події",
    notifications: "Сповіщення",
    profile: "Профіль",
    administration: "Адміністрування",
    signOut: "Вийти",
    book: "Забронювати",
    today: "Сьогодні",
    loading: "Завантаження…",
    retry: "Спробувати ще",
    empty: "Тут поки порожньо",
    save: "Зберегти",
    cancel: "Скасувати",
    room: "Кімната",
    capacity: "місць",
    floor: "поверх"
  },
  en: {
    calendar: "Schedule",
    myBookings: "My bookings",
    openEvents: "Open events",
    notifications: "Notifications",
    profile: "Profile",
    administration: "Administration",
    signOut: "Sign out",
    book: "Book",
    today: "Today",
    loading: "Loading…",
    retry: "Try again",
    empty: "Nothing here yet",
    save: "Save",
    cancel: "Cancel",
    room: "Room",
    capacity: "seats",
    floor: "floor"
  }
} as const;

type TranslationKey = keyof (typeof translations)["uk"];
const I18nContext = createContext<{
  locale: Locale;
  t: (key: TranslationKey) => string;
}>({ locale: "uk", t: (key) => translations.uk[key] });

export function I18nProvider({
  locale,
  children
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider
      value={{ locale, t: (key) => translations[locale][key] }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

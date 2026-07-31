import type { Locale } from "../common/types";
import type { NotificationMessage } from "./notification-channel";

const EVENT_PRESENTATION: Record<
  string,
  { emoji: string; labels: Record<Locale, string> }
> = {
  BOOKING_INVITATION: {
    emoji: "📅",
    labels: labels(
      "Запрошення",
      "Invitation",
      "Einladung",
      "Invitación",
      "Invitation",
      "招待",
    ),
  },
  BOOKING_UPDATED: {
    emoji: "🔄",
    labels: labels(
      "Зміна зустрічі",
      "Meeting update",
      "Meeting-Änderung",
      "Cambio de reunión",
      "Modification",
      "会議の変更",
    ),
  },
  BOOKING_PARTICIPANT_REMOVED: {
    emoji: "👥",
    labels: labels(
      "Склад зустрічі",
      "Participants",
      "Teilnehmende",
      "Participantes",
      "Participants",
      "参加者",
    ),
  },
  BOOKING_CANCELLED: {
    emoji: "❌",
    labels: labels(
      "Скасування",
      "Cancellation",
      "Absage",
      "Cancelación",
      "Annulation",
      "キャンセル",
    ),
  },
  BOOKING_REMINDER: {
    emoji: "⏰",
    labels: labels(
      "Нагадування",
      "Reminder",
      "Erinnerung",
      "Recordatorio",
      "Rappel",
      "リマインダー",
    ),
  },
  BOOKING_END_WARNING: {
    emoji: "⚠️",
    labels: labels(
      "Увага до часу",
      "Time warning",
      "Zeithinweis",
      "Aviso de tiempo",
      "Alerte horaire",
      "時間の注意",
    ),
  },
  TELEGRAM_TEST: {
    emoji: "✅",
    labels: labels(
      "Перевірка каналу",
      "Channel check",
      "Kanalprüfung",
      "Prueba del canal",
      "Test du canal",
      "チャンネル確認",
    ),
  },
};

const DEFAULT_PRESENTATION = {
  emoji: "🔔",
  labels: labels(
    "Сповіщення",
    "Notification",
    "Benachrichtigung",
    "Notificación",
    "Notification",
    "通知",
  ),
};

export function renderTelegramMessage(
  message: NotificationMessage,
  locale: Locale,
): string {
  const presentation =
    EVENT_PRESENTATION[message.eventType ?? ""] ?? DEFAULT_PRESENTATION;
  const label = presentation.labels[locale];
  const body = escapeTelegramHtml(message.body.trim());

  return [
    `${presentation.emoji} <b>${escapeTelegramHtml(message.title.trim())}</b>`,
    body,
    `────────────`,
    `<i>MeetBroker · ${escapeTelegramHtml(label)}</i>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function labels(
  uk: string,
  en: string,
  de: string,
  es: string,
  fr: string,
  ja: string,
): Record<Locale, string> {
  return { uk, en, de, es, fr, ja };
}

function escapeTelegramHtml(value: string): string {
  return value.replace(
    /[&<>]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
      })[character]!,
  );
}

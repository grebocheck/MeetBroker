import type { useI18n } from "../../lib/i18n";
import type { MessageKey } from "../../locales/uk";

type Translate = ReturnType<typeof useI18n>["t"];

export interface AdminRoomBlock {
  id: string;
  kind: "ONCE" | "SERIES";
  roomId: string;
  roomName: string;
  title: string;
  privateNote: string | null;
  startsAt: string;
  endsAt: string;
  frequency: "DAILY" | "WEEKLY" | null;
  recurrenceInterval: number | null;
  weekdays: number[] | null;
  recurrenceUntil: string | null;
  occurrenceCount: number;
}

const AUDIT_ACTION_KEYS: Record<string, MessageKey> = {
  USER_APPROVED: "audit.USER_APPROVED",
  USER_ACCESS_REVOKED: "audit.USER_ACCESS_REVOKED",
  USER_ACCESS_RESTORED: "audit.USER_ACCESS_RESTORED",
  USER_RESTRICTED: "audit.USER_RESTRICTED",
  USER_RESTRICTION_REVOKED: "audit.USER_RESTRICTION_REVOKED",
  USER_ROLE_CHANGED: "audit.USER_ROLE_CHANGED",
  EMAIL_CHANGE_REQUESTED: "audit.EMAIL_CHANGE_REQUESTED",
  EMAIL_CHANGED: "audit.EMAIL_CHANGED",
  PASSWORD_CHANGED: "audit.PASSWORD_CHANGED",
  ROOM_CREATED: "audit.ROOM_CREATED",
  ROOM_UPDATED: "audit.ROOM_UPDATED",
  ROOM_IMAGE_UPDATED: "audit.ROOM_IMAGE_UPDATED",
  ROOM_IMAGE_REMOVED: "audit.ROOM_IMAGE_REMOVED",
  ROOM_BLOCK_CREATED: "audit.ROOM_BLOCK_CREATED",
  ROOM_BLOCK_CANCELLED: "audit.ROOM_BLOCK_CANCELLED",
  ROOM_BLOCK_SERIES_CREATED: "audit.ROOM_BLOCK_SERIES_CREATED",
  ROOM_BLOCK_SERIES_CANCELLED: "audit.ROOM_BLOCK_SERIES_CANCELLED",
  BOOKING_CREATED: "audit.BOOKING_CREATED",
  BOOKING_UPDATED: "audit.BOOKING_UPDATED",
  BOOKING_UPDATED_BY_ADMIN: "audit.BOOKING_UPDATED_BY_ADMIN",
  BOOKING_CANCELLED: "audit.BOOKING_CANCELLED",
  BOOKING_CANCELLED_BY_ADMIN: "audit.BOOKING_CANCELLED_BY_ADMIN",
  BOOKING_AVAILABILITY_OVERRIDE: "audit.BOOKING_AVAILABILITY_OVERRIDE",
  BOOKING_INVITATION_ACCEPTED: "audit.BOOKING_INVITATION_ACCEPTED",
  BOOKING_INVITATION_DECLINED: "audit.BOOKING_INVITATION_DECLINED",
  OPEN_EVENT_JOINED: "audit.OPEN_EVENT_JOINED",
  OPEN_EVENT_LEFT: "audit.OPEN_EVENT_LEFT",
  NOTIFICATION_DELIVERY_RETRIED: "audit.NOTIFICATION_DELIVERY_RETRIED",
};

const DETAIL_KEYS: Record<string, MessageKey> = {
  reason: "admin.reason",
  title: "admin.name",
  roomName: "room",
  startsAt: "admin.start",
  endsAt: "admin.end",
  participationMode: "admin.format",
  participantCount: "admin.participants",
  addedParticipants: "admin.addedParticipants",
  removedParticipants: "admin.removedParticipants",
  role: "admin.role",
  capability: "admin.restriction",
  expiresAt: "admin.expiresAt",
  recurrence: "admin.recurrence",
  recurrenceInterval: "admin.interval",
  weekdays: "admin.weekdays",
  recurrenceUntil: "admin.repeatUntil",
  occurrenceCount: "admin.createdIntervals",
  pendingEmail: "admin.pendingEmail",
  eventType: "admin.eventType",
  previousAttempts: "admin.previousAttempts",
};

export function humanizeAction(action: string, t: Translate): string {
  const key = AUDIT_ACTION_KEYS[action];
  return key ? t(key) : action;
}

export function humanizeTarget(target: string, t: Translate): string {
  const targets: Record<string, string> = {
    BOOKING: t("admin.targetBooking"),
    USER: t("admin.targetUser"),
    ROOM: t("room"),
    ROOM_BLOCK: t("admin.targetRoomBlock"),
    ROOM_BLOCK_SERIES: t("admin.targetRoomBlockSeries"),
    NOTIFICATION_DELIVERY: t("admin.targetNotificationDelivery"),
  };
  return targets[target] ?? target;
}

export function humanizeDetailKey(key: string, t: Translate): string {
  const messageKey = DETAIL_KEYS[key];
  return messageKey ? t(messageKey) : key;
}

export function formatActivityValue(
  value: unknown,
  dateLocale: string,
  t: Translate,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(dateLocale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    }
    if (value === "OPEN") return t("admin.statusOpen");
    if (value === "INVITE_ONLY") return t("admin.inviteOnly");
    return value;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function formatRoomBlockRule(
  block: AdminRoomBlock,
  dateLocale: string,
  t: Translate,
): string {
  const time = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  if (block.kind === "ONCE") {
    return `${time.format(new Date(block.startsAt))} — ${time.format(
      new Date(block.endsAt),
    )}`;
  }
  const interval = block.recurrenceInterval ?? 1;
  const frequency =
    block.frequency === "DAILY"
      ? interval === 1
        ? t("admin.daily")
        : t("admin.everyDays", { interval })
      : interval === 1
        ? t("admin.weekly")
        : t("admin.everyWeeks", { interval });
  const dayLabels = [
    t("weekday.sun"),
    t("weekday.mon"),
    t("weekday.tue"),
    t("weekday.wed"),
    t("weekday.thu"),
    t("weekday.fri"),
    t("weekday.sat"),
  ];
  const weekdays = block.weekdays?.length
    ? ` · ${block.weekdays.map((day) => dayLabels[day]).join(", ")}`
    : "";
  return `${frequency}${weekdays} · ${t("admin.futureOccurrences", {
    count: block.occurrenceCount,
  })}`;
}

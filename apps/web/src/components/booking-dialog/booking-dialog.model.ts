import type { MessageKey } from "../../locales/uk";

export type MeetingType = "ROOM" | "ONLINE";
export type ParticipationMode = "INVITE_ONLY" | "OPEN";
export type Recurrence = "NONE" | "DAILY" | "WEEKLY";

export type BookingErrorTarget =
  | "title"
  | "time"
  | "recurrence"
  | "participants"
  | "meetingUrl"
  | "image"
  | "adminReason"
  | "form";

export interface BookingFormValues {
  meetingType: MeetingType;
  meetingUrl: string;
  title: string;
  startsAt: string;
  endsAt: string;
  participationMode: ParticipationMode;
  participantIds: string[];
  recurrence: Recurrence;
  recurrenceInterval: number;
  recurrenceUntil: string;
  weekdays: number[];
  adminReason: string;
}

export interface BookingValidationContext {
  editing: boolean;
  administrative: boolean;
}

export interface BookingValidationIssue {
  target: BookingErrorTarget;
  key: MessageKey;
}

export interface BuildBookingPayloadOptions extends BookingValidationContext {
  roomId?: string;
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function nextHalfHour(now = new Date()): Date {
  const result = new Date(now);
  result.setSeconds(0, 0);
  const minutes = result.getMinutes();
  result.setMinutes(minutes < 30 ? 30 : 60);
  return result;
}

export function validateBookingForm(
  values: BookingFormValues,
  context: BookingValidationContext,
): BookingValidationIssue | null {
  if (!values.title.trim()) {
    return { target: "title", key: "booking.titleRequired" };
  }
  if (
    values.meetingType === "ONLINE" &&
    !isHttpsUrl(values.meetingUrl.trim())
  ) {
    return { target: "meetingUrl", key: "booking.meetingUrlRequired" };
  }

  const start = new Date(values.startsAt);
  const end = new Date(values.endsAt);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start >= end
  ) {
    return { target: "time", key: "booking.endAfterStart" };
  }
  if (context.administrative && values.adminReason.trim().length < 3) {
    return { target: "adminReason", key: "booking.adminReasonRequired" };
  }
  if (!context.editing && values.recurrence !== "NONE") {
    if (!values.recurrenceUntil) {
      return {
        target: "recurrence",
        key: "booking.recurrenceEndRequired",
      };
    }
    if (values.recurrence === "WEEKLY" && values.weekdays.length === 0) {
      return {
        target: "recurrence",
        key: "booking.recurrenceWeekdaysRequired",
      };
    }
  }
  return null;
}

export function buildBookingPayload(
  values: BookingFormValues,
  options: BuildBookingPayloadOptions,
): Record<string, unknown> {
  return {
    ...(!options.editing
      ? {
          meetingType: values.meetingType,
          roomId: values.meetingType === "ROOM" ? options.roomId : undefined,
        }
      : {}),
    ...(values.meetingType === "ONLINE"
      ? { meetingUrl: values.meetingUrl.trim() }
      : {}),
    title: values.title.trim(),
    startsAt: new Date(values.startsAt).toISOString(),
    endsAt: new Date(values.endsAt).toISOString(),
    participationMode: values.participationMode,
    participantIds: values.participantIds,
    ...(!options.editing && values.recurrence !== "NONE"
      ? {
          recurrence: values.recurrence,
          recurrenceInterval: values.recurrenceInterval,
          recurrenceUntil: values.recurrenceUntil,
          weekdays:
            values.recurrence === "WEEKLY" ? values.weekdays : undefined,
        }
      : {}),
    ...(options.administrative
      ? { adminReason: values.adminReason.trim() }
      : {}),
  };
}

import { toZonedTime } from "date-fns-tz";

export interface BookingRuleInput {
  startsAt: Date;
  endsAt: Date;
  now: Date;
  officeTimeZone: string;
  workStart: string;
  workEnd: string;
  workingDays: number[];
}

export type BookingRuleError =
  | "INVALID_TIME"
  | "SLOT_ALIGNMENT"
  | "DURATION"
  | "PAST"
  | "OUTSIDE_WORKING_DAYS"
  | "OUTSIDE_WORKING_HOURS";

const BOOKING_RULE_MESSAGES: Record<BookingRuleError, string> = {
  INVALID_TIME: "Start and end time are invalid",
  SLOT_ALIGNMENT: "Time must align to a 30-minute slot",
  DURATION: "Booking duration must be between 30 minutes and 4 hours",
  PAST: "Booking must start in the future",
  OUTSIDE_WORKING_DAYS: "Room is closed on this day",
  OUTSIDE_WORKING_HOURS: "Booking is outside room working hours",
};

export function bookingRuleMessage(error: BookingRuleError): string {
  return BOOKING_RULE_MESSAGES[error];
}

export function normalizeMeetingUrl(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function parseClock(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function validateBookingRules(
  input: BookingRuleInput,
): BookingRuleError | null {
  const {
    startsAt,
    endsAt,
    now,
    officeTimeZone,
    workStart,
    workEnd,
    workingDays,
  } = input;
  const commonError = validateMeetingRules({
    startsAt,
    endsAt,
    now,
    officeTimeZone,
  });
  if (commonError) return commonError;

  const localStart = toZonedTime(startsAt, officeTimeZone);
  const localEnd = toZonedTime(endsAt, officeTimeZone);
  const isoWeekday = localStart.getDay() === 0 ? 7 : localStart.getDay();
  if (!workingDays.includes(isoWeekday)) {
    return "OUTSIDE_WORKING_DAYS";
  }

  const sameOfficeDay =
    localStart.getFullYear() === localEnd.getFullYear() &&
    localStart.getMonth() === localEnd.getMonth() &&
    localStart.getDate() === localEnd.getDate();
  if (
    !sameOfficeDay ||
    minutesOfDay(localStart) < parseClock(workStart) ||
    minutesOfDay(localEnd) > parseClock(workEnd)
  ) {
    return "OUTSIDE_WORKING_HOURS";
  }

  return null;
}

export function validateMeetingRules(input: {
  startsAt: Date;
  endsAt: Date;
  now: Date;
  officeTimeZone: string;
}): BookingRuleError | null {
  const { startsAt, endsAt, now, officeTimeZone } = input;
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    startsAt >= endsAt
  ) {
    return "INVALID_TIME";
  }

  const localStart = toZonedTime(startsAt, officeTimeZone);
  const localEnd = toZonedTime(endsAt, officeTimeZone);
  if (
    localStart.getMinutes() % 30 !== 0 ||
    localEnd.getMinutes() % 30 !== 0 ||
    localStart.getSeconds() !== 0 ||
    localEnd.getSeconds() !== 0
  ) {
    return "SLOT_ALIGNMENT";
  }

  const durationMinutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  if (durationMinutes < 30 || durationMinutes > 240) {
    return "DURATION";
  }
  if (startsAt <= now) {
    return "PAST";
  }

  return null;
}

export function intervalsOverlap(
  firstStart: Date,
  firstEnd: Date,
  secondStart: Date,
  secondEnd: Date,
): boolean {
  return firstStart < secondEnd && firstEnd > secondStart;
}

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

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function parseClock(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function validateBookingRules(
  input: BookingRuleInput
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

export function intervalsOverlap(
  firstStart: Date,
  firstEnd: Date,
  secondStart: Date,
  secondEnd: Date
): boolean {
  return firstStart < secondEnd && firstEnd > secondStart;
}

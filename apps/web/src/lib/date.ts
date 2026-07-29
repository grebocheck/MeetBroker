import { addDays, startOfWeek } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export function officeWeek(reference: Date, officeTimeZone: string): Date[] {
  const officeNow = toZonedTime(reference, officeTimeZone);
  const monday = startOfWeek(officeNow, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function officeLocalToInstant(
  officeDate: Date,
  hours: number,
  minutes: number,
  officeTimeZone: string
): Date {
  const local = new Date(
    officeDate.getFullYear(),
    officeDate.getMonth(),
    officeDate.getDate(),
    hours,
    minutes,
    0,
    0
  );
  return fromZonedTime(local, officeTimeZone);
}

export function toDateTimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function dateKeyInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone
  }).format(date);
}

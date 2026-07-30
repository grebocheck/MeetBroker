import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export function officeDateWindow(
  reference: Date,
  officeTimeZone: string,
  dayCount = 6
): Date[] {
  const firstDay = startOfDay(toZonedTime(reference, officeTimeZone));
  return Array.from({ length: dayCount }, (_, index) =>
    addDays(firstDay, index)
  );
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

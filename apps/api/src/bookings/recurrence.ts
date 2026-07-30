import { addDays, differenceInCalendarDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export type RecurrenceFrequency = "DAILY" | "WEEKLY";

export interface RecurrenceInput {
  startsAt: Date;
  endsAt: Date;
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: number[] | null;
  until: string;
  timeZone: string;
  maxDays?: number;
  maxOccurrences?: number;
}

export interface RecurrenceOccurrence {
  startsAt: Date;
  endsAt: Date;
}

export class RecurrenceError extends Error {
  constructor(public readonly code: "INVALID_RANGE" | "EMPTY" | "TOO_MANY") {
    super(code);
  }
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function buildRecurrenceOccurrences({
  startsAt,
  endsAt,
  frequency,
  interval,
  weekdays,
  until,
  timeZone,
  maxDays = 366,
  maxOccurrences = 100,
}: RecurrenceInput): RecurrenceOccurrence[] {
  const startLocal = toZonedTime(startsAt, timeZone);
  const startKey = localDateKey(startLocal);
  const untilKey = until.slice(0, 10);
  const untilLocal = new Date(`${untilKey}T12:00:00Z`);
  const startDate = new Date(`${startKey}T12:00:00Z`);
  const recurrenceDays = differenceInCalendarDays(untilLocal, startDate);
  if (recurrenceDays < 0 || recurrenceDays > maxDays) {
    throw new RecurrenceError("INVALID_RANGE");
  }

  const wallClock = `${String(startLocal.getHours()).padStart(2, "0")}:${String(
    startLocal.getMinutes(),
  ).padStart(2, "0")}:00`;
  const durationMs = endsAt.getTime() - startsAt.getTime();
  const occurrences: RecurrenceOccurrence[] = [];

  for (let dayOffset = 0; dayOffset <= recurrenceDays; dayOffset += 1) {
    const localDay = addDays(startLocal, dayOffset);
    const eligible =
      frequency === "DAILY"
        ? dayOffset % interval === 0
        : Math.floor(dayOffset / 7) % interval === 0 &&
          Boolean(weekdays?.includes(localDay.getDay()));
    if (!eligible) continue;

    const occurrenceStart = fromZonedTime(
      `${localDateKey(localDay)}T${wallClock}`,
      timeZone,
    );
    if (occurrenceStart < startsAt) continue;
    occurrences.push({
      startsAt: occurrenceStart,
      endsAt: new Date(occurrenceStart.getTime() + durationMs),
    });
    if (occurrences.length > maxOccurrences) {
      throw new RecurrenceError("TOO_MANY");
    }
  }

  if (!occurrences.length) throw new RecurrenceError("EMPTY");
  return occurrences;
}

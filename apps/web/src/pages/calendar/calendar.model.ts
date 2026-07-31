import { addDays } from "date-fns";

export const CALENDAR_SLOT_HEIGHT = 32;

export function calendarDayCount(width: number): number {
  if (width < 480) return 2;
  if (width < 650) return 3;
  if (width < 800) return 4;
  if (width < 980) return 5;
  if (width < 1220) return 6;
  return 7;
}

export function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function nextWorkingDate(after: Date, workingDays: number[]): Date {
  for (let offset = 1; offset <= 14; offset += 1) {
    const candidate = addDays(after, offset);
    const weekday = candidate.getDay() === 0 ? 7 : candidate.getDay();
    if (workingDays.includes(weekday)) return candidate;
  }
  return addDays(after, 1);
}

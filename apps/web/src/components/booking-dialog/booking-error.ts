import { ApiError } from "../../lib/api";
import { errorMessage } from "../../lib/error-message";
import type { Translator } from "../../lib/i18n";
import type { BookingErrorTarget } from "./booking-dialog.model";

export interface BookingError {
  target: BookingErrorTarget;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formattedStart(
  details: unknown,
  formatter: Intl.DateTimeFormat,
): string | null {
  if (!isRecord(details) || !("startsAt" in details)) return null;
  const date = new Date(String(details.startsAt));
  return Number.isNaN(date.getTime()) ? null : formatter.format(date);
}

function attendeeConflictMessage(
  details: unknown,
  formatter: Intl.DateTimeFormat,
  t: Translator,
): string {
  if (!isRecord(details) || !Array.isArray(details.conflicts)) {
    return t("booking.attendeeBusy");
  }
  const lines = details.conflicts.flatMap((conflict) => {
    if (
      !isRecord(conflict) ||
      typeof conflict.userName !== "string" ||
      !Array.isArray(conflict.bookings)
    ) {
      return [];
    }
    const meetings = conflict.bookings.flatMap((booking) => {
      if (
        !isRecord(booking) ||
        typeof booking.title !== "string" ||
        typeof booking.startsAt !== "string"
      ) {
        return [];
      }
      const date = new Date(booking.startsAt);
      if (Number.isNaN(date.getTime())) return [];
      return [`«${booking.title}» — ${formatter.format(date)}`];
    });
    return meetings.length
      ? [
          t("booking.attendeeBusyPerson", {
            name: conflict.userName,
            meetings: meetings.join("; "),
          }),
        ]
      : [];
  });
  return lines.length
    ? `${t("booking.attendeeBusy")}\n${lines.join("\n")}`
    : t("booking.attendeeBusy");
}

export function bookingError(
  error: unknown,
  t: Translator,
  dateLocale: string,
): BookingError | null {
  if (!(error instanceof ApiError)) return null;
  const formatter = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (error.code === "ATTENDEE_BUSY") {
    return {
      target: "participants",
      message: attendeeConflictMessage(error.details, formatter, t),
    };
  }

  const occurrenceStart = formattedStart(error.details, formatter);
  const errors: Record<string, BookingError> = {
    INVALID_TIME: { target: "time", message: t("booking.invalidTime") },
    SLOT_ALIGNMENT: {
      target: "time",
      message: t("booking.slotAlignment"),
    },
    DURATION: { target: "time", message: t("booking.duration") },
    PAST: { target: "time", message: t("booking.past") },
    OUTSIDE_WORKING_HOURS: {
      target: "time",
      message: t("booking.outsideHours"),
    },
    OUTSIDE_WORKING_DAYS: {
      target: "time",
      message: t("booking.outsideDays"),
    },
    SLOT_TAKEN: {
      target: "time",
      message: occurrenceStart
        ? t("booking.seriesSlotTaken", { date: occurrenceStart })
        : t("booking.slotTaken"),
    },
    ROOM_UNAVAILABLE: {
      target: "time",
      message: occurrenceStart
        ? t("booking.seriesRoomUnavailable", { date: occurrenceStart })
        : t("booking.roomUnavailable"),
    },
    ROOM_CAPACITY_EXCEEDED: {
      target: "participants",
      message: t("booking.capacityExceeded"),
    },
    ROOM_REQUIRED: { target: "form", message: t("booking.roomRequired") },
    MEETING_URL_REQUIRED: {
      target: "meetingUrl",
      message: t("booking.meetingUrlRequired"),
    },
    BOOKING_IMAGE_REQUIRED: {
      target: "image",
      message: t("booking.imageInvalid"),
    },
    INVALID_BOOKING_IMAGE: {
      target: "image",
      message: t("booking.imageInvalid"),
    },
    INVALID_PARTICIPANT: {
      target: "participants",
      message: t("booking.invalidParticipant"),
    },
    BOOKING_CREATE_RESTRICTED: {
      target: "form",
      message: t("booking.createRestricted"),
    },
    CAPABILITY_RESTRICTED: {
      target: "form",
      message:
        isRecord(error.details) && typeof error.details.reason === "string"
          ? t("booking.actionRestrictedReason", {
              reason: error.details.reason,
            })
          : t("booking.actionRestricted"),
    },
    RECURRENCE_END_REQUIRED: {
      target: "recurrence",
      message: t("booking.recurrenceEndRequired"),
    },
    RECURRENCE_WEEKDAYS_REQUIRED: {
      target: "recurrence",
      message: t("booking.recurrenceWeekdaysRequired"),
    },
    INVALID_RECURRENCE_RANGE: {
      target: "recurrence",
      message: t("booking.recurrenceRange"),
    },
    EMPTY_RECURRENCE: {
      target: "recurrence",
      message: t("booking.recurrenceEmpty"),
    },
    TOO_MANY_OCCURRENCES: {
      target: "recurrence",
      message: t("booking.recurrenceTooMany"),
    },
    ADMIN_EDIT_REASON_REQUIRED: {
      target: "adminReason",
      message: t("booking.adminReasonRequired"),
    },
  };
  return (
    errors[error.code] ?? {
      target: "form",
      message: errorMessage(error, t),
    }
  );
}

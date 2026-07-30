import { toZonedTime } from "date-fns-tz";
import type { BookingDraft } from "../../components/BookingDialog";
import { dateKeyInZone, officeLocalToInstant } from "../../lib/date";
import { useI18n } from "../../lib/i18n";
import type { Booking, RoomBlock, Schedule } from "../../types";
import { CALENDAR_SLOT_HEIGHT } from "./calendar.model";

interface CalendarDayColumnProps {
  day: Date;
  slots: number[];
  startMinutes: number;
  workStartMinutes: number;
  workEndMinutes: number;
  workingDay: boolean;
  officeTimeZone: string;
  schedule: Schedule;
  currentUserId: string;
  onCreate: (draft: BookingDraft) => void;
  onBooking: (booking: Booking) => void;
  onBlock: (block: RoomBlock) => void;
}

export function CalendarDayColumn({
  day,
  slots,
  startMinutes,
  workStartMinutes,
  workEndMinutes,
  workingDay,
  officeTimeZone,
  schedule,
  currentUserId,
  onCreate,
  onBooking,
  onBlock,
}: CalendarDayColumnProps) {
  const { dateLocale, t } = useI18n();
  const key = dateKeyInZone(
    officeLocalToInstant(day, 12, 0, officeTimeZone),
    officeTimeZone,
  );
  const bookings = schedule.bookings.filter(
    (booking) =>
      dateKeyInZone(new Date(booking.startsAt), officeTimeZone) === key,
  );
  const blocks = schedule.blocks.filter(
    (block) => dateKeyInZone(new Date(block.startsAt), officeTimeZone) === key,
  );

  return (
    <div className={`day-column${!workingDay ? " is-closed" : ""}`}>
      {!workingDay && (
        <span className="day-column__closed-label">
          {t("calendar.closedDay")}
        </span>
      )}
      {slots.map((minutes) => {
        const outsideWorkingHours =
          !workingDay ||
          minutes < workStartMinutes ||
          minutes >= workEndMinutes;
        const start = officeLocalToInstant(
          day,
          Math.floor(minutes / 60),
          minutes % 60,
          officeTimeZone,
        );
        return (
          <button
            className={`calendar-slot${
              outsideWorkingHours ? " calendar-slot--closed" : ""
            }`}
            key={minutes}
            disabled={outsideWorkingHours}
            onClick={() => {
              if (!outsideWorkingHours) {
                onCreate({
                  startsAt: start,
                  endsAt: new Date(start.getTime() + 30 * 60_000),
                });
              }
            }}
            aria-label={
              outsideWorkingHours
                ? t("calendar.closedSlot", { time: start.toISOString() })
                : t("calendar.freeSlot", { time: start.toISOString() })
            }
          />
        );
      })}
      {blocks.map((block) => {
        const localStart = toZonedTime(
          new Date(block.startsAt),
          officeTimeZone,
        );
        const minutes = localStart.getHours() * 60 + localStart.getMinutes();
        const duration =
          (new Date(block.endsAt).getTime() -
            new Date(block.startsAt).getTime()) /
          60_000;
        return (
          <button
            type="button"
            className={`booking-block booking-block--maintenance${
              block.seriesId ? " booking-block--recurring" : ""
            }`}
            style={{
              top:
                ((minutes - startMinutes) / 30) * CALENDAR_SLOT_HEIGHT + 2,
              height: Math.max(
                28,
                (duration / 30) * CALENDAR_SLOT_HEIGHT - 4,
              ),
            }}
            key={block.id}
            onClick={() => onBlock(block)}
            aria-label={`${t("calendar.unavailableDetails")}: ${block.title}`}
          >
            <small>
              {block.seriesId
                ? t("calendar.recurringUnavailable")
                : t("calendar.legendUnavailable")}
            </small>
            <span>{block.title}</span>
          </button>
        );
      })}
      {bookings.map((booking) => {
        const localStart = toZonedTime(
          new Date(booking.startsAt),
          officeTimeZone,
        );
        const minutes = localStart.getHours() * 60 + localStart.getMinutes();
        const duration =
          (new Date(booking.endsAt).getTime() -
            new Date(booking.startsAt).getTime()) /
          60_000;
        const own = booking.organizer.id === currentUserId;
        return (
          <button
            className={`booking-block${
              own ? " booking-block--own" : ""
            }${booking.participationMode === "OPEN" ? " booking-block--open" : ""}${
              booking.imageUrl ? " booking-block--image" : ""
            }`}
            style={{
              top:
                ((minutes - startMinutes) / 30) * CALENDAR_SLOT_HEIGHT + 2,
              height: Math.max(
                28,
                (duration / 30) * CALENDAR_SLOT_HEIGHT - 4,
              ),
              ...(booking.imageUrl
                ? {
                    backgroundImage: `linear-gradient(90deg, rgba(2, 15, 39, .9), rgba(2, 24, 56, .48)), url("${booking.imageUrl}")`,
                    backgroundPosition: "center",
                    backgroundSize: "cover",
                  }
                : {}),
            }}
            key={booking.id}
            onClick={() => onBooking(booking)}
          >
            <small>
              {new Intl.DateTimeFormat(dateLocale, {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(new Date(booking.startsAt))}
            </small>
            <strong>{booking.title}</strong>
            <span>
              {own ? t("calendar.yourBooking") : booking.organizer.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

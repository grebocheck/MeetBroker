import { useI18n } from "../lib/i18n";
import type { Room, RoomBlock } from "../types";
import { DrawerLayer } from "./ui/DrawerLayer";

const OFFICE_TIME_ZONE = "Europe/Kyiv";

export function RoomBlockDrawer({
  block,
  room,
  timeZone,
  onClose,
}: {
  block: RoomBlock;
  room: Room;
  timeZone: string;
  onClose: () => void;
}) {
  const { dateLocale, t } = useI18n();
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  });
  const recurrenceUntil = block.recurrenceUntil
    ? new Intl.DateTimeFormat(dateLocale, {
        dateStyle: "long",
        timeZone: OFFICE_TIME_ZONE,
      }).format(new Date(block.recurrenceUntil))
    : null;
  const weekdays = (block.recurrenceWeekdays ?? [])
    .map((weekday) =>
      new Intl.DateTimeFormat(dateLocale, {
        weekday: "short",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2024, 0, weekday - 1))),
    )
    .join(", ");
  const interval = block.recurrenceInterval ?? 1;
  const recurrence =
    block.recurrence === "DAILY"
      ? interval === 1
        ? t("calendar.recurrenceDaily")
        : t("calendar.recurrenceDailyInterval", { count: interval })
      : block.recurrence === "WEEKLY"
        ? interval === 1
          ? t("calendar.recurrenceWeekly", { days: weekdays })
          : t("calendar.recurrenceWeeklyInterval", {
              count: interval,
              days: weekdays,
            })
        : null;

  return (
    <DrawerLayer labelledBy="room-block-details-title" onClose={onClose}>
      {(close) => (
        <>
          <div className="drawer__header">
            <div>
              <span className="eyebrow drawer__event-type">
                <span
                  className="event-dot event-dot--maintenance"
                  aria-hidden="true"
                />
                <span>
                  {block.seriesId
                    ? t("calendar.recurringUnavailable")
                    : t("calendar.legendUnavailable")}
                </span>
              </span>
              <h2 id="room-block-details-title">{block.title}</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => close()}
              aria-label={t("close")}
            >
              ×
            </button>
          </div>
          <p className="drawer__description">
            {t("calendar.unavailableDescription")}
          </p>
          <span className="detail-label">{t("calendar.unavailableTime")}</span>
          <div className="drawer-time">
            {dateTime.formatRange(
              new Date(block.startsAt),
              new Date(block.endsAt),
            )}
          </div>
          <span className="detail-label">{t("room")}</span>
          <strong>{room.name}</strong>
          {recurrence && (
            <>
              <span className="detail-label">{t("calendar.recurrence")}</span>
              <strong>{recurrence}</strong>
              {recurrenceUntil && (
                <p className="drawer__meta">
                  {t("calendar.recurrenceUntil", {
                    date: recurrenceUntil,
                  })}
                </p>
              )}
            </>
          )}
        </>
      )}
    </DrawerLayer>
  );
}

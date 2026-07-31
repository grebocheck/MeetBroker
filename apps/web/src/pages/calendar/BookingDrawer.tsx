import { Avatar } from "../../components/Avatar";
import { DrawerLayer } from "../../components/ui/DrawerLayer";
import { useI18n } from "../../lib/i18n";
import type { Booking } from "../../types";

interface BookingDrawerProps {
  booking: Booking;
  currentUserId: string;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  cancelling: boolean;
}

export function BookingDrawer({
  booking,
  currentUserId,
  onClose,
  onEdit,
  onCancel,
  cancelling,
}: BookingDrawerProps) {
  const { dateLocale, t } = useI18n();

  return (
    <DrawerLayer labelledBy="booking-details-title" onClose={onClose}>
      {(close) => (
        <>
          <div className="drawer__header">
            <div>
              <span className="eyebrow drawer__event-type">
                <span
                  className={`event-dot${
                    booking.organizer.id === currentUserId
                      ? " event-dot--own"
                      : ""
                  }`}
                  aria-hidden="true"
                />
                <span>
                  {booking.seriesId ? `${t("calendar.seriesEvent")} · ` : ""}
                  {booking.participationMode === "OPEN"
                    ? t("calendar.openEvent")
                    : t("calendar.invitationEvent")}
                </span>
              </span>
              <h2 id="booking-details-title">{booking.title}</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => close()}
              aria-label={t("close")}
            >
              ×
            </button>
          </div>
          <div className="drawer-time">
            {new Intl.DateTimeFormat(dateLocale, {
              dateStyle: "full",
              timeStyle: "short",
            }).format(new Date(booking.startsAt))}
          </div>
          <hr />
          <span className="detail-label">{t("calendar.organizer")}</span>
          <div className="person-detail">
            <Avatar
              name={booking.organizer.name}
              preset={booking.organizer.avatarPreset}
              url={booking.organizer.avatarUrl}
              size="lg"
            />
            <div>
              <strong>{booking.organizer.name}</strong>
              <p>{booking.organizer.bio || t("calendar.colleagueFallback")}</p>
            </div>
          </div>
          {booking.participants.length > 0 && (
            <>
              <span className="detail-label">{t("calendar.participants")}</span>
              <div className="avatar-stack">
                {booking.participants.slice(0, 8).map((person) => (
                  <Avatar
                    key={person.id}
                    name={person.name}
                    preset={person.avatarPreset}
                    url={person.avatarUrl}
                    size="sm"
                  />
                ))}
                <span>{booking.participants.length}</span>
              </div>
            </>
          )}
          {booking.organizer.id === currentUserId && (
            <div className="drawer__actions">
              <button
                className="button button--primary button--wide"
                onClick={() => close(onEdit)}
              >
                {t("calendar.edit")}
              </button>
              <button
                className="button button--danger button--wide"
                onClick={() => close(onCancel)}
                disabled={cancelling}
              >
                {cancelling
                  ? t("calendar.cancelling")
                  : t("calendar.cancelBooking")}
              </button>
            </div>
          )}
        </>
      )}
    </DrawerLayer>
  );
}

import { useState } from "react";
import { ApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Button } from "./ui/Button";
import { ModalLayer } from "./ui/ModalLayer";

export interface CancelBookingDetails {
  title: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  seriesId?: string | null;
  participantCount?: number;
}

export function CancelBookingDialog({
  booking,
  pending,
  error,
  timeZone,
  onClose,
  onConfirm
}: {
  booking: CancelBookingDetails;
  pending: boolean;
  error: unknown;
  timeZone?: string;
  onClose: () => void;
  onConfirm: (scope: "OCCURRENCE" | "FUTURE") => void;
}) {
  const { dateLocale, t } = useI18n();
  const [scope, setScope] = useState<"OCCURRENCE" | "FUTURE">("OCCURRENCE");
  const startsAt = new Date(booking.startsAt);
  const endsAt = new Date(booking.endsAt);
  const date = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "full",
    timeZone
  }).format(startsAt);
  const time = new Intl.DateTimeFormat(dateLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone
  });

  return (
    <ModalLayer
      className="modal-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!pending) onClose();
      }}
    >
      <section
        className="modal modal--confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-booking-title"
        aria-describedby="cancel-booking-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <span className="eyebrow eyebrow--danger">
              {t("cancel.irreversible")}
            </span>
            <h2 id="cancel-booking-title">{t("cancel.title")}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("close")}
            disabled={pending}
          >
            ×
          </button>
        </div>

        <p id="cancel-booking-description">
          {t("cancel.description")}
        </p>

        <div className="cancel-summary">
          <strong>{booking.title}</strong>
          <dl>
            <div>
              <dt>{t("room")}</dt>
              <dd>{booking.roomName}</dd>
            </div>
            <div>
              <dt>{t("cancel.date")}</dt>
              <dd>{date}</dd>
            </div>
            <div>
              <dt>{t("cancel.time")}</dt>
              <dd>
                {time.format(startsAt)} — {time.format(endsAt)}
              </dd>
            </div>
            {typeof booking.participantCount === "number" &&
              booking.participantCount > 0 && (
                <div>
                  <dt>{t("calendar.participants")}</dt>
                  <dd>{booking.participantCount}</dd>
                </div>
              )}
          </dl>
        </div>

        {booking.seriesId && (
          <fieldset className="segmented-field cancel-scope">
            <legend>{t("cancel.scope")}</legend>
            <div className="segmented">
              <button
                type="button"
                className={scope === "OCCURRENCE" ? "is-active" : ""}
                onClick={() => setScope("OCCURRENCE")}
              >
                {t("cancel.occurrence")}
              </button>
              <button
                type="button"
                className={scope === "FUTURE" ? "is-active" : ""}
                onClick={() => setScope("FUTURE")}
              >
                {t("cancel.future")}
              </button>
            </div>
            <small>
              {t("cancel.scopeHint")}
            </small>
          </fieldset>
        )}

        {Boolean(error) && (
          <div className="form-error" role="alert">
            {error instanceof ApiError
              ? error.message
              : t("cancel.error")}
          </div>
        )}

        <div className="modal__actions">
          <Button
            onClick={onClose}
            disabled={pending}
            autoFocus
          >
            {t("cancel.keep")}
          </Button>
          <Button
            variant="danger"
            onClick={() => onConfirm(scope)}
            disabled={pending}
          >
            {pending ? t("calendar.cancelling") : t("cancel.confirm")}
          </Button>
        </div>
      </section>
    </ModalLayer>
  );
}

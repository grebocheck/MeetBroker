import { ApiError } from "../lib/api";

export interface CancelBookingDetails {
  title: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  participantCount?: number;
}

export function CancelBookingDialog({
  booking,
  pending,
  error,
  onClose,
  onConfirm
}: {
  booking: CancelBookingDetails;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const startsAt = new Date(booking.startsAt);
  const endsAt = new Date(booking.endsAt);
  const date = new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "full"
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <div
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
            <span className="eyebrow eyebrow--danger">Незворотна дія</span>
            <h2 id="cancel-booking-title">Скасувати бронювання?</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Закрити"
            disabled={pending}
          >
            ×
          </button>
        </div>

        <p id="cancel-booking-description">
          Час знову стане доступним для інших. Запрошені учасники отримають
          сповіщення про скасування.
        </p>

        <div className="cancel-summary">
          <strong>{booking.title}</strong>
          <dl>
            <div>
              <dt>Кімната</dt>
              <dd>{booking.roomName}</dd>
            </div>
            <div>
              <dt>Дата</dt>
              <dd>{date}</dd>
            </div>
            <div>
              <dt>Час</dt>
              <dd>
                {time.format(startsAt)} — {time.format(endsAt)}
              </dd>
            </div>
            {typeof booking.participantCount === "number" &&
              booking.participantCount > 0 && (
                <div>
                  <dt>Учасники</dt>
                  <dd>{booking.participantCount}</dd>
                </div>
              )}
          </dl>
        </div>

        {Boolean(error) && (
          <div className="form-error" role="alert">
            {error instanceof ApiError
              ? error.message
              : "Не вдалося скасувати бронювання"}
          </div>
        )}

        <div className="modal__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
            disabled={pending}
            autoFocus
          >
            Залишити бронювання
          </button>
          <button
            type="button"
            className="button button--danger"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Скасовуємо…" : "Так, скасувати"}
          </button>
        </div>
      </section>
    </div>
  );
}

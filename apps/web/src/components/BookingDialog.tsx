import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { toDateTimeLocal } from "../lib/date";
import type { Booking, Person, Room } from "../types";
import { ParticipantPicker } from "./ParticipantPicker";

export interface BookingDraft {
  startsAt: Date;
  endsAt: Date;
}

export function BookingDialog({
  room,
  draft,
  booking,
  onClose,
  onSaved
}: {
  room: Room;
  draft?: BookingDraft;
  booking?: Booking;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialStartsAt = booking
    ? new Date(booking.startsAt)
    : (draft?.startsAt ?? new Date());
  const initialEndsAt = booking
    ? new Date(booking.endsAt)
    : (draft?.endsAt ?? new Date(Date.now() + 3_600_000));
  const editing = Boolean(booking);
  const [title, setTitle] = useState(booking?.title ?? "");
  const [startsAt, setStartsAt] = useState(toDateTimeLocal(initialStartsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeLocal(initialEndsAt));
  const [mode, setMode] = useState<"INVITE_ONLY" | "OPEN">(
    booking?.participationMode ?? "INVITE_ONLY"
  );
  const [participantIds, setParticipantIds] = useState<string[]>(
    booking?.participants.map((participant) => participant.id) ?? []
  );
  const colleagues = useQuery({
    queryKey: ["colleagues"],
    queryFn: () => api<{ users: Person[] }>("/api/users/colleagues")
  });
  const availableSeats = Math.max(0, room.capacity - 1);
  const colleagueUsers = Array.isArray(colleagues.data?.users)
    ? colleagues.data.users
    : [];
  const selected = colleagueUsers.filter((user) =>
    participantIds.includes(user.id)
  );
  const save = useMutation({
    mutationFn: () =>
      api<void | { id: string }>(
        booking ? `/api/bookings/${booking.id}` : "/api/bookings",
        {
          method: booking ? "PATCH" : "POST",
          body: JSON.stringify({
            ...(booking ? {} : { roomId: room.id }),
            title,
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            participationMode: mode,
            participantIds
          })
        }
      ),
    onSuccess: onSaved
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <span className="eyebrow">{room.name}</span>
            <h2 id="booking-dialog-title">
              {editing ? "Редагувати бронювання" : "Нове бронювання"}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>
        <form className="form-stack" onSubmit={submit}>
          <label className="field">
            <span>Назва зустрічі</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={1}
              maxLength={100}
              placeholder="Наприклад, планування спринту"
              autoFocus
              required
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>Початок</span>
              <input
                type="datetime-local"
                step={1800}
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Завершення</span>
              <input
                type="datetime-local"
                step={1800}
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                required
              />
            </label>
          </div>
          <fieldset className="segmented-field">
            <legend>Хто може долучитися</legend>
            <div className="segmented">
              <button
                type="button"
                className={mode === "INVITE_ONLY" ? "is-active" : ""}
                onClick={() => setMode("INVITE_ONLY")}
              >
                За запрошенням
              </button>
              <button
                type="button"
                className={mode === "OPEN" ? "is-active" : ""}
                onClick={() => setMode("OPEN")}
              >
                Відкрита подія
              </button>
            </div>
          </fieldset>
          <div className="invite-field">
            <div className="field-heading">
              <span>Запросити колег</span>
              <small>
                {selected.length}/{availableSeats}
              </small>
            </div>
            {colleagues.isLoading ? (
              <div className="subtle-box">Завантажуємо колег…</div>
            ) : colleagues.isError ? (
              <div className="form-error" role="alert">
                Не вдалося завантажити список колег. Бронювання можна створити
                без запрошень.
              </div>
            ) : (
              <ParticipantPicker
                people={colleagueUsers}
                selectedIds={participantIds}
                maxSelected={availableSeats}
                onChange={setParticipantIds}
              />
            )}
          </div>
          {save.error && (
            <div className="form-error" role="alert">
              {save.error instanceof ApiError
                ? save.error.message
                : editing
                  ? "Не вдалося оновити бронювання"
                  : "Не вдалося створити бронювання"}
            </div>
          )}
          <div className="modal__actions">
            <button type="button" className="button button--ghost" onClick={onClose}>
              Назад
            </button>
            <button
              className="button button--primary"
              disabled={save.isPending}
            >
              {save.isPending
                ? editing
                  ? "Зберігаємо…"
                  : "Бронюємо…"
                : editing
                  ? "Зберегти зміни"
                  : "Забронювати"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { toDateTimeLocal } from "../lib/date";
import type { Person, Room } from "../types";
import { Avatar } from "./Avatar";

export interface BookingDraft {
  startsAt: Date;
  endsAt: Date;
}

export function BookingDialog({
  room,
  draft,
  onClose,
  onCreated
}: {
  room: Room;
  draft: BookingDraft;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(toDateTimeLocal(draft.startsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeLocal(draft.endsAt));
  const [mode, setMode] = useState<"INVITE_ONLY" | "OPEN">("INVITE_ONLY");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const colleagues = useQuery({
    queryKey: ["colleagues"],
    queryFn: () => api<{ users: Person[] }>("/api/users/colleagues")
  });
  const availableSeats = Math.max(0, room.capacity - 1);
  const selected = useMemo(
    () =>
      colleagues.data?.users.filter((user) =>
        participantIds.includes(user.id)
      ) ?? [],
    [colleagues.data, participantIds]
  );
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          roomId: room.id,
          title,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          participationMode: mode,
          participantIds
        })
      }),
    onSuccess: onCreated
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
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
            <h2 id="booking-dialog-title">Нове бронювання</h2>
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
            ) : (
              <div className="people-picker">
                {colleagues.data?.users.map((person) => {
                  const checked = participantIds.includes(person.id);
                  return (
                    <label
                      className={`person-option${checked ? " is-selected" : ""}`}
                      key={person.id}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && selected.length >= availableSeats}
                        onChange={() =>
                          setParticipantIds((current) =>
                            checked
                              ? current.filter((id) => id !== person.id)
                              : [...current, person.id]
                          )
                        }
                      />
                      <Avatar
                        name={person.name}
                        preset={person.avatarPreset}
                        url={person.avatarUrl}
                        size="sm"
                      />
                      <span>{person.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          {create.error && (
            <div className="form-error" role="alert">
              {create.error instanceof ApiError
                ? create.error.message
                : "Не вдалося створити бронювання"}
            </div>
          )}
          <div className="modal__actions">
            <button type="button" className="button button--ghost" onClick={onClose}>
              Назад
            </button>
            <button
              className="button button--primary"
              disabled={create.isPending}
            >
              {create.isPending ? "Бронюємо…" : "Забронювати"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

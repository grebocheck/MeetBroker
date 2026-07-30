import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { toDateTimeLocal } from "../lib/date";
import type { Booking, Person, Room } from "../types";
import { ParticipantPicker } from "./ParticipantPicker";
import { Button } from "./ui/Button";
import { ModalLayer } from "./ui/ModalLayer";

export interface BookingDraft {
  startsAt: Date;
  endsAt: Date;
}

type BookingErrorTarget =
  | "title"
  | "time"
  | "recurrence"
  | "participants"
  | "adminReason"
  | "form";

function bookingError(error: unknown): {
  target: BookingErrorTarget;
  message: string;
} | null {
  if (!(error instanceof ApiError)) return null;
  const errors: Record<string, { target: BookingErrorTarget; message: string }> = {
    INVALID_TIME: {
      target: "time",
      message: "Перевірте час початку та завершення."
    },
    SLOT_ALIGNMENT: {
      target: "time",
      message: "Час має відповідати 30-хвилинній сітці."
    },
    DURATION: {
      target: "time",
      message: "Тривалість зустрічі має бути від 30 хвилин до 4 годин."
    },
    PAST: {
      target: "time",
      message: "Бронювання має починатися в майбутньому."
    },
    OUTSIDE_WORKING_HOURS: {
      target: "time",
      message: "Оберіть час у межах робочих годин кімнати."
    },
    SLOT_TAKEN: {
      target: "time",
      message:
        typeof error.details === "object" &&
        error.details !== null &&
        "startsAt" in error.details
          ? `У серії вже зайнятий час ${new Intl.DateTimeFormat("uk-UA", {
              dateStyle: "medium",
              timeStyle: "short"
            }).format(new Date(String(error.details.startsAt)))}.`
          : "Цей час уже зайнятий. Оберіть інший інтервал."
    },
    ROOM_UNAVAILABLE: {
      target: "time",
      message:
        typeof error.details === "object" &&
        error.details !== null &&
        "startsAt" in error.details
          ? `Кімната недоступна для одного з повторень: ${new Intl.DateTimeFormat(
              "uk-UA",
              { dateStyle: "medium", timeStyle: "short" }
            ).format(new Date(String(error.details.startsAt)))}.`
          : "Кімната недоступна протягом вибраного часу."
    },
    ROOM_CAPACITY_EXCEEDED: {
      target: "participants",
      message: "Кількість учасників перевищує місткість кімнати."
    },
    INVALID_PARTICIPANT: {
      target: "participants",
      message: "Один або кілька учасників більше недоступні для запрошення."
    },
    BOOKING_CREATE_RESTRICTED: {
      target: "form",
      message: "Створення бронювань для вашого профілю тимчасово обмежене."
    },
    CAPABILITY_RESTRICTED: {
      target: "form",
      message:
        typeof error.details === "object" &&
        error.details !== null &&
        "reason" in error.details
          ? `Дію обмежено. Причина: ${String(error.details.reason)}`
          : "Ця дія тимчасово обмежена адміністратором."
    },
    RECURRENCE_END_REQUIRED: {
      target: "recurrence",
      message: "Вкажіть дату завершення серії."
    },
    RECURRENCE_WEEKDAYS_REQUIRED: {
      target: "recurrence",
      message: "Оберіть хоча б один день тижня."
    },
    INVALID_RECURRENCE_RANGE: {
      target: "recurrence",
      message: "Серія може тривати від одного дня до одного року."
    },
    EMPTY_RECURRENCE: {
      target: "recurrence",
      message: "Ці налаштування не створюють жодної події."
    },
    TOO_MANY_OCCURRENCES: {
      target: "recurrence",
      message: "Одна серія може містити не більше 100 подій."
    },
    ADMIN_EDIT_REASON_REQUIRED: {
      target: "adminReason",
      message: "Вкажіть змістовну причину адміністративної зміни."
    }
  };
  return (
    errors[error.code] ?? {
      target: "form",
      message: error.message
    }
  );
}

export function BookingDialog({
  room,
  draft,
  booking,
  administrative = false,
  onClose,
  onSaved
}: {
  room: Room;
  draft?: BookingDraft;
  booking?: Booking;
  administrative?: boolean;
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
  const defaultUntil = new Date(initialStartsAt);
  defaultUntil.setDate(defaultUntil.getDate() + 28);
  const [recurrence, setRecurrence] = useState<"NONE" | "DAILY" | "WEEKLY">(
    "NONE"
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceUntil, setRecurrenceUntil] = useState(
    toDateTimeLocal(defaultUntil).slice(0, 10)
  );
  const [weekdays, setWeekdays] = useState<number[]>([
    initialStartsAt.getDay()
  ]);
  const [adminReason, setAdminReason] = useState("");
  const [localError, setLocalError] = useState<{
    target: "title" | "time" | "recurrence" | "adminReason";
    message: string;
  } | null>(null);
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
      api<void | { id: string; seriesId: string | null; occurrenceCount: number }>(
        booking ? `/api/bookings/${booking.id}` : "/api/bookings",
        {
          method: booking ? "PATCH" : "POST",
          body: JSON.stringify({
            ...(booking ? {} : { roomId: room.id }),
            title: title.trim(),
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            participationMode: mode,
            participantIds,
            ...(!booking && recurrence !== "NONE"
              ? {
                  recurrence,
                  recurrenceInterval,
                  recurrenceUntil,
                  weekdays: recurrence === "WEEKLY" ? weekdays : undefined
                }
              : {}),
            ...(administrative ? { adminReason: adminReason.trim() } : {})
          })
        }
      ),
    onSuccess: onSaved
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setLocalError({
        target: "title",
        message: "Введіть назву зустрічі."
      });
      return;
    }
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start >= end
    ) {
      setLocalError({
        target: "time",
        message: "Завершення має бути пізніше за початок."
      });
      return;
    }
    if (administrative && adminReason.trim().length < 3) {
      setLocalError({
        target: "adminReason",
        message: "Вкажіть причину адміністративної зміни."
      });
      return;
    }
    if (!editing && recurrence !== "NONE") {
      if (!recurrenceUntil) {
        setLocalError({
          target: "recurrence",
          message: "Вкажіть дату завершення серії."
        });
        return;
      }
      if (recurrence === "WEEKLY" && weekdays.length === 0) {
        setLocalError({
          target: "recurrence",
          message: "Оберіть хоча б один день тижня."
        });
        return;
      }
    }
    setLocalError(null);
    save.mutate();
  };
  const serverError = bookingError(save.error);

  return (
    <ModalLayer role="presentation" onMouseDown={onClose}>
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
              {administrative
                ? "Адміністративна зміна"
                : editing
                  ? "Редагувати бронювання"
                  : "Нове бронювання"}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>
        <form className="form-stack" onSubmit={submit} noValidate>
          {administrative && (
            <label className="field">
              <span>Причина адміністративної зміни</span>
              <textarea
                value={adminReason}
                onChange={(event) => {
                  setAdminReason(event.target.value);
                  setLocalError(null);
                  save.reset();
                }}
                minLength={3}
                maxLength={300}
                placeholder="Що сталося і чому потрібно змінити чуже бронювання"
                autoFocus
                required
              />
              <small>
                Організатор і учасники побачать, що зміни зробив
                адміністратор, та отримають цю причину.
              </small>
              {(localError?.target === "adminReason" ||
                serverError?.target === "adminReason") && (
                <small className="field-error" role="alert">
                  {localError?.target === "adminReason"
                    ? localError.message
                    : serverError?.message}
                </small>
              )}
            </label>
          )}
          <label className="field">
            <span>Назва зустрічі</span>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setLocalError(null);
                save.reset();
              }}
              minLength={1}
              maxLength={100}
              placeholder="Наприклад, планування спринту"
              autoFocus={!administrative}
              required
            />
            {(localError?.target === "title" ||
              serverError?.target === "title") && (
              <small className="field-error" role="alert">
                {localError?.target === "title"
                  ? localError.message
                  : serverError?.message}
              </small>
            )}
          </label>
          <div className="time-fields">
            <div className="form-grid">
              <label className="field">
                <span>Початок</span>
                <input
                  type="datetime-local"
                  step={1800}
                  value={startsAt}
                  onChange={(event) => {
                    setStartsAt(event.target.value);
                    setLocalError(null);
                    save.reset();
                  }}
                  required
                />
              </label>
              <label className="field">
                <span>Завершення</span>
                <input
                  type="datetime-local"
                  step={1800}
                  value={endsAt}
                  onChange={(event) => {
                    setEndsAt(event.target.value);
                    setLocalError(null);
                    save.reset();
                  }}
                  required
                />
              </label>
            </div>
            {(localError?.target === "time" ||
              serverError?.target === "time") && (
              <small className="field-error" role="alert">
                {localError?.target === "time"
                  ? localError.message
                  : serverError?.message}
              </small>
            )}
          </div>
          {!editing && (
            <fieldset className="segmented-field recurrence-field">
              <legend>Повторення</legend>
              <div className="segmented">
                {[
                  ["NONE", "Не повторюється"],
                  ["DAILY", "Кожні N днів"],
                  ["WEEKLY", "За днями тижня"]
                ].map(([value, label]) => (
                  <button
                    type="button"
                    className={recurrence === value ? "is-active" : ""}
                    onClick={() => {
                      setRecurrence(value as typeof recurrence);
                      setLocalError(null);
                      save.reset();
                    }}
                    key={value}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {recurrence !== "NONE" && (
                <div className="recurrence-settings">
                  <label className="field">
                    <span>
                      {recurrence === "DAILY"
                        ? "Інтервал у днях"
                        : "Інтервал у тижнях"}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={recurrenceInterval}
                      onChange={(event) =>
                        setRecurrenceInterval(
                          Math.max(1, Math.min(30, Number(event.target.value)))
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Повторювати до</span>
                    <input
                      type="date"
                      value={recurrenceUntil}
                      min={startsAt.slice(0, 10)}
                      onChange={(event) => setRecurrenceUntil(event.target.value)}
                    />
                  </label>
                  {recurrence === "WEEKLY" && (
                    <div className="weekday-picker recurrence-weekdays">
                      {[
                        [1, "Пн"],
                        [2, "Вт"],
                        [3, "Ср"],
                        [4, "Чт"],
                        [5, "Пт"],
                        [6, "Сб"],
                        [0, "Нд"]
                      ].map(([day, label]) => (
                        <button
                          type="button"
                          className={
                            weekdays.includes(day as number) ? "is-active" : ""
                          }
                          onClick={() =>
                            setWeekdays((current) =>
                              current.includes(day as number)
                                ? current.filter((item) => item !== day)
                                : [...current, day as number]
                            )
                          }
                          key={day}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  <small>
                    Уся серія створюється атомарно: якщо хоча б один час
                    зайнятий, жодна подія не буде додана.
                  </small>
                </div>
              )}
              {(localError?.target === "recurrence" ||
                serverError?.target === "recurrence") && (
                <small className="field-error" role="alert">
                  {localError?.target === "recurrence"
                    ? localError.message
                    : serverError?.message}
                </small>
              )}
            </fieldset>
          )}
          {editing && booking?.seriesId && (
            <div className="subtle-box">
              Це подія із серії. Зміни застосуються лише до неї; інші події
              збережуть свій розклад.
            </div>
          )}
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
                onChange={(ids) => {
                  setParticipantIds(ids);
                  save.reset();
                }}
              />
            )}
            {serverError?.target === "participants" && (
              <small className="field-error" role="alert">
                {serverError.message}
              </small>
            )}
          </div>
          {save.error && (!serverError || serverError.target === "form") && (
            <div className="form-error" role="alert">
              {serverError?.message ??
                (editing
                  ? "Не вдалося оновити бронювання"
                  : "Не вдалося створити бронювання")}
            </div>
          )}
          <div className="modal__actions">
            <Button variant="ghost" onClick={onClose}>
              Назад
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={save.isPending}
            >
              {save.isPending
                ? editing
                  ? "Зберігаємо…"
                  : "Бронюємо…"
                : editing
                  ? "Зберегти зміни"
                  : recurrence === "NONE"
                    ? "Забронювати"
                    : "Створити серію"}
            </Button>
          </div>
        </form>
      </section>
    </ModalLayer>
  );
}

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { toDateTimeLocal } from "../lib/date";
import { useI18n, type Translator } from "../lib/i18n";
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

function bookingError(
  error: unknown,
  t: Translator,
  dateLocale: string,
): {
  target: BookingErrorTarget;
  message: string;
} | null {
  if (!(error instanceof ApiError)) return null;
  const errors: Record<string, { target: BookingErrorTarget; message: string }> = {
    INVALID_TIME: {
      target: "time",
      message: t("booking.invalidTime")
    },
    SLOT_ALIGNMENT: {
      target: "time",
      message: t("booking.slotAlignment")
    },
    DURATION: {
      target: "time",
      message: t("booking.duration")
    },
    PAST: {
      target: "time",
      message: t("booking.past")
    },
    OUTSIDE_WORKING_HOURS: {
      target: "time",
      message: t("booking.outsideHours")
    },
    OUTSIDE_WORKING_DAYS: {
      target: "time",
      message: t("booking.outsideDays")
    },
    SLOT_TAKEN: {
      target: "time",
      message:
        typeof error.details === "object" &&
        error.details !== null &&
        "startsAt" in error.details
          ? t("booking.seriesSlotTaken", {
              date: new Intl.DateTimeFormat(dateLocale, {
                dateStyle: "medium",
                timeStyle: "short"
              }).format(new Date(String(error.details.startsAt)))
            })
          : t("booking.slotTaken")
    },
    ROOM_UNAVAILABLE: {
      target: "time",
      message:
        typeof error.details === "object" &&
        error.details !== null &&
        "startsAt" in error.details
          ? t("booking.seriesRoomUnavailable", {
              date: new Intl.DateTimeFormat(dateLocale, {
                dateStyle: "medium",
                timeStyle: "short"
              }).format(new Date(String(error.details.startsAt)))
            })
          : t("booking.roomUnavailable")
    },
    ROOM_CAPACITY_EXCEEDED: {
      target: "participants",
      message: t("booking.capacityExceeded")
    },
    INVALID_PARTICIPANT: {
      target: "participants",
      message: t("booking.invalidParticipant")
    },
    BOOKING_CREATE_RESTRICTED: {
      target: "form",
      message: t("booking.createRestricted")
    },
    CAPABILITY_RESTRICTED: {
      target: "form",
      message:
        typeof error.details === "object" &&
        error.details !== null &&
        "reason" in error.details
          ? t("booking.actionRestrictedReason", {
              reason: String(error.details.reason)
            })
          : t("booking.actionRestricted")
    },
    RECURRENCE_END_REQUIRED: {
      target: "recurrence",
      message: t("booking.recurrenceEndRequired")
    },
    RECURRENCE_WEEKDAYS_REQUIRED: {
      target: "recurrence",
      message: t("booking.recurrenceWeekdaysRequired")
    },
    INVALID_RECURRENCE_RANGE: {
      target: "recurrence",
      message: t("booking.recurrenceRange")
    },
    EMPTY_RECURRENCE: {
      target: "recurrence",
      message: t("booking.recurrenceEmpty")
    },
    TOO_MANY_OCCURRENCES: {
      target: "recurrence",
      message: t("booking.recurrenceTooMany")
    },
    ADMIN_EDIT_REASON_REQUIRED: {
      target: "adminReason",
      message: t("booking.adminReasonRequired")
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
  const { dateLocale, t } = useI18n();
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
        message: t("booking.titleRequired")
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
        message: t("booking.endAfterStart")
      });
      return;
    }
    if (administrative && adminReason.trim().length < 3) {
      setLocalError({
        target: "adminReason",
        message: t("booking.adminReasonRequired")
      });
      return;
    }
    if (!editing && recurrence !== "NONE") {
      if (!recurrenceUntil) {
        setLocalError({
          target: "recurrence",
          message: t("booking.recurrenceEndRequired")
        });
        return;
      }
      if (recurrence === "WEEKLY" && weekdays.length === 0) {
        setLocalError({
          target: "recurrence",
          message: t("booking.recurrenceWeekdaysRequired")
        });
        return;
      }
    }
    setLocalError(null);
    save.mutate();
  };
  const serverError = bookingError(save.error, t, dateLocale);

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
                ? t("booking.adminTitle")
                : editing
                  ? t("booking.editTitle")
                  : t("booking.newTitle")}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("close")}
          >
            ×
          </button>
        </div>
        <form className="form-stack" onSubmit={submit} noValidate>
          {administrative && (
            <label className="field">
              <span>{t("booking.adminReason")}</span>
              <textarea
                value={adminReason}
                onChange={(event) => {
                  setAdminReason(event.target.value);
                  setLocalError(null);
                  save.reset();
                }}
                minLength={3}
                maxLength={300}
                placeholder={t("booking.adminReasonPlaceholder")}
                autoFocus
                required
              />
              <small>
                {t("booking.adminReasonHint")}
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
            <span>{t("booking.titleLabel")}</span>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setLocalError(null);
                save.reset();
              }}
              minLength={1}
              maxLength={100}
              placeholder={t("booking.titlePlaceholder")}
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
                <span>{t("booking.start")}</span>
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
                <span>{t("booking.end")}</span>
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
              <legend>{t("booking.recurrence")}</legend>
              <div className="segmented">
                {[
                  ["NONE", t("booking.noRecurrence")],
                  ["DAILY", t("booking.daily")],
                  ["WEEKLY", t("booking.weekly")]
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
                        ? t("booking.dayInterval")
                        : t("booking.weekInterval")}
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
                    <span>{t("booking.repeatUntil")}</span>
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
                        [1, t("weekday.1")],
                        [2, t("weekday.2")],
                        [3, t("weekday.3")],
                        [4, t("weekday.4")],
                        [5, t("weekday.5")],
                        [6, t("weekday.6")],
                        [0, t("weekday.0")]
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
                    {t("booking.atomicSeries")}
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
              {t("booking.seriesEditHint")}
            </div>
          )}
          <fieldset className="segmented-field">
            <legend>{t("booking.audience")}</legend>
            <div className="segmented">
              <button
                type="button"
                className={mode === "INVITE_ONLY" ? "is-active" : ""}
                onClick={() => setMode("INVITE_ONLY")}
              >
                {t("booking.inviteOnly")}
              </button>
              <button
                type="button"
                className={mode === "OPEN" ? "is-active" : ""}
                onClick={() => setMode("OPEN")}
              >
                {t("booking.open")}
              </button>
            </div>
          </fieldset>
          <div className="invite-field">
            <div className="field-heading">
              <span>{t("booking.inviteColleagues")}</span>
              <small>
                {selected.length}/{availableSeats}
              </small>
            </div>
            {colleagues.isLoading ? (
              <div className="subtle-box">
                {t("booking.loadingColleagues")}
              </div>
            ) : colleagues.isError ? (
              <div className="form-error" role="alert">
                {t("booking.colleaguesError")}
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
                  ? t("booking.updateError")
                  : t("booking.createError"))}
            </div>
          )}
          <div className="modal__actions">
            <Button variant="ghost" onClick={onClose}>
              {t("booking.back")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={save.isPending}
            >
              {save.isPending
                ? editing
                  ? t("booking.saving")
                  : t("booking.booking")
                : editing
                  ? t("booking.saveChanges")
                  : recurrence === "NONE"
                    ? t("book")
                    : t("booking.createSeries")}
            </Button>
          </div>
        </form>
      </section>
    </ModalLayer>
  );
}

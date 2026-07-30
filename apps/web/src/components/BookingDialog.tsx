import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { toDateTimeLocal } from "../lib/date";
import { useI18n } from "../lib/i18n";
import type { Booking, Person, Room } from "../types";
import { ParticipantPicker } from "./ParticipantPicker";
import { Button } from "./ui/Button";
import { ModalLayer } from "./ui/ModalLayer";
import { BookingImageField } from "./booking-dialog/BookingImageField";
import { bookingError } from "./booking-dialog/booking-error";
import {
  buildBookingPayload,
  nextHalfHour,
  validateBookingForm,
  type BookingErrorTarget,
  type BookingFormValues,
  type MeetingType,
  type ParticipationMode,
  type Recurrence,
} from "./booking-dialog/booking-dialog.model";
import {
  RecurrenceFields,
  type RecurrenceValues,
} from "./booking-dialog/RecurrenceFields";

export interface BookingDraft {
  startsAt: Date;
  endsAt: Date;
}

export function BookingDialog({
  room,
  draft,
  booking,
  administrative = false,
  onClose,
  onSaved,
}: {
  room?: Room;
  draft?: BookingDraft;
  booking?: Booking;
  administrative?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { dateLocale, t } = useI18n();
  const standaloneStart = nextHalfHour();
  const initialStartsAt = booking
    ? new Date(booking.startsAt)
    : (draft?.startsAt ?? standaloneStart);
  const initialEndsAt = booking
    ? new Date(booking.endsAt)
    : (draft?.endsAt ?? new Date(standaloneStart.getTime() + 3_600_000));
  const editing = Boolean(booking);
  const [meetingType, setMeetingType] = useState<MeetingType>(
    booking?.meetingType ?? (room ? "ROOM" : "ONLINE"),
  );
  const [meetingUrl, setMeetingUrl] = useState(booking?.meetingUrl ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [title, setTitle] = useState(booking?.title ?? "");
  const [startsAt, setStartsAt] = useState(toDateTimeLocal(initialStartsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeLocal(initialEndsAt));
  const [mode, setMode] = useState<ParticipationMode>(
    booking?.participationMode ?? "INVITE_ONLY",
  );
  const [participantIds, setParticipantIds] = useState<string[]>(
    booking?.participants.map((participant) => participant.id) ?? [],
  );
  const defaultUntil = new Date(initialStartsAt);
  defaultUntil.setDate(defaultUntil.getDate() + 28);
  const [recurrence, setRecurrence] = useState<Recurrence>("NONE");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceUntil, setRecurrenceUntil] = useState(
    toDateTimeLocal(defaultUntil).slice(0, 10),
  );
  const [weekdays, setWeekdays] = useState<number[]>([
    initialStartsAt.getDay(),
  ]);
  const [adminReason, setAdminReason] = useState("");
  const [localError, setLocalError] = useState<{
    target: BookingErrorTarget;
    message: string;
  } | null>(null);
  const colleagues = useQuery({
    queryKey: ["colleagues"],
    queryFn: () => api<{ users: Person[] }>("/api/users/colleagues"),
  });
  const availableSeats =
    meetingType === "ONLINE" ? 50 : Math.max(0, (room?.capacity ?? 1) - 1);
  const colleagueUsers = Array.isArray(colleagues.data?.users)
    ? colleagues.data.users
    : [];
  const selected = colleagueUsers.filter((user) =>
    participantIds.includes(user.id),
  );
  const imagePreview = useMemo(
    () =>
      imageFile
        ? URL.createObjectURL(imageFile)
        : removeExistingImage
          ? null
          : (booking?.imageUrl ?? null),
    [booking?.imageUrl, imageFile, removeExistingImage],
  );
  useEffect(
    () => () => {
      if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview);
    },
    [imageFile, imagePreview],
  );
  const formValues: BookingFormValues = {
    meetingType,
    meetingUrl,
    title,
    startsAt,
    endsAt,
    participationMode: mode,
    participantIds,
    recurrence,
    recurrenceInterval,
    recurrenceUntil,
    weekdays,
    adminReason,
  };
  const recurrenceValues: RecurrenceValues = {
    recurrence,
    recurrenceInterval,
    recurrenceUntil,
    weekdays,
  };
  const clearErrors = () => {
    setLocalError(null);
    save.reset();
  };
  const save = useMutation({
    mutationFn: async () => {
      const targetId = booking?.id ?? createdBookingId;
      const updating = Boolean(targetId);
      const result = await api<void | {
        id: string;
        seriesId: string | null;
        occurrenceCount: number;
      }>(targetId ? `/api/bookings/${targetId}` : "/api/bookings", {
        method: updating ? "PATCH" : "POST",
        body: JSON.stringify(
          buildBookingPayload(formValues, {
            editing: updating,
            administrative,
            roomId: room?.id,
          }),
        ),
      });
      const bookingId = targetId ?? result?.id;
      if (!targetId && result?.id) setCreatedBookingId(result.id);
      if (bookingId && imageFile) {
        const form = new FormData();
        form.append("image", imageFile);
        await api<{ imageUrl: string }>(`/api/bookings/${bookingId}/image`, {
          method: "POST",
          body: form,
        });
      } else if (bookingId && booking?.imageUrl && removeExistingImage) {
        await api<void>(`/api/bookings/${bookingId}/image`, {
          method: "DELETE",
        });
      }
      return result;
    },
    onSuccess: onSaved,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const issue = validateBookingForm(formValues, {
      editing,
      administrative,
    });
    if (issue) {
      setLocalError({ target: issue.target, message: t(issue.key) });
      return;
    }
    setLocalError(null);
    save.mutate();
  };
  const serverError = bookingError(save.error, t, dateLocale);

  return (
    <ModalLayer role="presentation" onDismiss={onClose} onMouseDown={onClose}>
      <section
        className="modal booking-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <span className="eyebrow">
              {meetingType === "ONLINE"
                ? t("booking.onlineMeeting")
                : (room?.name ?? t("booking.roomMeeting"))}
            </span>
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
          {!editing && room && (
            <fieldset className="segmented-field">
              <legend>{t("booking.format")}</legend>
              <div className="segmented">
                <button
                  type="button"
                  className={meetingType === "ROOM" ? "is-active" : ""}
                  onClick={() => setMeetingType("ROOM")}
                >
                  {t("booking.roomMeeting")}
                </button>
                <button
                  type="button"
                  className={meetingType === "ONLINE" ? "is-active" : ""}
                  onClick={() => setMeetingType("ONLINE")}
                >
                  {t("booking.onlineMeeting")}
                </button>
              </div>
            </fieldset>
          )}
          {meetingType === "ONLINE" && (
            <label className="field">
              <span>{t("booking.meetingUrl")}</span>
              <input
                type="url"
                value={meetingUrl}
                onChange={(event) => {
                  setMeetingUrl(event.target.value);
                  setLocalError(null);
                  save.reset();
                }}
                placeholder="https://meet.example.com/..."
                autoComplete="url"
                required
              />
              <small>{t("booking.meetingUrlHint")}</small>
              {(localError?.target === "meetingUrl" ||
                serverError?.target === "meetingUrl") && (
                <small className="field-error" role="alert">
                  {localError?.target === "meetingUrl"
                    ? localError.message
                    : serverError?.message}
                </small>
              )}
            </label>
          )}
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
              <small>{t("booking.adminReasonHint")}</small>
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
            <RecurrenceFields
              values={recurrenceValues}
              minDate={startsAt.slice(0, 10)}
              error={
                localError?.target === "recurrence"
                  ? localError.message
                  : serverError?.target === "recurrence"
                    ? serverError.message
                    : undefined
              }
              onChange={(change) => {
                if (change.recurrence !== undefined) {
                  setRecurrence(change.recurrence);
                }
                if (change.recurrenceInterval !== undefined) {
                  setRecurrenceInterval(change.recurrenceInterval);
                }
                if (change.recurrenceUntil !== undefined) {
                  setRecurrenceUntil(change.recurrenceUntil);
                }
                if (change.weekdays !== undefined) {
                  setWeekdays(change.weekdays);
                }
                clearErrors();
              }}
            />
          )}
          {editing && booking?.seriesId && (
            <div className="subtle-box">{t("booking.seriesEditHint")}</div>
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
          <BookingImageField
            preview={imagePreview}
            error={
              localError?.target === "image"
                ? localError.message
                : serverError?.target === "image"
                  ? serverError.message
                  : undefined
            }
            onChange={(file) => {
              setImageFile(file);
              setRemoveExistingImage(false);
              clearErrors();
            }}
            onInvalid={() =>
              setLocalError({
                target: "image",
                message: t("booking.imageInvalid"),
              })
            }
            onRemove={() => {
              setImageFile(null);
              setRemoveExistingImage(Boolean(booking?.imageUrl));
              clearErrors();
            }}
          />
          <div className="invite-field">
            <div className="field-heading">
              <span>{t("booking.inviteColleagues")}</span>
              <small>
                {selected.length}/{availableSeats}
              </small>
            </div>
            {colleagues.isLoading ? (
              <div className="subtle-box">{t("booking.loadingColleagues")}</div>
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
                (editing ? t("booking.updateError") : t("booking.createError"))}
            </div>
          )}
          <div className="modal__actions">
            <Button variant="ghost" onClick={onClose}>
              {t("booking.back")}
            </Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
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

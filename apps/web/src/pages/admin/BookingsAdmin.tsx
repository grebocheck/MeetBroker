import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "../../components/Avatar";
import { BookingDialog } from "../../components/BookingDialog";
import { Button } from "../../components/ui/Button";
import { ModalLayer } from "../../components/ui/ModalLayer";
import { Pagination } from "../../components/ui/Pagination";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/error-message";
import { useI18n } from "../../lib/i18n";
import type { Booking, Room } from "../../types";

interface AdminBookingPerson {
  id: string;
  name: string;
  email: string;
  avatarPreset: string;
  avatarUrl: string | null;
}

interface AdminBooking {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  meetingType: "ROOM" | "ONLINE";
  meetingUrl: string | null;
  imageUrl: string | null;
  participationMode: "INVITE_ONLY" | "OPEN";
  seriesId: string | null;
  overrideReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancelledByName: string | null;
  room: {
    id: string;
    name: string;
    floor: number;
  } | null;
  organizer: AdminBookingPerson;
  participants: (AdminBookingPerson & {
    status: "INVITED" | "ACCEPTED" | "DECLINED";
  })[];
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export function BookingsAdmin() {
  const { dateLocale, t } = useI18n();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("upcoming");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminBooking | null>(null);
  const [editing, setEditing] = useState<AdminBooking | null>(null);
  const [reason, setReason] = useState("");
  const query = new URLSearchParams({ status });
  if (search) query.set("search", search);
  query.set("page", String(page));
  query.set("limit", "15");
  const bookings = useQuery({
    queryKey: ["admin-bookings", status, search, page],
    queryFn: () =>
      api<{ bookings: AdminBooking[]; pagination: PaginationMeta }>(
        `/api/admin/bookings?${query.toString()}`,
      ),
    placeholderData: (previousData) => previousData,
  });
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/api/rooms"),
  });
  const cancelBooking = useMutation({
    mutationFn: ({
      id,
      cancellationReason,
    }: {
      id: string;
      cancellationReason: string;
    }) =>
      api<void>(`/api/bookings/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason: cancellationReason }),
      }),
    onSuccess: async () => {
      setSelected(null);
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["schedule"] }),
        queryClient.invalidateQueries({ queryKey: ["bookings-mine"] }),
        queryClient.invalidateQueries({ queryKey: ["audit"] }),
      ]);
    },
  });

  return (
    <>
      <section className="admin-card">
        <div className="admin-card__toolbar admin-booking-toolbar">
          <div className="segmented">
            {[
              ["upcoming", t("admin.upcoming")],
              ["past", t("admin.past")],
              ["cancelled", t("admin.cancelled")],
              ["", t("admin.all")],
            ].map(([value, label]) => (
              <button
                key={value}
                className={status === value ? "is-active" : ""}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            className="admin-booking-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
          >
            <label className="field">
              <span className="sr-only">{t("admin.searchBookings")}</span>
              <input
                type="search"
                placeholder={t("admin.bookingSearchPlaceholder")}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </label>
            <Button type="submit" size="small">
              {t("admin.search")}
            </Button>
          </form>
          <span className="result-count">
            {t("admin.bookingCount", {
              count: bookings.data?.pagination.total ?? 0,
            })}
          </span>
        </div>

        {bookings.isLoading ? (
          <div className="subtle-box">{t("admin.loadingBookings")}</div>
        ) : bookings.error ? (
          <div className="form-error">
            {errorMessage(bookings.error, t, "admin.bookingsLoadError")}
          </div>
        ) : bookings.data?.bookings.length === 0 ? (
          <div className="empty-inline">{t("admin.bookingsEmpty")}</div>
        ) : (
          <>
            <div className="admin-booking-list">
              {bookings.data?.bookings.map((booking) => {
                const startsAt = new Date(booking.startsAt);
                const endsAt = new Date(booking.endsAt);
                const isPast = endsAt <= new Date();
                return (
                  <article className="admin-booking-row" key={booking.id}>
                    <time dateTime={booking.startsAt}>
                      <strong>
                        {new Intl.DateTimeFormat(dateLocale, {
                          day: "2-digit",
                          month: "short",
                        }).format(startsAt)}
                      </strong>
                      <span>
                        {new Intl.DateTimeFormat(dateLocale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(startsAt)}
                        {" — "}
                        {new Intl.DateTimeFormat(dateLocale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(endsAt)}
                      </span>
                    </time>
                    <div className="admin-booking-row__main">
                      <div className="admin-booking-row__title">
                        <strong>{booking.title}</strong>
                        <span
                          className={`status-badge ${
                            booking.cancelledAt ? "status-badge--warning" : ""
                          }`}
                        >
                          {booking.cancelledAt
                            ? t("admin.statusCancelled")
                            : isPast
                              ? t("admin.statusFinished")
                              : booking.seriesId
                                ? t("admin.statusSeries")
                                : booking.participationMode === "OPEN"
                                  ? t("admin.statusOpen")
                                  : t("admin.statusInvitation")}
                        </span>
                      </div>
                      <span>
                        {t("admin.bookingMeta", {
                          room:
                            booking.room?.name ?? t("booking.onlineMeeting"),
                          floor: booking.room?.floor ?? "—",
                          organizer: booking.organizer.name,
                          count: booking.participants.length,
                        })}
                      </span>
                    </div>
                    <Button
                      size="small"
                      onClick={() => {
                        cancelBooking.reset();
                        setReason("");
                        setSelected(booking);
                      }}
                    >
                      {t("admin.details")}
                    </Button>
                  </article>
                );
              })}
            </div>
            {bookings.data && (
              <Pagination
                page={bookings.data.pagination.page}
                totalPages={bookings.data.pagination.totalPages}
                total={bookings.data.pagination.total}
                itemLabel={t("admin.bookingItems")}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </section>

      {selected && (
        <AdminBookingDialog
          booking={selected}
          reason={reason}
          onReasonChange={setReason}
          pending={cancelBooking.isPending}
          error={cancelBooking.error}
          onClose={() => {
            if (!cancelBooking.isPending) {
              setSelected(null);
              setReason("");
              cancelBooking.reset();
            }
          }}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
          onCancel={() =>
            cancelBooking.mutate({
              id: selected.id,
              cancellationReason: reason.trim(),
            })
          }
        />
      )}
      {editing &&
        (editing.meetingType === "ONLINE" ||
          rooms.data?.rooms.find((room) => room.id === editing.room?.id)) && (
          <BookingDialog
            room={rooms.data?.rooms.find(
              (room) => room.id === editing.room?.id,
            )}
            booking={
              {
                id: editing.id,
                title: editing.title,
                startsAt: editing.startsAt,
                endsAt: editing.endsAt,
                meetingType: editing.meetingType,
                meetingUrl: editing.meetingUrl,
                imageUrl: editing.imageUrl,
                room: editing.room,
                participationMode: editing.participationMode,
                seriesId: editing.seriesId,
                organizer: editing.organizer,
                participants: editing.participants,
              } satisfies Booking
            }
            administrative
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: ["admin-bookings"],
                }),
                queryClient.invalidateQueries({ queryKey: ["schedule"] }),
                queryClient.invalidateQueries({ queryKey: ["bookings-mine"] }),
                queryClient.invalidateQueries({ queryKey: ["audit"] }),
              ]);
            }}
          />
        )}
    </>
  );
}

function AdminBookingDialog({
  booking,
  reason,
  onReasonChange,
  pending,
  error,
  onClose,
  onEdit,
  onCancel,
}: {
  booking: AdminBooking;
  reason: string;
  onReasonChange: (value: string) => void;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { dateLocale, t } = useI18n();
  const startsAt = new Date(booking.startsAt);
  const endsAt = new Date(booking.endsAt);
  const canCancel = !booking.cancelledAt && endsAt > new Date();
  const date = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "full",
  }).format(startsAt);
  const time = new Intl.DateTimeFormat(dateLocale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const statusLabels = {
    INVITED: t("admin.participantInvited"),
    ACCEPTED: t("admin.participantAccepted"),
    DECLINED: t("admin.participantDeclined"),
  };

  return (
    <ModalLayer
      className="modal-backdrop"
      role="presentation"
      onDismiss={() => {
        if (!pending) onClose();
      }}
      onMouseDown={() => {
        if (!pending) onClose();
      }}
    >
      <section
        className={`modal admin-booking-modal ${
          canCancel ? "modal--confirm" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-booking-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <span className={`eyebrow ${canCancel ? "eyebrow--danger" : ""}`}>
              {canCancel
                ? t("admin.administrativeAction")
                : t("admin.bookingDetails")}
            </span>
            <h2 id="admin-booking-title">{booking.title}</h2>
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

        <div className="cancel-summary">
          <dl>
            <div>
              <dt>{t("room")}</dt>
              <dd>{booking.room?.name ?? t("booking.onlineMeeting")}</dd>
            </div>
            <div>
              <dt>{t("admin.format")}</dt>
              <dd>
                {booking.participationMode === "OPEN"
                  ? t("admin.statusOpen")
                  : t("admin.inviteOnly")}
              </dd>
            </div>
            <div>
              <dt>{t("admin.date")}</dt>
              <dd>{date}</dd>
            </div>
            <div>
              <dt>{t("admin.time")}</dt>
              <dd>
                {time.format(startsAt)} — {time.format(endsAt)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="admin-booking-organizer">
          <Avatar
            name={booking.organizer.name}
            preset={booking.organizer.avatarPreset}
            url={booking.organizer.avatarUrl}
          />
          <div>
            <span>{t("admin.organizer")}</span>
            <strong>{booking.organizer.name}</strong>
            <small>{booking.organizer.email}</small>
          </div>
        </div>

        <div className="admin-booking-participants">
          <strong>
            {t("admin.participantsCount", {
              count: booking.participants.length,
            })}
          </strong>
          {booking.participants.length === 0 ? (
            <span>{t("admin.noParticipants")}</span>
          ) : (
            booking.participants.map((participant) => (
              <div key={participant.id}>
                <Avatar
                  name={participant.name}
                  preset={participant.avatarPreset}
                  url={participant.avatarUrl}
                />
                <span>{participant.name}</span>
                <small>{statusLabels[participant.status]}</small>
              </div>
            ))
          )}
        </div>

        {booking.overrideReason && (
          <div className="subtle-box">
            <strong>{t("admin.overrideReason")}:</strong>{" "}
            {booking.overrideReason}
          </div>
        )}

        {booking.cancelledAt && (
          <div className="subtle-box">
            <strong>{t("admin.cancelledAt")}:</strong>{" "}
            {new Intl.DateTimeFormat(dateLocale, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(booking.cancelledAt))}
            {booking.cancelledByName ? ` · ${booking.cancelledByName}` : ""}
            {booking.cancellationReason
              ? ` · ${t("admin.reason")}: ${booking.cancellationReason}`
              : ""}
          </div>
        )}

        {canCancel && (
          <label className="field">
            <span>{t("admin.forcedCancellationReason")}</span>
            <textarea
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              maxLength={300}
              placeholder={t("admin.cancellationPlaceholder")}
              required
            />
            <small>{t("admin.cancellationHint")}</small>
          </label>
        )}

        {Boolean(error) && (
          <div className="form-error" role="alert">
            {errorMessage(error, t, "admin.cancelBookingError")}
          </div>
        )}

        <div className="modal__actions">
          <Button onClick={onClose} disabled={pending}>
            {t("close")}
          </Button>
          {canCancel && (
            <Button onClick={onEdit} disabled={pending}>
              {t("admin.editEvent")}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="danger"
              onClick={onCancel}
              disabled={pending || reason.trim().length < 3}
            >
              {pending ? t("admin.cancelling") : t("admin.cancelBooking")}
            </Button>
          )}
        </div>
      </section>
    </ModalLayer>
  );
}

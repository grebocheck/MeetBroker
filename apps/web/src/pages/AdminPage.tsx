import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { errorMessage } from "../lib/error-message";
import type { Booking, Room } from "../types";
import { Avatar } from "../components/Avatar";
import { BookingDialog } from "../components/BookingDialog";
import { RoomVisual } from "../components/RoomVisual";
import { Button } from "../components/ui/Button";
import { ModalLayer } from "../components/ui/ModalLayer";
import { Pagination } from "../components/ui/Pagination";
import { useI18n } from "../lib/i18n";
import {
  formatActivityValue,
  formatRoomBlockRule,
  humanizeAction,
  humanizeDetailKey,
  humanizeTarget,
  type AdminRoomBlock,
} from "./admin/admin-formatters";
import { UsersAdmin } from "./admin/UsersAdmin";

interface AuditLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
}

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

export function AdminPage() {
  const { t } = useI18n();
  const [section, setSection] = useState<
    "users" | "bookings" | "rooms" | "audit"
  >("users");
  const sections = [
    ["users", "01", t("admin.users")],
    ["bookings", "02", t("admin.bookings")],
    ["rooms", "03", t("admin.rooms")],
    ["audit", "04", t("admin.audit")],
  ] as const;
  const activeSection = sections.find(([value]) => value === section);

  return (
    <div
      className="page editorial-page admin-page"
      data-page-mark={t("marks.control")}
    >
      <header className="page-header admin-hero">
        <div>
          <span className="eyebrow">{t("admin.eyebrow")}</span>
          <h1>{t("administration")}</h1>
          <p>{t("admin.subtitle")}</p>
        </div>
        <div className="admin-hero__status" aria-hidden="true">
          <span>{t("marks.control")}</span>
          <strong>{t("shell.admin")} · 04</strong>
        </div>
      </header>
      <nav className="admin-section-tabs" aria-label={t("administration")}>
        {sections.map(([value, index, label]) => (
          <button
            className={section === value ? "is-active" : ""}
            onClick={() => setSection(value)}
            aria-current={section === value ? "page" : undefined}
            key={value}
          >
            <span>{index}</span>
            <strong>{label}</strong>
          </button>
        ))}
      </nav>
      <div className={`admin-workspace admin-workspace--${section}`}>
        <div className="admin-workspace__caption" aria-hidden="true">
          <span>{t("stage.admin")}</span>
          <strong>
            {activeSection?.[1]} · {activeSection?.[2]}
          </strong>
        </div>
        <div className="admin-workspace__content">
          {section === "users" && <UsersAdmin />}
          {section === "bookings" && <BookingsAdmin />}
          {section === "rooms" && <RoomsAdmin />}
          {section === "audit" && <AuditAdmin />}
        </div>
      </div>
    </div>
  );
}

function BookingsAdmin() {
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

function RoomsAdmin() {
  const { dateLocale, t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [editor, setEditor] = useState<"room" | "block" | null>(null);
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/api/rooms"),
  });
  const blocks = useQuery({
    queryKey: ["admin-room-blocks"],
    queryFn: () => api<{ blocks: AdminRoomBlock[] }>("/api/admin/room-blocks"),
  });
  const [roomForm, setRoomForm] = useState({
    name: "",
    floor: 1,
    capacity: 6,
    workStart: "09:00",
    workEnd: "19:00",
    workingDays: [1, 2, 3, 4, 5] as number[],
  });
  const [roomImage, setRoomImage] = useState<File | null>(null);
  const [blockForm, setBlockForm] = useState({
    roomId: "",
    title: t("admin.maintenance"),
    privateNote: "",
    startsAt: "",
    endsAt: "",
    recurrence: "NONE" as "NONE" | "DAILY" | "WEEKLY",
    recurrenceInterval: 1,
    weekdays: [] as number[],
    recurrenceUntil: "",
  });
  const createRoom = useMutation({
    mutationFn: async () => {
      const created = await api<{ id: string }>("/api/admin/rooms", {
        method: "POST",
        body: JSON.stringify(roomForm),
      });
      if (roomImage) {
        const form = new FormData();
        form.set("image", roomImage);
        await api<{ imageUrl: string }>(
          `/api/admin/rooms/${created.id}/image`,
          { method: "POST", body: form },
        );
      }
      return created;
    },
    onSuccess: (created) => {
      setRoomForm({
        name: "",
        floor: 1,
        capacity: 6,
        workStart: "09:00",
        workEnd: "19:00",
        workingDays: [1, 2, 3, 4, 5],
      });
      setRoomImage(null);
      setSelectedRoomId(created.id);
      setEditor(null);
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
  const uploadRoomImage = useMutation({
    mutationFn: ({ roomId, file }: { roomId: string; file: File }) => {
      const form = new FormData();
      form.set("image", file);
      return api<{ imageUrl: string }>(`/api/admin/rooms/${roomId}/image`, {
        method: "POST",
        body: form,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
  const removeRoomImage = useMutation({
    mutationFn: (roomId: string) =>
      api<void>(`/api/admin/rooms/${roomId}/image`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
  const createBlock = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/admin/room-blocks", {
        method: "POST",
        body: JSON.stringify({
          ...blockForm,
          startsAt: new Date(blockForm.startsAt).toISOString(),
          endsAt: new Date(blockForm.endsAt).toISOString(),
          recurrenceUntil:
            blockForm.recurrence === "NONE"
              ? undefined
              : blockForm.recurrenceUntil,
          weekdays:
            blockForm.recurrence === "WEEKLY" ? blockForm.weekdays : undefined,
        }),
      }),
    onSuccess: () => {
      setBlockForm({
        ...blockForm,
        startsAt: "",
        endsAt: "",
        recurrence: "NONE",
        recurrenceInterval: 1,
        weekdays: [],
        recurrenceUntil: "",
      });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["admin-room-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      setEditor(null);
    },
  });
  const cancelBlock = useMutation({
    mutationFn: (block: AdminRoomBlock) =>
      api<void>(
        `/api/admin/room-blocks/${block.id}?scope=${
          block.kind === "SERIES" ? "series" : "once"
        }`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["admin-room-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const roomList = rooms.data?.rooms ?? [];
  const selectedRoom =
    roomList.find((room) => room.id === selectedRoomId) ?? roomList[0] ?? null;
  const selectedBlocks =
    blocks.data?.blocks.filter((block) => block.roomId === selectedRoom?.id) ??
    [];

  return (
    <div className="room-management">
      <div className="room-management__bar">
        <div>
          <span className="eyebrow">{t("admin.companySpaces")}</span>
          <h2>{t("admin.meetingRooms")}</h2>
          <p>{t("admin.roomsSummary", { count: roomList.length })}</p>
        </div>
        <Button
          size="small"
          onClick={() => setEditor(editor === "room" ? null : "room")}
        >
          {editor === "room"
            ? t("admin.closeForm")
            : t("admin.addRoomWithPlus")}
        </Button>
      </div>

      <div className="room-management__workspace">
        <aside
          className="admin-card room-catalog"
          aria-label={t("admin.meetingRooms")}
        >
          <div className="room-catalog__heading">
            <strong>{t("admin.allRooms")}</strong>
            <span>{roomList.length}</span>
          </div>
          <div className="room-catalog__list">
            {roomList.map((room) => {
              const roomBlockCount =
                blocks.data?.blocks.filter((block) => block.roomId === room.id)
                  .length ?? 0;
              return (
                <button
                  type="button"
                  className={`room-catalog__item ${
                    selectedRoom?.id === room.id ? "is-active" : ""
                  }`}
                  key={room.id}
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setBlockForm({ ...blockForm, roomId: room.id });
                    setEditor(null);
                  }}
                >
                  <RoomVisual room={room} size="compact" />
                  <span className="room-catalog__copy">
                    <strong>{room.name}</strong>
                    <small>
                      {t("admin.roomMeta", {
                        floor: room.floor,
                        capacity: room.capacity,
                      })}
                    </small>
                  </span>
                  <span className="room-catalog__meta">
                    {roomBlockCount > 0 && <em>{roomBlockCount}</em>}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="admin-card room-workspace">
          {editor === "room" ? (
            <form
              className="form-stack room-workspace__form"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                createRoom.mutate();
              }}
            >
              <div className="room-workspace__form-heading">
                <div>
                  <span className="eyebrow">{t("admin.newSpace")}</span>
                  <h2>{t("admin.addRoom")}</h2>
                </div>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => setEditor(null)}
                >
                  {t("cancel")}
                </Button>
              </div>
              <label className="field">
                <span>{t("admin.name")}</span>
                <input
                  value={roomForm.name}
                  onChange={(event) =>
                    setRoomForm({ ...roomForm, name: event.target.value })
                  }
                  required
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>{t("admin.floor")}</span>
                  <input
                    type="number"
                    min={0}
                    value={roomForm.floor}
                    onChange={(event) =>
                      setRoomForm({
                        ...roomForm,
                        floor: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>{t("admin.capacity")}</span>
                  <input
                    type="number"
                    min={1}
                    value={roomForm.capacity}
                    onChange={(event) =>
                      setRoomForm({
                        ...roomForm,
                        capacity: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <WorkingDayPicker
                days={roomForm.workingDays}
                onChange={(workingDays) =>
                  setRoomForm({ ...roomForm, workingDays })
                }
              />
              <div className="form-grid">
                <label className="field">
                  <span>{t("admin.opensAt")}</span>
                  <input
                    type="time"
                    step={1800}
                    value={roomForm.workStart}
                    onChange={(event) =>
                      setRoomForm({
                        ...roomForm,
                        workStart: event.target.value,
                      })
                    }
                    required
                  />
                </label>
                <label className="field">
                  <span>{t("admin.closesAt")}</span>
                  <input
                    type="time"
                    step={1800}
                    value={roomForm.workEnd}
                    onChange={(event) =>
                      setRoomForm({ ...roomForm, workEnd: event.target.value })
                    }
                    required
                  />
                </label>
              </div>
              <label className="upload-box">
                <span>
                  <strong>{t("admin.roomPhoto")}</strong>
                  <small>{t("admin.roomPhotoHint")}</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setRoomImage(event.target.files?.[0] ?? null)
                  }
                />
                <em>{roomImage ? roomImage.name : t("admin.chooseFile")}</em>
              </label>
              {createRoom.error && (
                <div className="form-error">
                  {errorMessage(createRoom.error, t, "admin.addRoomError")}
                </div>
              )}
              <Button
                type="submit"
                disabled={
                  createRoom.isPending || roomForm.workingDays.length === 0
                }
              >
                {createRoom.isPending ? t("admin.adding") : t("admin.addRoom")}
              </Button>
            </form>
          ) : selectedRoom ? (
            <>
              <header className="room-workspace__hero">
                <RoomVisual room={selectedRoom} />
                <div>
                  <span className="eyebrow">{t("admin.selectedRoom")}</span>
                  <h2>{selectedRoom.name}</h2>
                  <p>
                    {t("admin.roomMeta", {
                      floor: selectedRoom.floor,
                      capacity: selectedRoom.capacity,
                    })}
                  </p>
                </div>
                <div className="room-image-actions">
                  <label className="button button--secondary button--slanted button--small room-image-action">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file)
                          uploadRoomImage.mutate({
                            roomId: selectedRoom.id,
                            file,
                          });
                        event.target.value = "";
                      }}
                    />
                    <span>
                      {uploadRoomImage.isPending
                        ? t("admin.processing")
                        : selectedRoom.imageUrl
                          ? t("admin.replacePhoto")
                          : t("admin.addPhoto")}
                    </span>
                  </label>
                  {selectedRoom.imageUrl && (
                    <Button
                      variant="ghost"
                      size="small"
                      disabled={removeRoomImage.isPending}
                      onClick={() => removeRoomImage.mutate(selectedRoom.id)}
                    >
                      {t("admin.remove")}
                    </Button>
                  )}
                </div>
              </header>

              {(uploadRoomImage.error || removeRoomImage.error) && (
                <div className="form-error">
                  {errorMessage(
                    uploadRoomImage.error ?? removeRoomImage.error,
                    t,
                    "admin.photoError",
                  )}
                </div>
              )}

              <div className="room-workspace__settings">
                <div>
                  <span className="eyebrow">{t("admin.availability")}</span>
                  <h3>{t("admin.workingHours")}</h3>
                  <p>{t("admin.workingHoursHint")}</p>
                </div>
                <RoomHoursEditor room={selectedRoom} />
              </div>

              <div className="room-workspace__blocks">
                <div className="room-workspace__section-heading">
                  <div>
                    <span className="eyebrow">
                      {t("admin.scheduleExceptions")}
                    </span>
                    <h3>{t("admin.unavailability")}</h3>
                  </div>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => {
                      setBlockForm({
                        ...blockForm,
                        roomId: selectedRoom.id,
                      });
                      setEditor("block");
                    }}
                  >
                    {t("admin.addExceptionWithPlus")}
                  </Button>
                </div>
                {blocks.isLoading ? (
                  <div className="subtle-box">{t("admin.loadingRules")}</div>
                ) : selectedBlocks.length === 0 ? (
                  <div className="empty-inline">
                    {t("admin.noRoomExceptions")}
                  </div>
                ) : (
                  <div className="room-block-list">
                    {selectedBlocks.map((block) => (
                      <article className="room-block-row" key={block.id}>
                        <div>
                          <span
                            className={`status-badge ${
                              block.kind === "SERIES"
                                ? "status-badge--warning"
                                : ""
                            }`}
                          >
                            {block.kind === "SERIES"
                              ? t("admin.series")
                              : t("admin.once")}
                          </span>
                          <strong>{block.title}</strong>
                          <small>
                            {formatRoomBlockRule(block, dateLocale, t)}
                          </small>
                        </div>
                        <Button
                          variant="ghost"
                          size="small"
                          disabled={
                            cancelBlock.isPending &&
                            cancelBlock.variables?.id === block.id
                          }
                          onClick={() => cancelBlock.mutate(block)}
                        >
                          {block.kind === "SERIES"
                            ? t("admin.cancelSeries")
                            : t("admin.remove")}
                        </Button>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              {editor === "block" && (
                <form
                  className="form-stack room-block-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createBlock.mutate();
                  }}
                >
                  <div className="room-workspace__form-heading">
                    <div>
                      <span className="eyebrow">{t("admin.newException")}</span>
                      <h3>{t("admin.limitAvailability")}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => setEditor(null)}
                    >
                      {t("close")}
                    </Button>
                  </div>
                  <p className="room-block-editor__room">
                    {t("room")}: <strong>{selectedRoom.name}</strong>
                  </p>
                  <label className="field">
                    <span>{t("admin.publicTitle")}</span>
                    <input
                      value={blockForm.title}
                      onChange={(event) =>
                        setBlockForm({
                          ...blockForm,
                          title: event.target.value,
                        })
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t("admin.privateNote")}</span>
                    <textarea
                      value={blockForm.privateNote}
                      onChange={(event) =>
                        setBlockForm({
                          ...blockForm,
                          privateNote: event.target.value,
                        })
                      }
                      maxLength={300}
                      placeholder={t("admin.privateNotePlaceholder")}
                    />
                  </label>
                  <div className="form-grid">
                    <label className="field">
                      <span>{t("admin.start")}</span>
                      <input
                        type="datetime-local"
                        value={blockForm.startsAt}
                        onChange={(event) =>
                          setBlockForm({
                            ...blockForm,
                            startsAt: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                    <label className="field">
                      <span>{t("admin.end")}</span>
                      <input
                        type="datetime-local"
                        value={blockForm.endsAt}
                        onChange={(event) =>
                          setBlockForm({
                            ...blockForm,
                            endsAt: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                  </div>
                  <fieldset className="segmented-field">
                    <legend>{t("admin.recurrence")}</legend>
                    <div className="segmented recurrence-segmented">
                      {[
                        ["NONE", t("admin.noRecurrence")],
                        ["DAILY", t("admin.everyNDays")],
                        ["WEEKLY", t("admin.byWeekdays")],
                      ].map(([value, label]) => (
                        <button
                          type="button"
                          key={value}
                          className={
                            blockForm.recurrence === value ? "is-active" : ""
                          }
                          onClick={() =>
                            setBlockForm({
                              ...blockForm,
                              recurrence: value as "NONE" | "DAILY" | "WEEKLY",
                              weekdays:
                                value === "WEEKLY" ? blockForm.weekdays : [],
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {blockForm.recurrence !== "NONE" && (
                    <>
                      <div className="form-grid">
                        <label className="field">
                          <span>
                            {t("admin.intervalIn")}{" "}
                            {blockForm.recurrence === "DAILY"
                              ? t("admin.days")
                              : t("admin.weeks")}
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={blockForm.recurrenceInterval}
                            onChange={(event) =>
                              setBlockForm({
                                ...blockForm,
                                recurrenceInterval: Number(event.target.value),
                              })
                            }
                            required
                          />
                        </label>
                        <label className="field">
                          <span>{t("admin.repeatUntil")}</span>
                          <input
                            type="date"
                            value={blockForm.recurrenceUntil}
                            onChange={(event) =>
                              setBlockForm({
                                ...blockForm,
                                recurrenceUntil: event.target.value,
                              })
                            }
                            required
                          />
                        </label>
                      </div>
                      {blockForm.recurrence === "WEEKLY" && (
                        <fieldset className="weekday-picker">
                          <legend>{t("admin.weekdays")}</legend>
                          {[
                            [1, t("weekday.mon")],
                            [2, t("weekday.tue")],
                            [3, t("weekday.wed")],
                            [4, t("weekday.thu")],
                            [5, t("weekday.fri")],
                            [6, t("weekday.sat")],
                            [0, t("weekday.sun")],
                          ].map(([value, label]) => {
                            const day = Number(value);
                            const checked = blockForm.weekdays.includes(day);
                            return (
                              <button
                                type="button"
                                key={value}
                                className={checked ? "is-active" : ""}
                                aria-pressed={checked}
                                onClick={() =>
                                  setBlockForm({
                                    ...blockForm,
                                    weekdays: checked
                                      ? blockForm.weekdays.filter(
                                          (candidate) => candidate !== day,
                                        )
                                      : [...blockForm.weekdays, day],
                                  })
                                }
                              >
                                {label}
                              </button>
                            );
                          })}
                        </fieldset>
                      )}
                    </>
                  )}
                  {createBlock.error && (
                    <div className="form-error">
                      {errorMessage(
                        createBlock.error,
                        t,
                        "admin.createBlockError",
                      )}
                    </div>
                  )}
                  <Button
                    type="submit"
                    disabled={
                      createBlock.isPending ||
                      (blockForm.recurrence === "WEEKLY" &&
                        blockForm.weekdays.length === 0)
                    }
                  >
                    {createBlock.isPending
                      ? t("admin.saving")
                      : blockForm.recurrence === "NONE"
                        ? t("admin.addException")
                        : t("admin.createSeries")}
                  </Button>
                </form>
              )}
            </>
          ) : (
            <div className="empty-inline">{t("admin.addFirstRoom")}</div>
          )}
        </section>
      </div>
    </div>
  );
}

function RoomHoursEditor({ room }: { room: Room }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [workStart, setWorkStart] = useState(room.workStart);
  const [workEnd, setWorkEnd] = useState(room.workEnd);
  const [workingDays, setWorkingDays] = useState(room.workingDays);
  const changed =
    workStart !== room.workStart ||
    workEnd !== room.workEnd ||
    workingDays.join(",") !== room.workingDays.join(",");
  const validHours =
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(workStart) &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(workEnd) &&
    workStart < workEnd &&
    workingDays.length > 0;
  const update = useMutation({
    mutationFn: () =>
      api<void>(`/api/admin/rooms/${room.id}`, {
        method: "PATCH",
        body: JSON.stringify({ workStart, workEnd, workingDays }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  return (
    <div className="room-hours-editor">
      <div className="room-hours-editor__time">
        <label className="room-hours-editor__field">
          <span>{t("admin.opening")}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="09:00"
            aria-label={t("admin.openingLabel", { room: room.name })}
            value={workStart}
            onChange={(event) => {
              setWorkStart(event.target.value);
              update.reset();
            }}
          />
        </label>
        <span className="room-hours-editor__separator">—</span>
        <label className="room-hours-editor__field">
          <span>{t("admin.closing")}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="19:00"
            aria-label={t("admin.closingLabel", { room: room.name })}
            value={workEnd}
            onChange={(event) => {
              setWorkEnd(event.target.value);
              update.reset();
            }}
          />
        </label>
      </div>
      <WorkingDayPicker
        days={workingDays}
        onChange={(days) => {
          setWorkingDays(days);
          update.reset();
        }}
      />
      <Button
        size="small"
        disabled={!changed || !validHours || update.isPending}
        onClick={() => update.mutate()}
      >
        {update.isPending ? "…" : t("save")}
      </Button>
      {changed && !validHours && (
        <small className="field-error">{t("admin.invalidAvailability")}</small>
      )}
      {update.error && (
        <small className="field-error">
          {errorMessage(update.error, t, "admin.updateScheduleError")}
        </small>
      )}
    </div>
  );
}

const ROOM_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function WorkingDayPicker({
  days,
  onChange,
}: {
  days: number[];
  onChange: (days: number[]) => void;
}) {
  const { t } = useI18n();
  const labels = [
    t("weekday.mon"),
    t("weekday.tue"),
    t("weekday.wed"),
    t("weekday.thu"),
    t("weekday.fri"),
    t("weekday.sat"),
    t("weekday.sun"),
  ];
  return (
    <fieldset className="working-day-picker">
      <legend>{t("admin.workingDays")}</legend>
      <div>
        {ROOM_WEEKDAYS.map((day, index) => {
          const selected = days.includes(day);
          return (
            <button
              type="button"
              className={selected ? "is-active" : ""}
              aria-pressed={selected}
              onClick={() =>
                onChange(
                  selected
                    ? days.filter((value) => value !== day)
                    : [...days, day].sort((a, b) => a - b),
                )
              }
              key={day}
            >
              {labels[index]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function AuditAdmin() {
  const { dateLocale, t } = useI18n();
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ category });
  if (search) query.set("search", search);
  query.set("page", String(page));
  query.set("limit", "25");
  const logs = useQuery({
    queryKey: ["audit", category, search, page],
    queryFn: () =>
      api<{
        logs: AuditLog[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>(`/api/admin/audit?${query.toString()}`),
    placeholderData: (previousData) => previousData,
  });
  return (
    <section className="admin-card">
      <div className="admin-card__toolbar activity-toolbar">
        <div>
          <span className="eyebrow">{t("admin.auditEyebrow")}</span>
          <h2>{t("admin.audit")}</h2>
          <p>{t("admin.auditSubtitle")}</p>
        </div>
        <div className="segmented">
          {[
            ["", t("admin.all")],
            ["booking", t("admin.bookings")],
            ["access", t("admin.access")],
            ["room", t("admin.rooms")],
          ].map(([value, label]) => (
            <button
              key={value}
              className={category === value ? "is-active" : ""}
              onClick={() => {
                setCategory(value);
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
            <span className="sr-only">{t("admin.searchAudit")}</span>
            <input
              type="search"
              placeholder={t("admin.auditSearchPlaceholder")}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <Button type="submit" size="small">
            {t("admin.search")}
          </Button>
        </form>
      </div>

      {logs.isLoading ? (
        <div className="subtle-box">{t("admin.loadingAudit")}</div>
      ) : logs.error ? (
        <div className="form-error">
          {errorMessage(logs.error, t, "admin.auditLoadError")}
        </div>
      ) : logs.data?.logs.length === 0 ? (
        <div className="empty-inline">{t("admin.auditEmpty")}</div>
      ) : (
        <>
          <div className="activity-list">
            {logs.data?.logs.map((log) => (
              <article className="activity-row" key={log.id}>
                <time dateTime={log.createdAt}>
                  {new Intl.DateTimeFormat(dateLocale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(log.createdAt))}
                </time>
                <div className="activity-row__main">
                  <strong>{humanizeAction(log.action, t)}</strong>
                  <span>
                    {log.targetName ?? humanizeTarget(log.targetType, t)}
                    {" · "}
                    {log.actorName ?? t("admin.system")}
                    {log.actorEmail ? ` (${log.actorEmail})` : ""}
                  </span>
                </div>
                <span
                  className={`status-badge ${
                    log.action.includes("ADMIN") ? "status-badge--warning" : ""
                  }`}
                >
                  {log.action.includes("ADMIN")
                    ? t("shell.admin")
                    : humanizeTarget(log.targetType, t)}
                </span>
                {Object.keys(log.details ?? {}).length > 0 && (
                  <details className="activity-details">
                    <summary>{t("admin.details")}</summary>
                    <dl>
                      {Object.entries(log.details).map(([key, value]) => (
                        <div key={key}>
                          <dt>{humanizeDetailKey(key, t)}</dt>
                          <dd>{formatActivityValue(value, dateLocale, t)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </article>
            ))}
          </div>
          {logs.data && (
            <Pagination
              page={logs.data.pagination.page}
              totalPages={logs.data.pagination.totalPages}
              total={logs.data.pagination.total}
              itemLabel={t("admin.auditItems")}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}

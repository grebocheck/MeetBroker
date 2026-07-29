import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Booking, Room } from "../types";
import { Avatar } from "../components/Avatar";
import { BookingDialog } from "../components/BookingDialog";
import { RoomVisual } from "../components/RoomVisual";
import { Button } from "../components/ui/Button";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  bio: string | null;
  avatarPreset: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  approved: boolean;
  accessRevoked: boolean;
  restrictions: {
    id: string;
    capability: string;
    expiresAt: string | null;
    reason: string;
  }[];
  createdAt: string;
}

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
  participationMode: "INVITE_ONLY" | "OPEN";
  overrideReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancelledByName: string | null;
  room: {
    id: string;
    name: string;
    floor: number;
  };
  organizer: AdminBookingPerson;
  participants: (AdminBookingPerson & {
    status: "INVITED" | "ACCEPTED" | "DECLINED";
  })[];
}

interface AdminRoomBlock {
  id: string;
  kind: "ONCE" | "SERIES";
  roomId: string;
  roomName: string;
  title: string;
  privateNote: string | null;
  startsAt: string;
  endsAt: string;
  frequency: "DAILY" | "WEEKLY" | null;
  recurrenceInterval: number | null;
  weekdays: number[] | null;
  recurrenceUntil: string | null;
  occurrenceCount: number;
}

export function AdminPage() {
  const [section, setSection] = useState<
    "users" | "bookings" | "rooms" | "audit"
  >("users");
  return (
    <div className="page admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Керування простором</span>
          <h1>Адміністрування</h1>
          <p>Доступ, кімнати й важливі дії без прихованих змін.</p>
        </div>
      </header>
      <div className="tabs">
        <button
          className={section === "users" ? "is-active" : ""}
          onClick={() => setSection("users")}
        >
          Користувачі
        </button>
        <button
          className={section === "bookings" ? "is-active" : ""}
          onClick={() => setSection("bookings")}
        >
          Бронювання
        </button>
        <button
          className={section === "rooms" ? "is-active" : ""}
          onClick={() => setSection("rooms")}
        >
          Кімнати
        </button>
        <button
          className={section === "audit" ? "is-active" : ""}
          onClick={() => setSection("audit")}
        >
          Журнал подій
        </button>
      </div>
      {section === "users" && <UsersAdmin />}
      {section === "bookings" && <BookingsAdmin />}
      {section === "rooms" && <RoomsAdmin />}
      {section === "audit" && <AuditAdmin />}
    </div>
  );
}

function BookingsAdmin() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("upcoming");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminBooking | null>(null);
  const [editing, setEditing] = useState<AdminBooking | null>(null);
  const [reason, setReason] = useState("");
  const query = new URLSearchParams({ status });
  if (search) query.set("search", search);
  const bookings = useQuery({
    queryKey: ["admin-bookings", status, search],
    queryFn: () =>
      api<{ bookings: AdminBooking[] }>(
        `/api/admin/bookings?${query.toString()}`,
      ),
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
              ["upcoming", "Майбутні"],
              ["past", "Минулі"],
              ["cancelled", "Скасовані"],
              ["", "Усі"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={status === value ? "is-active" : ""}
                onClick={() => setStatus(value)}
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
            }}
          >
            <label className="field">
              <span className="sr-only">Пошук бронювань</span>
              <input
                type="search"
                placeholder="Назва, кімната або організатор"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </label>
            <Button type="submit" size="small">
              Знайти
            </Button>
          </form>
          <span className="result-count">
            {bookings.data?.bookings.length ?? 0} бронювань
          </span>
        </div>

        {bookings.isLoading ? (
          <div className="subtle-box">Завантажуємо бронювання…</div>
        ) : bookings.error ? (
          <div className="form-error">
            {bookings.error instanceof ApiError
              ? bookings.error.message
              : "Не вдалося завантажити бронювання"}
          </div>
        ) : bookings.data?.bookings.length === 0 ? (
          <div className="empty-inline">
            За цими умовами бронювань не знайдено.
          </div>
        ) : (
          <div className="admin-booking-list">
            {bookings.data?.bookings.map((booking) => {
              const startsAt = new Date(booking.startsAt);
              const endsAt = new Date(booking.endsAt);
              const isPast = endsAt <= new Date();
              return (
                <article className="admin-booking-row" key={booking.id}>
                  <time dateTime={booking.startsAt}>
                    <strong>
                      {new Intl.DateTimeFormat("uk-UA", {
                        day: "2-digit",
                        month: "short",
                      }).format(startsAt)}
                    </strong>
                    <span>
                      {new Intl.DateTimeFormat("uk-UA", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(startsAt)}
                      {" — "}
                      {new Intl.DateTimeFormat("uk-UA", {
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
                          ? "Скасовано"
                          : isPast
                            ? "Завершено"
                            : booking.participationMode === "OPEN"
                              ? "Відкрита подія"
                              : "Запрошення"}
                      </span>
                    </div>
                    <span>
                      {booking.room.name}, {booking.room.floor} поверх ·{" "}
                      {booking.organizer.name} · {booking.participants.length}{" "}
                      учасників
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
                    Деталі
                  </Button>
                </article>
              );
            })}
          </div>
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
        rooms.data?.rooms.find((room) => room.id === editing.room.id) && (
          <BookingDialog
            room={rooms.data.rooms.find((room) => room.id === editing.room.id)!}
            booking={
              {
                id: editing.id,
                title: editing.title,
                startsAt: editing.startsAt,
                endsAt: editing.endsAt,
                participationMode: editing.participationMode,
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
  const startsAt = new Date(booking.startsAt);
  const endsAt = new Date(booking.endsAt);
  const canCancel = !booking.cancelledAt && endsAt > new Date();
  const date = new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "full",
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const statusLabels = {
    INVITED: "Запрошено",
    ACCEPTED: "Бере участь",
    DECLINED: "Відмовився",
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
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
              {canCancel ? "Адміністративна дія" : "Деталі бронювання"}
            </span>
            <h2 id="admin-booking-title">{booking.title}</h2>
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

        <div className="cancel-summary">
          <dl>
            <div>
              <dt>Кімната</dt>
              <dd>{booking.room.name}</dd>
            </div>
            <div>
              <dt>Формат</dt>
              <dd>
                {booking.participationMode === "OPEN"
                  ? "Відкрита подія"
                  : "За запрошенням"}
              </dd>
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
          </dl>
        </div>

        <div className="admin-booking-organizer">
          <Avatar
            name={booking.organizer.name}
            preset={booking.organizer.avatarPreset}
            url={booking.organizer.avatarUrl}
          />
          <div>
            <span>Організатор</span>
            <strong>{booking.organizer.name}</strong>
            <small>{booking.organizer.email}</small>
          </div>
        </div>

        <div className="admin-booking-participants">
          <strong>Учасники · {booking.participants.length}</strong>
          {booking.participants.length === 0 ? (
            <span>Додаткових учасників немає.</span>
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
            <strong>Причина обходу недоступності:</strong>{" "}
            {booking.overrideReason}
          </div>
        )}

        {booking.cancelledAt && (
          <div className="subtle-box">
            <strong>Скасовано:</strong>{" "}
            {new Intl.DateTimeFormat("uk-UA", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(booking.cancelledAt))}
            {booking.cancelledByName ? ` · ${booking.cancelledByName}` : ""}
            {booking.cancellationReason
              ? ` · Причина: ${booking.cancellationReason}`
              : ""}
          </div>
        )}

        {canCancel && (
          <label className="field">
            <span>Причина примусового скасування</span>
            <textarea
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              maxLength={300}
              placeholder="Наприклад, бронювання порушує правила використання кімнати"
              required
            />
            <small>
              Організатор і учасники отримають цю причину в сповіщенні.
            </small>
          </label>
        )}

        {Boolean(error) && (
          <div className="form-error" role="alert">
            {error instanceof ApiError
              ? error.message
              : "Не вдалося скасувати бронювання"}
          </div>
        )}

        <div className="modal__actions">
          <Button
            onClick={onClose}
            disabled={pending}
          >
            Закрити
          </Button>
          {canCancel && (
            <Button
              onClick={onEdit}
              disabled={pending}
            >
              Змінити подію
            </Button>
          )}
          {canCancel && (
            <Button
              variant="danger"
              onClick={onCancel}
              disabled={pending || reason.trim().length < 3}
            >
              {pending ? "Скасовуємо…" : "Скасувати бронювання"}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function UsersAdmin() {
  const [filter, setFilter] = useState("pending");
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ["admin-users", filter],
    queryFn: () =>
      api<{ users: AdminUser[] }>(`/api/admin/users?status=${filter}`),
  });
  const action = useMutation({
    mutationFn: ({
      path,
      method = "POST",
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) =>
      api<void>(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const restrict = (user: AdminUser) => {
    const days = window.prompt(
      `На скільки днів заборонити ${user.name} створювати бронювання?`,
      "7",
    );
    if (!days) return;
    const reason = window.prompt("Причина обмеження:");
    if (!reason) return;
    const expiresAt = new Date(
      Date.now() + Math.max(1, Number(days)) * 86_400_000,
    ).toISOString();
    action.mutate({
      path: `/api/admin/users/${user.id}/restrictions`,
      body: { capability: "BOOKING_CREATE", expiresAt, reason },
    });
  };

  return (
    <section className="admin-card">
      <div className="admin-card__toolbar">
        <div className="segmented">
          {[
            ["pending", "Очікують"],
            ["active", "Активні"],
            ["revoked", "Відкликані"],
            ["", "Усі"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "is-active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="result-count">
          {users.data?.users.length ?? 0} користувачів
        </span>
      </div>
      {action.error && (
        <div className="form-error">
          {action.error instanceof ApiError
            ? action.error.message
            : "Адміністративна дія не виконана"}
        </div>
      )}
      <div className="admin-user-list">
        {users.isLoading ? (
          <div className="subtle-box">Завантажуємо користувачів…</div>
        ) : users.data?.users.length === 0 ? (
          <div className="empty-inline">У цій категорії нікого немає.</div>
        ) : (
          users.data?.users.map((user) => (
            <article className="admin-user-row" key={user.id}>
              <Avatar
                name={user.name}
                preset={user.avatarPreset}
                url={user.avatarUrl}
              />
              <div className="admin-user-row__identity">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <div className="admin-user-row__status">
                <span className="status-badge">
                  {!user.emailVerified
                    ? "Email не підтверджено"
                    : user.accessRevoked
                      ? "Доступ відкликано"
                      : user.approved
                        ? user.role === "ADMIN"
                          ? "Адміністратор"
                          : "Активний"
                        : "Очікує схвалення"}
                </span>
                {user.restrictions.map((restriction) => (
                  <span
                    className="status-badge status-badge--warning"
                    key={restriction.id}
                  >
                    Без бронювань
                  </span>
                ))}
              </div>
              <div className="admin-user-row__actions">
                {!user.approved &&
                  user.emailVerified &&
                  !user.accessRevoked && (
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() =>
                        action.mutate({
                          path: `/api/admin/users/${user.id}/approve`,
                        })
                      }
                    >
                      Схвалити
                    </Button>
                  )}
                {user.approved && !user.accessRevoked && (
                  <>
                    <Button
                      size="small"
                      onClick={() => restrict(user)}
                    >
                      Обмежити
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        const reason = window.prompt(
                          "Причина відкликання доступу:",
                        );
                        if (reason) {
                          action.mutate({
                            path: `/api/admin/users/${user.id}/revoke`,
                            body: { reason },
                          });
                        }
                      }}
                    >
                      Відкликати
                    </Button>
                  </>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function RoomsAdmin() {
  const queryClient = useQueryClient();
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
  });
  const [roomImage, setRoomImage] = useState<File | null>(null);
  const [blockForm, setBlockForm] = useState({
    roomId: "",
    title: "Технічне обслуговування",
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
    onSuccess: () => {
      setRoomForm({
        name: "",
        floor: 1,
        capacity: 6,
        workStart: "09:00",
        workEnd: "19:00",
      });
      setRoomImage(null);
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

  return (
    <div className="admin-columns">
      <section className="admin-card">
        <h2>Переговорні</h2>
        <div className="room-admin-list">
          {rooms.data?.rooms.map((room) => (
            <div className="room-admin-row" key={room.id}>
              <RoomVisual room={room} size="compact" />
              <div className="room-admin-row__copy">
                <strong>{room.name}</strong>
                <span>
                  {room.floor} поверх · {room.capacity} місць
                </span>
              </div>
              <RoomHoursEditor room={room} />
              <div className="room-image-actions">
                <label className="button button--secondary button--slanted button--small room-image-action">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file)
                        uploadRoomImage.mutate({ roomId: room.id, file });
                      event.target.value = "";
                    }}
                  />
                  <span>
                    {uploadRoomImage.isPending &&
                    uploadRoomImage.variables?.roomId === room.id
                      ? "Обробляємо…"
                      : room.imageUrl
                        ? "Замінити фото"
                        : "Додати фото"}
                  </span>
                </label>
                {room.imageUrl && (
                  <Button
                    variant="ghost"
                    size="small"
                    disabled={
                      removeRoomImage.isPending &&
                      removeRoomImage.variables === room.id
                    }
                    onClick={() => removeRoomImage.mutate(room.id)}
                  >
                    Прибрати
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <form
          className="form-stack admin-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            createRoom.mutate();
          }}
        >
          <h3>Додати кімнату</h3>
          <label className="field">
            <span>Назва</span>
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
              <span>Поверх</span>
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
              <span>Місткість</span>
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
          <div className="form-grid">
            <label className="field">
              <span>Працює з</span>
              <input
                type="time"
                step={1800}
                value={roomForm.workStart}
                onChange={(event) =>
                  setRoomForm({ ...roomForm, workStart: event.target.value })
                }
                required
              />
            </label>
            <label className="field">
              <span>Працює до</span>
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
              <strong>Фото кімнати</strong>
              <small>
                JPG, PNG чи WebP — автоматично кадруємо до широкого формату
              </small>
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setRoomImage(event.target.files?.[0] ?? null)
              }
            />
            <em>{roomImage ? roomImage.name : "Обрати файл"}</em>
          </label>
          {(createRoom.error ||
            uploadRoomImage.error ||
            removeRoomImage.error) && (
            <div className="form-error">
              {createRoom.error instanceof ApiError
                ? createRoom.error.message
                : uploadRoomImage.error instanceof ApiError
                  ? uploadRoomImage.error.message
                  : removeRoomImage.error instanceof ApiError
                    ? removeRoomImage.error.message
                    : "Не вдалося зберегти фото кімнати"}
            </div>
          )}
          <Button type="submit">Додати</Button>
        </form>
      </section>

      <section className="admin-card">
        <span className="eyebrow">Винятки з графіка</span>
        <h2>Недоступність кімнати</h2>
        <p>
          Разова проблема або серія прибирань, ремонтів та інших регулярних
          робіт. Робочі години налаштовуються окремо біля кожної кімнати.
        </p>
        <div className="room-block-list">
          {blocks.isLoading ? (
            <div className="subtle-box">Завантажуємо правила…</div>
          ) : blocks.data?.blocks.length === 0 ? (
            <div className="empty-inline">
              Активних винятків із графіка немає.
            </div>
          ) : (
            blocks.data?.blocks.map((block) => (
              <article className="room-block-row" key={block.id}>
                <div>
                  <span
                    className={`status-badge ${
                      block.kind === "SERIES" ? "status-badge--warning" : ""
                    }`}
                  >
                    {block.kind === "SERIES" ? "Серія" : "Разово"}
                  </span>
                  <strong>{block.title}</strong>
                  <small>
                    {block.roomName} · {formatRoomBlockRule(block)}
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
                  {block.kind === "SERIES" ? "Скасувати серію" : "Прибрати"}
                </Button>
              </article>
            ))
          )}
        </div>
        <form
          className="form-stack admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            createBlock.mutate();
          }}
        >
          <label className="field">
            <span>Кімната</span>
            <select
              value={blockForm.roomId}
              onChange={(event) =>
                setBlockForm({ ...blockForm, roomId: event.target.value })
              }
              required
            >
              <option value="">Оберіть кімнату</option>
              {rooms.data?.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Публічна назва</span>
            <input
              value={blockForm.title}
              onChange={(event) =>
                setBlockForm({ ...blockForm, title: event.target.value })
              }
              required
            />
          </label>
          <label className="field">
            <span>Внутрішня примітка</span>
            <textarea
              value={blockForm.privateNote}
              onChange={(event) =>
                setBlockForm({
                  ...blockForm,
                  privateNote: event.target.value,
                })
              }
              maxLength={300}
              placeholder="Не показується користувачам"
            />
          </label>
          <label className="field">
            <span>Початок</span>
            <input
              type="datetime-local"
              value={blockForm.startsAt}
              onChange={(event) =>
                setBlockForm({ ...blockForm, startsAt: event.target.value })
              }
              required
            />
          </label>
          <label className="field">
            <span>Завершення</span>
            <input
              type="datetime-local"
              value={blockForm.endsAt}
              onChange={(event) =>
                setBlockForm({ ...blockForm, endsAt: event.target.value })
              }
              required
            />
          </label>
          <fieldset className="segmented-field">
            <legend>Повторення</legend>
            <div className="segmented recurrence-segmented">
              {[
                ["NONE", "Не повторюється"],
                ["DAILY", "Кожні N днів"],
                ["WEEKLY", "За днями тижня"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={blockForm.recurrence === value ? "is-active" : ""}
                  onClick={() =>
                    setBlockForm({
                      ...blockForm,
                      recurrence: value as "NONE" | "DAILY" | "WEEKLY",
                      weekdays: value === "WEEKLY" ? blockForm.weekdays : [],
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
                    Інтервал у{" "}
                    {blockForm.recurrence === "DAILY" ? "днях" : "тижнях"}
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
                  <span>Повторювати до</span>
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
                  <legend>Дні тижня</legend>
                  {[
                    [1, "Пн"],
                    [2, "Вт"],
                    [3, "Ср"],
                    [4, "Чт"],
                    [5, "Пт"],
                    [6, "Сб"],
                    [0, "Нд"],
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
              {createBlock.error instanceof ApiError
                ? createBlock.error.message
                : "Не вдалося створити блокування"}
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={
              createBlock.isPending ||
              (blockForm.recurrence === "WEEKLY" &&
                blockForm.weekdays.length === 0)
            }
          >
            {createBlock.isPending
              ? "Зберігаємо…"
              : blockForm.recurrence === "NONE"
                ? "Додати разовий виняток"
                : "Створити серію"}
          </Button>
        </form>
      </section>
    </div>
  );
}

function RoomHoursEditor({ room }: { room: Room }) {
  const queryClient = useQueryClient();
  const [workStart, setWorkStart] = useState(room.workStart);
  const [workEnd, setWorkEnd] = useState(room.workEnd);
  const changed = workStart !== room.workStart || workEnd !== room.workEnd;
  const validHours =
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(workStart) &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(workEnd) &&
    workStart < workEnd;
  const update = useMutation({
    mutationFn: () =>
      api<void>(`/api/admin/rooms/${room.id}`, {
        method: "PATCH",
        body: JSON.stringify({ workStart, workEnd }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  return (
    <div className="room-hours-editor">
      <div className="room-hours-editor__heading">
        <div>
          <strong>Робочі години</strong>
          <small>Бронювання поза цим часом недоступне</small>
        </div>
        <Button
          size="small"
          disabled={!changed || !validHours || update.isPending}
          onClick={() => update.mutate()}
        >
          {update.isPending ? "…" : "Зберегти"}
        </Button>
      </div>
      <div className="room-hours-editor__controls">
        <label>
          <span className="sr-only">Початок роботи {room.name}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="09:00"
            aria-label={`Початок роботи ${room.name}, формат ГГ:ХХ`}
            value={workStart}
            onChange={(event) => {
              setWorkStart(event.target.value);
              update.reset();
            }}
          />
        </label>
        <span>—</span>
        <label>
          <span className="sr-only">Завершення роботи {room.name}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="19:00"
            aria-label={`Завершення роботи ${room.name}, формат ГГ:ХХ`}
            value={workEnd}
            onChange={(event) => {
              setWorkEnd(event.target.value);
              update.reset();
            }}
          />
        </label>
      </div>
      {changed && !validHours && (
        <small className="field-error">
          Вкажіть час у форматі 09:00–19:00; завершення має бути пізніше.
        </small>
      )}
      {update.error && (
        <small className="field-error">
          {update.error instanceof ApiError
            ? update.error.message
            : "Не вдалося оновити графік"}
        </small>
      )}
    </div>
  );
}

function formatRoomBlockRule(block: AdminRoomBlock): string {
  const time = new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  if (block.kind === "ONCE") {
    return `${time.format(new Date(block.startsAt))} — ${time.format(
      new Date(block.endsAt),
    )}`;
  }
  const interval = block.recurrenceInterval ?? 1;
  const frequency =
    block.frequency === "DAILY"
      ? interval === 1
        ? "щодня"
        : `кожні ${interval} дн.`
      : interval === 1
        ? "щотижня"
        : `кожні ${interval} тиж.`;
  const weekdays = block.weekdays?.length
    ? ` · ${block.weekdays
        .map((day) => ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][day])
        .join(", ")}`
    : "";
  return `${frequency}${weekdays} · ${block.occurrenceCount} майбутніх входжень`;
}

function AuditAdmin() {
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const query = new URLSearchParams({ category });
  if (search) query.set("search", search);
  const logs = useQuery({
    queryKey: ["audit", category, search],
    queryFn: () =>
      api<{ logs: AuditLog[] }>(`/api/admin/audit?${query.toString()}`),
  });
  return (
    <section className="admin-card">
      <div className="admin-card__toolbar activity-toolbar">
        <div>
          <span className="eyebrow">Хронологія системи</span>
          <h2>Журнал подій</h2>
          <p>Бронювання, доступ і зміни кімнат із зазначенням виконавця.</p>
        </div>
        <div className="segmented">
          {[
            ["", "Усі"],
            ["booking", "Бронювання"],
            ["access", "Доступ"],
            ["room", "Кімнати"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={category === value ? "is-active" : ""}
              onClick={() => setCategory(value)}
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
          }}
        >
          <label className="field">
            <span className="sr-only">Пошук у журналі подій</span>
            <input
              type="search"
              placeholder="Подія, користувач або об’єкт"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <Button type="submit" size="small">
            Знайти
          </Button>
        </form>
      </div>

      {logs.isLoading ? (
        <div className="subtle-box">Завантажуємо журнал подій…</div>
      ) : logs.error ? (
        <div className="form-error">
          {logs.error instanceof ApiError
            ? logs.error.message
            : "Не вдалося завантажити журнал подій"}
        </div>
      ) : logs.data?.logs.length === 0 ? (
        <div className="empty-inline">Подій за цими умовами не знайдено.</div>
      ) : (
        <div className="activity-list">
          {logs.data?.logs.map((log) => (
            <article className="activity-row" key={log.id}>
              <time dateTime={log.createdAt}>
                {new Intl.DateTimeFormat("uk-UA", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(log.createdAt))}
              </time>
              <div className="activity-row__main">
                <strong>{humanizeAction(log.action)}</strong>
                <span>
                  {log.targetName ?? humanizeTarget(log.targetType)}
                  {" · "}
                  {log.actorName ?? "Система"}
                  {log.actorEmail ? ` (${log.actorEmail})` : ""}
                </span>
              </div>
              <span
                className={`status-badge ${
                  log.action.includes("ADMIN") ? "status-badge--warning" : ""
                }`}
              >
                {log.action.includes("ADMIN")
                  ? "Адміністратор"
                  : humanizeTarget(log.targetType)}
              </span>
              {Object.keys(log.details ?? {}).length > 0 && (
                <details className="activity-details">
                  <summary>Деталі</summary>
                  <dl>
                    {Object.entries(log.details).map(([key, value]) => (
                      <div key={key}>
                        <dt>{humanizeDetailKey(key)}</dt>
                        <dd>{formatActivityValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function humanizeAction(action: string): string {
  const actions: Record<string, string> = {
    USER_APPROVED: "Схвалено користувача",
    USER_ACCESS_REVOKED: "Відкликано доступ",
    USER_RESTRICTED: "Додано обмеження",
    USER_RESTRICTION_REVOKED: "Знято обмеження",
    USER_ROLE_CHANGED: "Змінено роль",
    EMAIL_CHANGE_REQUESTED: "Запитано зміну email",
    EMAIL_CHANGED: "Змінено email",
    PASSWORD_CHANGED: "Змінено пароль",
    ROOM_CREATED: "Створено кімнату",
    ROOM_UPDATED: "Оновлено кімнату",
    ROOM_IMAGE_UPDATED: "Оновлено фото кімнати",
    ROOM_IMAGE_REMOVED: "Прибрано фото кімнати",
    ROOM_BLOCK_CREATED: "Заблоковано час кімнати",
    ROOM_BLOCK_CANCELLED: "Прибрано недоступність кімнати",
    ROOM_BLOCK_SERIES_CREATED: "Створено серію недоступності",
    ROOM_BLOCK_SERIES_CANCELLED: "Скасовано серію недоступності",
    BOOKING_CREATED: "Створено бронювання",
    BOOKING_UPDATED: "Оновлено бронювання",
    BOOKING_UPDATED_BY_ADMIN: "Адміністратор змінив бронювання",
    BOOKING_CANCELLED: "Скасовано власне бронювання",
    BOOKING_CANCELLED_BY_ADMIN: "Скасовано бронювання",
    BOOKING_AVAILABILITY_OVERRIDE: "Обійдено недоступність",
    BOOKING_INVITATION_ACCEPTED: "Прийнято запрошення",
    BOOKING_INVITATION_DECLINED: "Відхилено запрошення",
    OPEN_EVENT_JOINED: "Користувач долучився до відкритої події",
    OPEN_EVENT_LEFT: "Користувач залишив відкриту подію",
  };
  return actions[action] ?? action;
}

function humanizeTarget(target: string): string {
  return (
    {
      BOOKING: "Бронювання",
      USER: "Користувач",
      ROOM: "Кімната",
      ROOM_BLOCK: "Недоступність кімнати",
      ROOM_BLOCK_SERIES: "Серія недоступності",
    }[target] ?? target
  );
}

function humanizeDetailKey(key: string): string {
  const keys: Record<string, string> = {
    reason: "Причина",
    title: "Назва",
    roomName: "Кімната",
    startsAt: "Початок",
    endsAt: "Завершення",
    participationMode: "Формат",
    participantCount: "Учасників",
    addedParticipants: "Додано учасників",
    removedParticipants: "Видалено учасників",
    role: "Роль",
    capability: "Обмеження",
    expiresAt: "Діє до",
    recurrence: "Повторення",
    recurrenceInterval: "Інтервал",
    weekdays: "Дні тижня",
    recurrenceUntil: "Повторюється до",
    occurrenceCount: "Створено інтервалів",
    pendingEmail: "Нова email-адреса",
  };
  return keys[key] ?? key;
}

function formatActivityValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("uk-UA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    }
    if (value === "OPEN") return "Відкрита подія";
    if (value === "INVITE_ONLY") return "За запрошенням";
    return value;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Room } from "../types";
import { Avatar } from "../components/Avatar";
import { RoomVisual } from "../components/RoomVisual";

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
  details: Record<string, unknown>;
  createdAt: string;
  actorName: string | null;
}

export function AdminPage() {
  const [section, setSection] = useState<"users" | "rooms" | "audit">("users");
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
          className={section === "rooms" ? "is-active" : ""}
          onClick={() => setSection("rooms")}
        >
          Кімнати
        </button>
        <button
          className={section === "audit" ? "is-active" : ""}
          onClick={() => setSection("audit")}
        >
          Аудит
        </button>
      </div>
      {section === "users" && <UsersAdmin />}
      {section === "rooms" && <RoomsAdmin />}
      {section === "audit" && <AuditAdmin />}
    </div>
  );
}

function UsersAdmin() {
  const [filter, setFilter] = useState("pending");
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ["admin-users", filter],
    queryFn: () =>
      api<{ users: AdminUser[] }>(`/api/admin/users?status=${filter}`)
  });
  const action = useMutation({
    mutationFn: ({
      path,
      method = "POST",
      body
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) =>
      api<void>(path, {
        method,
        body: body ? JSON.stringify(body) : undefined
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-users"] })
  });

  const restrict = (user: AdminUser) => {
    const days = window.prompt(
      `На скільки днів заборонити ${user.name} створювати бронювання?`,
      "7"
    );
    if (!days) return;
    const reason = window.prompt("Причина обмеження:");
    if (!reason) return;
    const expiresAt = new Date(
      Date.now() + Math.max(1, Number(days)) * 86_400_000
    ).toISOString();
    action.mutate({
      path: `/api/admin/users/${user.id}/restrictions`,
      body: { capability: "BOOKING_CREATE", expiresAt, reason }
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
            ["", "Усі"]
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
                  <span className="status-badge status-badge--warning" key={restriction.id}>
                    Без бронювань
                  </span>
                ))}
              </div>
              <div className="admin-user-row__actions">
                {!user.approved && user.emailVerified && !user.accessRevoked && (
                  <button
                    className="button button--primary button--small"
                    onClick={() =>
                      action.mutate({
                        path: `/api/admin/users/${user.id}/approve`
                      })
                    }
                  >
                    Схвалити
                  </button>
                )}
                {user.approved && !user.accessRevoked && (
                  <>
                    <button
                      className="button button--secondary button--small"
                      onClick={() => restrict(user)}
                    >
                      Обмежити
                    </button>
                    <button
                      className="button button--ghost button--small"
                      onClick={() => {
                        const reason = window.prompt("Причина відкликання доступу:");
                        if (reason) {
                          action.mutate({
                            path: `/api/admin/users/${user.id}/revoke`,
                            body: { reason }
                          });
                        }
                      }}
                    >
                      Відкликати
                    </button>
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
    queryFn: () => api<{ rooms: Room[] }>("/api/rooms")
  });
  const [roomForm, setRoomForm] = useState({
    name: "",
    floor: 1,
    capacity: 6
  });
  const [roomImage, setRoomImage] = useState<File | null>(null);
  const [blockForm, setBlockForm] = useState({
    roomId: "",
    title: "Технічне обслуговування",
    startsAt: "",
    endsAt: ""
  });
  const createRoom = useMutation({
    mutationFn: async () => {
      const created = await api<{ id: string }>("/api/admin/rooms", {
        method: "POST",
        body: JSON.stringify(roomForm)
      });
      if (roomImage) {
        const form = new FormData();
        form.set("image", roomImage);
        await api<{ imageUrl: string }>(
          `/api/admin/rooms/${created.id}/image`,
          { method: "POST", body: form }
        );
      }
      return created;
    },
    onSuccess: () => {
      setRoomForm({ name: "", floor: 1, capacity: 6 });
      setRoomImage(null);
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    }
  });
  const uploadRoomImage = useMutation({
    mutationFn: ({ roomId, file }: { roomId: string; file: File }) => {
      const form = new FormData();
      form.set("image", file);
      return api<{ imageUrl: string }>(
        `/api/admin/rooms/${roomId}/image`,
        { method: "POST", body: form }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    }
  });
  const removeRoomImage = useMutation({
    mutationFn: (roomId: string) =>
      api<void>(`/api/admin/rooms/${roomId}/image`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    }
  });
  const createBlock = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/admin/room-blocks", {
        method: "POST",
        body: JSON.stringify({
          ...blockForm,
          startsAt: new Date(blockForm.startsAt).toISOString(),
          endsAt: new Date(blockForm.endsAt).toISOString()
        })
      }),
    onSuccess: () => {
      setBlockForm({ ...blockForm, startsAt: "", endsAt: "" });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    }
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
                  {room.floor} поверх · {room.capacity} місць ·{" "}
                  {room.workStart}–{room.workEnd}
                </span>
              </div>
              <div className="room-image-actions">
                <label className="room-image-action">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) uploadRoomImage.mutate({ roomId: room.id, file });
                      event.target.value = "";
                    }}
                  />
                  {uploadRoomImage.isPending &&
                  uploadRoomImage.variables?.roomId === room.id
                    ? "Обробляємо…"
                    : room.imageUrl
                      ? "Замінити"
                      : "Додати фото"}
                </label>
                {room.imageUrl && (
                  <button
                    type="button"
                    className="room-image-remove"
                    disabled={
                      removeRoomImage.isPending &&
                      removeRoomImage.variables === room.id
                    }
                    onClick={() => removeRoomImage.mutate(room.id)}
                  >
                    Прибрати
                  </button>
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
                  setRoomForm({ ...roomForm, floor: Number(event.target.value) })
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
                    capacity: Number(event.target.value)
                  })
                }
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
          <button className="button button--secondary">Додати</button>
        </form>
      </section>

      <section className="admin-card">
        <h2>Недоступність кімнати</h2>
        <p>
          Прибирання, ремонт чи інший період, поверх якого може бронювати лише
          адміністратор із причиною.
        </p>
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
          {createBlock.error && (
            <div className="form-error">
              {createBlock.error instanceof ApiError
                ? createBlock.error.message
                : "Не вдалося створити блокування"}
            </div>
          )}
          <button
            className="button button--primary"
            disabled={createBlock.isPending}
          >
            Заблокувати час
          </button>
        </form>
      </section>
    </div>
  );
}

function AuditAdmin() {
  const logs = useQuery({
    queryKey: ["audit"],
    queryFn: () => api<{ logs: AuditLog[] }>("/api/admin/audit")
  });
  return (
    <section className="admin-card">
      <div className="audit-list">
        {logs.data?.logs.map((log) => (
          <article className="audit-row" key={log.id}>
            <span className="audit-row__time">
              {new Intl.DateTimeFormat("uk-UA", {
                dateStyle: "short",
                timeStyle: "short"
              }).format(new Date(log.createdAt))}
            </span>
            <strong>{humanizeAction(log.action)}</strong>
            <span>{log.actorName ?? "Система"}</span>
            <code>{log.targetType}</code>
          </article>
        ))}
      </div>
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
    ROOM_CREATED: "Створено кімнату",
    ROOM_UPDATED: "Оновлено кімнату",
    ROOM_BLOCK_CREATED: "Заблоковано час кімнати",
    BOOKING_CANCELLED_BY_ADMIN: "Скасовано бронювання",
    BOOKING_AVAILABILITY_OVERRIDE: "Обійдено недоступність"
  };
  return actions[action] ?? action;
}

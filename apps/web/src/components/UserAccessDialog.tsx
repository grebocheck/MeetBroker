import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { ActiveRestriction, Capability, Room } from "../types";
import { Button } from "./ui/Button";
import { ModalLayer } from "./ui/ModalLayer";

const capabilityLabels: Record<Capability, string> = {
  BOOKING_CREATE: "Створення бронювань",
  BOOKING_CANCEL_OWN: "Скасування власних бронювань",
  SCHEDULE_VIEW: "Перегляд розкладу",
  ACCOUNT_LOGIN: "Вхід до облікового запису",
};

const capabilityHints: Record<Capability, string> = {
  BOOKING_CREATE: "Користувач бачитиме розклад, але не зможе бронювати.",
  BOOKING_CANCEL_OWN: "Створені бронювання не можна буде скасувати самостійно.",
  SCHEDULE_VIEW: "Розклад вибраної кімнати або всіх кімнат буде недоступний.",
  ACCOUNT_LOGIN: "Усі активні сесії втратять доступ до завершення обмеження.",
};

function toIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function formatDate(value: string | null): string {
  if (!value) return "безстроково";
  return new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function capabilityLabel(capability: Capability): string {
  return capabilityLabels[capability];
}

export function UserAccessDialog({
  user,
  onClose,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    restrictions: ActiveRestriction[];
  };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [capability, setCapability] =
    useState<Capability>("BOOKING_CREATE");
  const [roomId, setRoomId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [localError, setLocalError] = useState("");
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/api/rooms"),
  });
  const roomNames = useMemo(
    () => new Map(rooms.data?.rooms.map((room) => [room.id, room.name])),
    [rooms.data?.rooms],
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  const createRestriction = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/api/admin/users/${user.id}/restrictions`, {
        method: "POST",
        body: JSON.stringify({
          capability,
          roomId: capability === "ACCOUNT_LOGIN" ? undefined : roomId || undefined,
          startsAt: toIso(startsAt),
          expiresAt: toIso(expiresAt),
          reason: reason.trim(),
        }),
      }),
    onSuccess: async () => {
      setReason("");
      setStartsAt("");
      setExpiresAt("");
      setRoomId("");
      setLocalError("");
      await refresh();
    },
  });
  const removeRestriction = useMutation({
    mutationFn: (restrictionId: string) =>
      api<void>(`/api/admin/restrictions/${restrictionId}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
  });
  const revokeAccess = useMutation({
    mutationFn: () =>
      api<void>(`/api/admin/users/${user.id}/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason: revokeReason.trim() }),
      }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const pending =
    createRestriction.isPending ||
    removeRestriction.isPending ||
    revokeAccess.isPending;
  const requestError =
    createRestriction.error ?? removeRestriction.error ?? revokeAccess.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLocalError("");
    if (reason.trim().length < 3) {
      setLocalError("Опишіть причину щонайменше трьома символами.");
      return;
    }
    if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
      setLocalError("Завершення має бути пізніше за початок.");
      return;
    }
    createRestriction.mutate();
  };

  return (
    <ModalLayer
      className="modal-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!pending) onClose();
      }}
    >
      <section
        className="modal access-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <span className="eyebrow">Політики доступу</span>
            <h2 id="access-dialog-title">Керування доступом</h2>
            <p>
              {user.name} · {user.email}
            </p>
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

        <div className="access-dialog__section">
          <div className="access-dialog__heading">
            <div>
              <strong>Чинні та заплановані обмеження</strong>
              <span>Кожну політику можна відкликати окремо.</span>
            </div>
            <span className="result-count">{user.restrictions.length}</span>
          </div>
          <div className="access-policy-list">
            {user.restrictions.length === 0 ? (
              <div className="subtle-box">Додаткових обмежень немає.</div>
            ) : (
              user.restrictions.map((restriction) => (
                <article className="access-policy" key={restriction.id}>
                  <div>
                    <strong>{capabilityLabel(restriction.capability)}</strong>
                    <span>
                      {restriction.roomId
                        ? `Кімната: ${roomNames.get(restriction.roomId) ?? "вибрана"}`
                        : "Уся система"}
                    </span>
                    <span>
                      Від {formatDate(restriction.startsAt)} · до{" "}
                      {formatDate(restriction.expiresAt)}
                    </span>
                    <p>{restriction.reason}</p>
                  </div>
                  <Button
                    size="small"
                    onClick={() => removeRestriction.mutate(restriction.id)}
                    disabled={pending}
                  >
                    Відкликати
                  </Button>
                </article>
              ))
            )}
          </div>
        </div>

        <form className="form-stack access-dialog__section" onSubmit={submit}>
          <div className="access-dialog__heading">
            <div>
              <strong>Нове обмеження</strong>
              <span>Період і область дії налаштовуються незалежно.</span>
            </div>
          </div>
          <label>
            Функція
            <select
              value={capability}
              onChange={(event) => {
                const next = event.target.value as Capability;
                setCapability(next);
                if (next === "ACCOUNT_LOGIN") setRoomId("");
              }}
            >
              {Object.entries(capabilityLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
            <small className="field-hint">{capabilityHints[capability]}</small>
          </label>
          <label>
            Область дії
            <select
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              disabled={capability === "ACCOUNT_LOGIN"}
            >
              <option value="">Усі кімнати</option>
              {rooms.data?.rooms.map((room) => (
                <option value={room.id} key={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            {capability === "ACCOUNT_LOGIN" && (
              <small className="field-hint">
                Обмеження входу завжди діє на весь обліковий запис.
              </small>
            )}
          </label>
          <div className="form-grid">
            <label>
              Початок
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
              <small className="field-hint">Порожньо — відразу</small>
            </label>
            <label>
              Завершення
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <small className="field-hint">Порожньо — безстроково</small>
            </label>
          </div>
          <label>
            Причина
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              placeholder="Користувач побачить цю причину та строк дії"
            />
          </label>
          {(localError || requestError) && (
            <div className="form-error" role="alert">
              {localError ||
                (requestError instanceof ApiError
                  ? requestError.message
                  : "Не вдалося змінити політику доступу")}
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={pending || reason.trim().length < 3}
          >
            {createRestriction.isPending ? "Застосовуємо…" : "Додати обмеження"}
          </Button>
        </form>

        <div className="access-dialog__danger">
          <div>
            <strong>Повністю відкликати корпоративний доступ</strong>
            <span>Сесії буде завершено, а вхід заблоковано безстроково.</span>
          </div>
          <textarea
            value={revokeReason}
            onChange={(event) => setRevokeReason(event.target.value)}
            maxLength={300}
            placeholder="Причина незворотної адміністративної дії"
          />
          <Button
            variant="danger"
            onClick={() => revokeAccess.mutate()}
            disabled={pending || revokeReason.trim().length < 3}
          >
            Відкликати весь доступ
          </Button>
        </div>

        <div className="modal__actions">
          <Button onClick={onClose} disabled={pending}>
            Закрити
          </Button>
        </div>
      </section>
    </ModalLayer>
  );
}

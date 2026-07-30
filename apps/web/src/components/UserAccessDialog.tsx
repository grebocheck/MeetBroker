import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { errorMessage } from "../lib/error-message";
import { useI18n, type Translator } from "../lib/i18n";
import type { MessageKey } from "../locales/uk";
import type { ActiveRestriction, Capability, Room } from "../types";
import { Button } from "./ui/Button";
import { ModalLayer } from "./ui/ModalLayer";

const capabilityLabelKeys: Record<Capability, MessageKey> = {
  BOOKING_CREATE: "capability.BOOKING_CREATE",
  BOOKING_CANCEL_OWN: "capability.BOOKING_CANCEL_OWN",
  SCHEDULE_VIEW: "capability.SCHEDULE_VIEW",
  ACCOUNT_LOGIN: "capability.ACCOUNT_LOGIN",
};

const capabilityHintKeys: Record<Capability, MessageKey> = {
  BOOKING_CREATE: "accessDialog.hintCreate",
  BOOKING_CANCEL_OWN: "accessDialog.hintCancel",
  SCHEDULE_VIEW: "accessDialog.hintSchedule",
  ACCOUNT_LOGIN: "accessDialog.hintLogin",
};

function toIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function formatDate(
  value: string | null,
  dateLocale: string,
  t: Translator,
): string {
  if (!value) return t("access.unlimited");
  return new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function capabilityLabel(
  capability: Capability,
  t: Translator,
): string {
  return t(capabilityLabelKeys[capability]);
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
  const { dateLocale, t } = useI18n();
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
      setLocalError(t("accessDialog.reasonLength"));
      return;
    }
    if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
      setLocalError(t("accessDialog.invalidRange"));
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
            <span className="eyebrow">{t("accessDialog.eyebrow")}</span>
            <h2 id="access-dialog-title">{t("accessDialog.title")}</h2>
            <p>
              {user.name} · {user.email}
            </p>
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

        <div className="access-dialog__section">
          <div className="access-dialog__heading">
            <div>
              <strong>{t("accessDialog.current")}</strong>
              <span>{t("accessDialog.currentHint")}</span>
            </div>
            <span className="result-count">{user.restrictions.length}</span>
          </div>
          <div className="access-policy-list">
            {user.restrictions.length === 0 ? (
              <div className="subtle-box">{t("accessDialog.empty")}</div>
            ) : (
              user.restrictions.map((restriction) => (
                <article className="access-policy" key={restriction.id}>
                  <div>
                    <strong>
                      {capabilityLabel(restriction.capability, t)}
                    </strong>
                    <span>
                      {restriction.roomId
                        ? t("accessDialog.roomScope", {
                            room:
                              roomNames.get(restriction.roomId) ??
                              t("accessDialog.selectedRoom"),
                          })
                        : t("accessDialog.systemScope")}
                    </span>
                    <span>
                      {t("accessDialog.period", {
                        start: formatDate(
                          restriction.startsAt,
                          dateLocale,
                          t,
                        ),
                        end: formatDate(
                          restriction.expiresAt,
                          dateLocale,
                          t,
                        ),
                      })}
                    </span>
                    <p>{restriction.reason}</p>
                  </div>
                  <Button
                    size="small"
                    onClick={() => removeRestriction.mutate(restriction.id)}
                    disabled={pending}
                  >
                    {t("accessDialog.revoke")}
                  </Button>
                </article>
              ))
            )}
          </div>
        </div>

        <form className="form-stack access-dialog__section" onSubmit={submit}>
          <div className="access-dialog__heading">
            <div>
              <strong>{t("accessDialog.new")}</strong>
              <span>{t("accessDialog.newHint")}</span>
            </div>
          </div>
          <label className="field">
            <span>{t("accessDialog.capability")}</span>
            <select
              value={capability}
              onChange={(event) => {
                const next = event.target.value as Capability;
                setCapability(next);
                if (next === "ACCOUNT_LOGIN") setRoomId("");
              }}
            >
              {Object.keys(capabilityLabelKeys).map((value) => (
                <option value={value} key={value}>
                  {capabilityLabel(value as Capability, t)}
                </option>
              ))}
            </select>
            <small className="field-hint">
              {t(capabilityHintKeys[capability])}
            </small>
          </label>
          <label className="field">
            <span>{t("accessDialog.scope")}</span>
            <select
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              disabled={capability === "ACCOUNT_LOGIN"}
            >
              <option value="">{t("accessDialog.allRooms")}</option>
              {rooms.data?.rooms.map((room) => (
                <option value={room.id} key={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            {capability === "ACCOUNT_LOGIN" && (
              <small className="field-hint">
                {t("accessDialog.loginScopeHint")}
              </small>
            )}
          </label>
          <div className="form-grid">
            <label className="field">
              <span>{t("accessDialog.start")}</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
              <small className="field-hint">
                {t("accessDialog.startHint")}
              </small>
            </label>
            <label className="field">
              <span>{t("accessDialog.end")}</span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <small className="field-hint">{t("accessDialog.endHint")}</small>
            </label>
          </div>
          <label className="field">
            <span>{t("accessDialog.reason")}</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              placeholder={t("accessDialog.reasonPlaceholder")}
            />
          </label>
          {(localError || requestError) && (
            <div className="form-error" role="alert">
              {localError ||
                errorMessage(
                  requestError,
                  t,
                  "accessDialog.changeError",
                )}
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={pending || reason.trim().length < 3}
          >
            {createRestriction.isPending
              ? t("accessDialog.applying")
              : t("accessDialog.add")}
          </Button>
        </form>

        <div className="access-dialog__danger">
          <div>
            <strong>{t("accessDialog.revokeAllTitle")}</strong>
            <span>{t("accessDialog.revokeAllHint")}</span>
          </div>
          <label className="field access-dialog__danger-field">
            <span className="sr-only">{t("accessDialog.revokeAllTitle")}</span>
            <textarea
              value={revokeReason}
              onChange={(event) => setRevokeReason(event.target.value)}
              maxLength={300}
              placeholder={t("accessDialog.revokeAllPlaceholder")}
            />
          </label>
          <Button
            variant="danger"
            onClick={() => revokeAccess.mutate()}
            disabled={pending || revokeReason.trim().length < 3}
          >
            {t("accessDialog.revokeAll")}
          </Button>
        </div>

        <div className="modal__actions">
          <Button onClick={onClose} disabled={pending}>
            {t("close")}
          </Button>
        </div>
      </section>
    </ModalLayer>
  );
}

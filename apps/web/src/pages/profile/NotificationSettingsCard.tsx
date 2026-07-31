import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailIcon, TelegramIcon } from "../../components/Icons";
import {
  TelegramConnectDialog,
  type TelegramConnectInfo,
} from "../../components/TelegramConnectDialog";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/error-message";
import { useI18n } from "../../lib/i18n";
import type { User } from "../../types";
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationPreferences,
} from "./profile-types";
import { SecuritySection } from "./SecuritySection";

export function NotificationSettingsCard({ user }: { user: User }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [telegramConnect, setTelegramConnect] =
    useState<TelegramConnectInfo | null>(null);
  const [emailForm, setEmailForm] = useState({
    email: user.pendingEmail ?? user.email,
    currentPassword: "",
  });
  const preferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () =>
      api<NotificationPreferences>("/api/notifications/preferences"),
    refetchInterval: telegramConnect ? 1_500 : false,
  });
  const updatePreferences = useMutation({
    mutationFn: (next: {
      category: NotificationCategory;
      channel: NotificationChannel;
      enabled: boolean;
    }) =>
      api<NotificationPreferences>("/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify(next),
      }),
    onSuccess: (data) =>
      queryClient.setQueryData(["notification-preferences"], data),
  });
  const telegramLink = useMutation({
    mutationFn: () =>
      api<TelegramConnectInfo>("/api/notifications/telegram/link", {
        method: "POST",
      }),
    onSuccess: setTelegramConnect,
  });
  const disconnectTelegram = useMutation({
    mutationFn: () =>
      api<void>("/api/notifications/telegram", { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });
  const testTelegram = useMutation({
    mutationFn: () =>
      api<{ queued: boolean }>("/api/notifications/telegram/test", {
        method: "POST",
      }),
  });
  const changeEmail = useMutation({
    mutationFn: () =>
      api<{
        email: string;
        pendingEmail: string | null;
        verificationRequired: boolean;
      }>("/api/users/me/email-change", {
        method: "POST",
        body: JSON.stringify({
          email: emailForm.email,
          currentPassword: emailForm.currentPassword,
        }),
      }),
    onSuccess: ({ email, pendingEmail }) => {
      setEmailForm({ email: pendingEmail ?? email, currentPassword: "" });
      queryClient.setQueryData<{ user: User }>(["me"], (current) =>
        current ? { user: { ...current.user, email, pendingEmail } } : current,
      );
    },
  });

  useEffect(() => {
    if (telegramConnect && preferences.data?.telegramConnected) {
      setTelegramConnect(null);
    }
  }, [preferences.data?.telegramConnected, telegramConnect]);

  return (
    <>
      <section className="settings-card">
        <div className="settings-card__heading">
          <div>
            <h2>{t("notifications")}</h2>
            <p>{t("profile.notificationsHint")}</p>
          </div>
        </div>
        {preferences.data && (
          <div className="preference-list">
            <div className="integration-row">
              <div className="integration-row__identity">
                <span className="integration-row__icon" aria-hidden="true">
                  <MailIcon />
                </span>
                <div className="integration-row__copy">
                  <strong>Email</strong>
                  <span>{user.email}</span>
                  {(user.pendingEmail || changeEmail.data?.pendingEmail) && (
                    <small>
                      {t("profile.pendingEmail", {
                        email:
                          user.pendingEmail ??
                          changeEmail.data?.pendingEmail ??
                          "",
                      })}
                    </small>
                  )}
                </div>
              </div>
              <Button
                size="small"
                onClick={() => {
                  changeEmail.reset();
                  setShowEmailForm((visible) => !visible);
                }}
              >
                {showEmailForm ? t("close") : t("profile.change")}
              </Button>
            </div>
            {telegramLink.error && (
              <div className="form-error" role="alert">
                {errorMessage(
                  telegramLink.error,
                  t,
                  "profile.telegramConnectError",
                )}
              </div>
            )}
            {showEmailForm && (
              <form
                className="account-inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  changeEmail.mutate();
                }}
              >
                <label className="field">
                  <span>{t("profile.newEmail")}</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={emailForm.email}
                    onChange={(event) => {
                      changeEmail.reset();
                      setEmailForm({
                        ...emailForm,
                        email: event.target.value,
                      });
                    }}
                    required
                  />
                </label>
                <label className="field">
                  <span>{t("profile.currentPassword")}</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={emailForm.currentPassword}
                    onChange={(event) => {
                      changeEmail.reset();
                      setEmailForm({
                        ...emailForm,
                        currentPassword: event.target.value,
                      });
                    }}
                    required
                  />
                </label>
                {changeEmail.error && (
                  <div className="form-error" role="alert">
                    {errorMessage(changeEmail.error, t, "profile.emailError")}
                  </div>
                )}
                {changeEmail.isSuccess && (
                  <div className="form-success" role="status">
                    {changeEmail.data.verificationRequired
                      ? t("profile.emailQueued")
                      : t("profile.emailChanged")}
                  </div>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="small"
                  disabled={
                    changeEmail.isPending ||
                    !emailForm.email.trim() ||
                    !emailForm.currentPassword
                  }
                >
                  {changeEmail.isPending
                    ? t("profile.changingEmail")
                    : t("profile.confirmChange")}
                </Button>
              </form>
            )}
            <hr />
            <div className="integration-row">
              <div className="integration-row__identity">
                <span className="integration-row__icon" aria-hidden="true">
                  <TelegramIcon />
                </span>
                <div className="integration-row__copy">
                  <strong>Telegram</strong>
                  <span>
                    {preferences.data.telegramConnected
                      ? t("profile.telegramConnected")
                      : preferences.data.telegramAvailable
                        ? t("profile.telegramAvailable")
                        : t("profile.telegramUnavailable")}
                  </span>
                </div>
              </div>
              {preferences.data.telegramConnected ? (
                <div className="button-row button-row--tight">
                  <Button
                    size="small"
                    disabled={testTelegram.isPending}
                    onClick={() => {
                      testTelegram.reset();
                      testTelegram.mutate();
                    }}
                  >
                    {testTelegram.isPending
                      ? t("profile.telegramTesting")
                      : t("profile.telegramTest")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => disconnectTelegram.mutate()}
                  >
                    {t("profile.disconnect")}
                  </Button>
                </div>
              ) : (
                <Button
                  size="small"
                  disabled={
                    !preferences.data.telegramAvailable ||
                    telegramLink.isPending
                  }
                  onClick={() => telegramLink.mutate()}
                >
                  {t("profile.connect")}
                </Button>
              )}
            </div>
            {testTelegram.isSuccess && (
              <div className="form-success" role="status">
                {t("profile.telegramTestQueued")}
              </div>
            )}
            {testTelegram.error && (
              <div className="form-error" role="alert">
                {errorMessage(
                  testTelegram.error,
                  t,
                  "profile.telegramTestError",
                )}
              </div>
            )}
            <hr />
            <NotificationMatrix
              preferences={preferences.data}
              onChange={(category, channel, enabled) =>
                updatePreferences.mutate({ category, channel, enabled })
              }
            />
            <small>{t("profile.channelsHint")}</small>
            <hr />
            <SecuritySection />
          </div>
        )}
      </section>
      {telegramConnect && (
        <TelegramConnectDialog
          connection={telegramConnect}
          onClose={() => setTelegramConnect(null)}
        />
      )}
    </>
  );
}

function NotificationMatrix({
  preferences,
  onChange,
}: {
  preferences: NotificationPreferences;
  onChange: (
    category: NotificationCategory,
    channel: NotificationChannel,
    enabled: boolean,
  ) => void;
}) {
  const { t } = useI18n();
  const categories = [
    ["INVITATIONS", t("profile.invitations")],
    ["CHANGES", t("profile.changes")],
    ["REMINDERS", t("profile.reminders")],
    ["ACCESS", t("profile.access")],
  ] as const;

  return (
    <div className="notification-matrix">
      <div className="notification-matrix__header">
        <span>{t("profile.group")}</span>
        <span>{t("profile.app")}</span>
        <span>Email</span>
        <span>Telegram</span>
      </div>
      {categories.map(([category, label]) => (
        <div className="notification-matrix__row" key={category}>
          <strong>{label}</strong>
          {(["IN_APP", "EMAIL", "TELEGRAM"] as const).map((channel) => {
            const checked =
              preferences.subscriptions.find(
                (item) =>
                  item.category === category && item.channel === channel,
              )?.enabled ?? false;
            const disabled =
              channel === "TELEGRAM" &&
              (!preferences.telegramAvailable ||
                !preferences.telegramConnected);
            return (
              <label
                key={channel}
                title={
                  disabled
                    ? t("profile.connectTelegramFirst")
                    : `${label}: ${channel}`
                }
              >
                <span className="notification-channel-label">
                  {channel === "IN_APP"
                    ? t("profile.app")
                    : channel === "EMAIL"
                      ? "Email"
                      : "Telegram"}
                </span>
                <input
                  className="switch"
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(category, channel, event.target.checked)
                  }
                />
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}

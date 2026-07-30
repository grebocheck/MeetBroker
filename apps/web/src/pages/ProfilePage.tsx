import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { errorMessage } from "../lib/error-message";
import { useI18n } from "../lib/i18n";
import type { User } from "../types";
import { Avatar } from "../components/Avatar";
import {
  SearchSelect,
  type SearchSelectOption,
} from "../components/SearchSelect";
import { Button } from "../components/ui/Button";
import {
  TelegramConnectDialog,
  type TelegramConnectInfo,
} from "../components/TelegramConnectDialog";

type NotificationCategory = "INVITATIONS" | "CHANGES" | "REMINDERS" | "ACCESS";
type NotificationChannel = "IN_APP" | "EMAIL" | "TELEGRAM";

const fallbackTimeZones = [
  "Europe/Kyiv",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Warsaw",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

const currentTimeZoneAliases: Readonly<Record<string, string>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Godthab": "America/Nuuk",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

function normalizeTimeZone(value: string): string {
  return currentTimeZoneAliases[value] ?? value;
}

function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  const browserTimeZones =
    intl.supportedValuesOf?.("timeZone") ?? fallbackTimeZones;
  return Array.from(
    new Set([
      ...browserTimeZones.map(normalizeTimeZone),
      ...fallbackTimeZones.map(normalizeTimeZone),
    ]),
  ).sort((left, right) => left.localeCompare(right));
}

interface NotificationSubscription {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
}

interface Preferences {
  subscriptions: NotificationSubscription[];
  telegramConnected: boolean;
  telegramAvailable: boolean;
}

export function ProfilePage({ user }: { user: User }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [telegramConnect, setTelegramConnect] =
    useState<TelegramConnectInfo | null>(null);
  const [emailForm, setEmailForm] = useState({
    email: user.pendingEmail ?? user.email,
    currentPassword: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [profile, setProfile] = useState({
    name: user.name,
    bio: user.bio ?? "",
    avatarPreset: user.avatarPreset,
    timezone: normalizeTimeZone(
      user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
  });
  const timeZoneOptions = useMemo<SearchSelectOption[]>(() => {
    const zones = supportedTimeZones();
    if (profile.timezone && !zones.includes(profile.timezone)) {
      zones.unshift(profile.timezone);
    }
    return zones.map((zone) => ({
      value: zone,
      label: zone.replaceAll("_", " "),
    }));
  }, [profile.timezone]);
  const preferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api<Preferences>("/api/notifications/preferences"),
    refetchInterval: telegramConnect ? 1_500 : false,
  });
  const save = useMutation({
    mutationFn: () =>
      api<{ user: User }>("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          ...profile,
          avatarPreset: selectedPreset ?? undefined,
        }),
      }),
    onSuccess: ({ user: updated }) => {
      setSelectedPreset(null);
      queryClient.setQueryData(["me"], { user: updated });
      const resolved =
        updated.theme === "SYSTEM"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : updated.theme.toLowerCase();
      document.documentElement.dataset.theme = resolved;
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set("avatar", file);
      return api<{ avatarUrl: string }>("/api/users/me/avatar", {
        method: "POST",
        body: form,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
  const updatePreferences = useMutation({
    mutationFn: (next: {
      category: NotificationCategory;
      channel: NotificationChannel;
      enabled: boolean;
    }) =>
      api<Preferences>("/api/notifications/preferences", {
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
  useEffect(() => {
    if (telegramConnect && preferences.data?.telegramConnected) {
      setTelegramConnect(null);
    }
  }, [preferences.data?.telegramConnected, telegramConnect]);
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
  const changePassword = useMutation({
    mutationFn: () =>
      api<void>("/api/users/me/password-change", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      }),
    onSuccess: () =>
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <div className="page editorial-page profile-page" data-page-mark="IDENTITY">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("profile.eyebrow")}</span>
          <h1>{t("profile")}</h1>
          <p>{t("profile.subtitle")}</p>
        </div>
      </header>

      <div className="settings-layout">
        <section className="settings-card">
          <div className="settings-card__heading">
            <div>
              <h2>{t("profile.basic")}</h2>
              <p>{t("profile.basicHint")}</p>
            </div>
            <Avatar
              name={profile.name}
              preset={profile.avatarPreset}
              url={selectedPreset ? null : user.avatarUrl}
              size="lg"
            />
          </div>
          <form className="form-stack" onSubmit={submit}>
            <label className="field">
              <span>{t("profile.name")}</span>
              <input
                value={profile.name}
                maxLength={120}
                onChange={(event) =>
                  setProfile({ ...profile, name: event.target.value })
                }
                required
              />
            </label>
            <label className="field">
              <span>{t("profile.bio")}</span>
              <textarea
                value={profile.bio}
                maxLength={300}
                rows={4}
                placeholder={t("profile.bioPlaceholder")}
                onChange={(event) =>
                  setProfile({ ...profile, bio: event.target.value })
                }
              />
              <small>{profile.bio.length}/300</small>
            </label>
            <div className="field">
              <span>{t("profile.presetAvatar")}</span>
              <div className="avatar-picker">
                {Array.from({ length: 12 }, (_, index) => {
                  const preset = `avatar-${String(index + 1).padStart(2, "0")}`;
                  return (
                    <button
                      type="button"
                      key={preset}
                      className={
                        profile.avatarPreset === preset ? "is-selected" : ""
                      }
                      onClick={() => {
                        setProfile({ ...profile, avatarPreset: preset });
                        setSelectedPreset(preset);
                      }}
                      aria-label={t("profile.avatarLabel", {
                        number: index + 1,
                      })}
                    >
                      <Avatar name="" preset={preset} size="md" />
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="upload-box">
              <span>
                <strong>{t("profile.ownPhoto")}</strong>
                <small>{t("profile.photoHint")}</small>
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload.mutate(file);
                }}
              />
              <em>
                {upload.isPending
                  ? t("profile.processing")
                  : t("profile.chooseFile")}
              </em>
            </label>
            <div className="field">
              <span>{t("profile.timeZone")}</span>
              <SearchSelect
                value={profile.timezone}
                options={timeZoneOptions}
                searchPlaceholder={t("profile.timeZoneSearch")}
                emptyText={t("profile.timeZoneEmpty")}
                onChange={(timezone) => setProfile({ ...profile, timezone })}
              />
            </div>
            {(save.error || upload.error) && (
              <div className="form-error">
                {[save.error, upload.error]
                  .filter(Boolean)
                  .map((error) => errorMessage(error, t, "profile.saveError"))
                  .join(". ")}
              </div>
            )}
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? t("profile.saving") : t("profile.save")}
            </Button>
          </form>
        </section>

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
                <div>
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
                <div>
                  <strong>Telegram</strong>
                  <span>
                    {preferences.data.telegramConnected
                      ? t("profile.telegramConnected")
                      : preferences.data.telegramAvailable
                        ? t("profile.telegramAvailable")
                        : t("profile.telegramUnavailable")}
                  </span>
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
              <div className="notification-matrix">
                <div className="notification-matrix__header">
                  <span>{t("profile.group")}</span>
                  <span>{t("profile.app")}</span>
                  <span>Email</span>
                  <span>Telegram</span>
                </div>
                {(
                  [
                    ["INVITATIONS", t("profile.invitations")],
                    ["CHANGES", t("profile.changes")],
                    ["REMINDERS", t("profile.reminders")],
                    ["ACCESS", t("profile.access")],
                  ] as const
                ).map(([category, label]) => (
                  <div className="notification-matrix__row" key={category}>
                    <strong>{label}</strong>
                    {(["IN_APP", "EMAIL", "TELEGRAM"] as const).map(
                      (channel) => {
                        const checked =
                          preferences.data.subscriptions.find(
                            (item) =>
                              item.category === category &&
                              item.channel === channel,
                          )?.enabled ?? false;
                        const disabled =
                          channel === "TELEGRAM" &&
                          (!preferences.data.telegramAvailable ||
                            !preferences.data.telegramConnected);
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
                                updatePreferences.mutate({
                                  category,
                                  channel,
                                  enabled: event.target.checked,
                                })
                              }
                            />
                          </label>
                        );
                      },
                    )}
                  </div>
                ))}
              </div>
              <small>{t("profile.channelsHint")}</small>
              <hr />
              <div className="security-section">
                <div>
                  <h3>{t("profile.passwordTitle")}</h3>
                  <p>{t("profile.passwordHint")}</p>
                </div>
                <form
                  className="form-stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    changePassword.mutate();
                  }}
                >
                  <label className="field">
                    <span>{t("profile.currentPassword")}</span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={passwordForm.currentPassword}
                      onChange={(event) => {
                        changePassword.reset();
                        setPasswordForm({
                          ...passwordForm,
                          currentPassword: event.target.value,
                        });
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t("profile.newPassword")}</span>
                    <input
                      type="password"
                      minLength={8}
                      maxLength={72}
                      autoComplete="new-password"
                      value={passwordForm.newPassword}
                      onChange={(event) => {
                        changePassword.reset();
                        setPasswordForm({
                          ...passwordForm,
                          newPassword: event.target.value,
                        });
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t("profile.repeatPassword")}</span>
                    <input
                      type="password"
                      minLength={8}
                      maxLength={72}
                      autoComplete="new-password"
                      value={passwordForm.confirmPassword}
                      onChange={(event) => {
                        changePassword.reset();
                        setPasswordForm({
                          ...passwordForm,
                          confirmPassword: event.target.value,
                        });
                      }}
                      required
                    />
                    {passwordForm.confirmPassword &&
                      passwordForm.newPassword !==
                        passwordForm.confirmPassword && (
                        <small className="field-error">
                          {t("profile.passwordMismatch")}
                        </small>
                      )}
                  </label>
                  {changePassword.error && (
                    <div className="form-error" role="alert">
                      {errorMessage(
                        changePassword.error,
                        t,
                        "profile.passwordError",
                      )}
                    </div>
                  )}
                  {changePassword.isSuccess && (
                    <div className="form-success" role="status">
                      {t("profile.passwordSuccess")}
                    </div>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={
                      changePassword.isPending ||
                      passwordForm.newPassword.length < 8 ||
                      passwordForm.newPassword !== passwordForm.confirmPassword
                    }
                  >
                    {changePassword.isPending
                      ? t("profile.changing")
                      : t("profile.changePassword")}
                  </Button>
                </form>
              </div>
            </div>
          )}
        </section>
      </div>
      {telegramConnect && (
        <TelegramConnectDialog
          connection={telegramConnect}
          onClose={() => setTelegramConnect(null)}
        />
      )}
    </div>
  );
}

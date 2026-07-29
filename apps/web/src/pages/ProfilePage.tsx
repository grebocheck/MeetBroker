import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { User } from "../types";
import { Avatar } from "../components/Avatar";
import {
  SearchSelect,
  type SearchSelectOption
} from "../components/SearchSelect";
import { Button } from "../components/ui/Button";

type NotificationCategory =
  | "INVITATIONS"
  | "CHANGES"
  | "REMINDERS"
  | "ACCESS";
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
  "UTC"
];

function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  return intl.supportedValuesOf?.("timeZone") ?? fallbackTimeZones;
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
  const queryClient = useQueryClient();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailForm, setEmailForm] = useState({
    email: user.pendingEmail ?? user.email,
    currentPassword: ""
  });
  const [verificationToken, setVerificationToken] = useState<string | null>(
    null
  );
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [profile, setProfile] = useState({
    name: user.name,
    bio: user.bio ?? "",
    avatarPreset: user.avatarPreset,
    timezone:
      user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  const timeZoneOptions = useMemo<SearchSelectOption[]>(() => {
    const zones = supportedTimeZones();
    if (profile.timezone && !zones.includes(profile.timezone)) {
      zones.unshift(profile.timezone);
    }
    return zones.map((zone) => ({
      value: zone,
      label: zone.replaceAll("_", " ")
    }));
  }, [profile.timezone]);
  const preferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api<Preferences>("/api/notifications/preferences")
  });
  const save = useMutation({
    mutationFn: () =>
      api<{ user: User }>("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          ...profile,
          avatarPreset: selectedPreset ?? undefined
        })
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
    }
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set("avatar", file);
      return api<{ avatarUrl: string }>("/api/users/me/avatar", {
        method: "POST",
        body: form
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] })
  });
  const updatePreferences = useMutation({
    mutationFn: (next: {
      category: NotificationCategory;
      channel: NotificationChannel;
      enabled: boolean;
    }) =>
      api<Preferences>("/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify(next)
      }),
    onSuccess: (data) =>
      queryClient.setQueryData(["notification-preferences"], data)
  });
  const telegramLink = useMutation({
    mutationFn: () =>
      api<{ url: string }>("/api/notifications/telegram/link", {
        method: "POST"
      }),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer")
  });
  const disconnectTelegram = useMutation({
    mutationFn: () =>
      api<void>("/api/notifications/telegram", { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] })
  });
  const changeEmail = useMutation({
    mutationFn: () =>
      api<{ pendingEmail: string; verificationToken?: string }>(
        "/api/users/me/email-change",
        {
          method: "POST",
          body: JSON.stringify({
            email: emailForm.email,
            currentPassword: emailForm.currentPassword
          })
        }
      ),
    onSuccess: ({ pendingEmail, verificationToken: token }) => {
      setVerificationToken(token ?? null);
      setEmailForm({ email: pendingEmail, currentPassword: "" });
      queryClient.setQueryData<{ user: User }>(["me"], (current) =>
        current
          ? { user: { ...current.user, pendingEmail } }
          : current
      );
    }
  });
  const confirmEmail = useMutation({
    mutationFn: (token: string) =>
      api<void>("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token })
      }),
    onSuccess: async () => {
      setVerificationToken(null);
      setShowEmailForm(false);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  });
  const changePassword = useMutation({
    mutationFn: () =>
      api<void>("/api/users/me/password-change", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      }),
    onSuccess: () =>
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      })
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <div className="page narrow-page profile-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Особисті налаштування</span>
          <h1>Профіль</h1>
          <p>Так вас бачитимуть колеги у бронюваннях і відкритих подіях.</p>
        </div>
      </header>

      <div className="settings-layout">
        <section className="settings-card">
          <div className="settings-card__heading">
            <div>
              <h2>Основна інформація</h2>
              <p>Коротко й доречно для внутрішнього каталогу.</p>
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
              <span>Ім’я</span>
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
              <span>Короткий опис</span>
              <textarea
                value={profile.bio}
                maxLength={300}
                rows={4}
                placeholder="Чим займаєтесь і з чим до вас можна звернутися"
                onChange={(event) =>
                  setProfile({ ...profile, bio: event.target.value })
                }
              />
              <small>{profile.bio.length}/300</small>
            </label>
            <div className="field">
              <span>Готовий аватар</span>
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
                      onClick={() =>
                        {
                          setProfile({ ...profile, avatarPreset: preset });
                          setSelectedPreset(preset);
                        }
                      }
                      aria-label={`Аватар ${index + 1}`}
                    >
                      <Avatar name="" preset={preset} size="md" />
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="upload-box">
              <span>
                <strong>Або власне фото</strong>
                <small>JPG, PNG чи WebP — автоматично обріжемо й оптимізуємо</small>
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload.mutate(file);
                }}
              />
              <em>{upload.isPending ? "Обробляємо…" : "Обрати файл"}</em>
            </label>
            <div className="field">
              <span>Часовий пояс</span>
              <SearchSelect
                value={profile.timezone}
                options={timeZoneOptions}
                searchPlaceholder="Пошук міста або часового поясу…"
                emptyText="Часовий пояс не знайдено"
                onChange={(timezone) =>
                  setProfile({ ...profile, timezone })
                }
              />
            </div>
            {(save.error || upload.error) && (
              <div className="form-error">
                {[save.error, upload.error]
                  .filter(Boolean)
                  .map((error) =>
                    error instanceof ApiError ? error.message : "Не вдалося зберегти"
                  )
                  .join(". ")}
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={save.isPending}
            >
              {save.isPending ? "Зберігаємо…" : "Зберегти профіль"}
            </Button>
          </form>
        </section>

        <section className="settings-card">
          <div className="settings-card__heading">
            <div>
              <h2>Сповіщення</h2>
              <p>Оберіть, де й про що повідомляти.</p>
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
                      Очікує підтвердження:{" "}
                      {user.pendingEmail ?? changeEmail.data?.pendingEmail}
                    </small>
                  )}
                </div>
                <Button
                  size="small"
                  onClick={() => {
                    changeEmail.reset();
                    confirmEmail.reset();
                    setShowEmailForm((visible) => !visible);
                  }}
                >
                  {showEmailForm ? "Закрити" : "Змінити"}
                </Button>
              </div>
              {showEmailForm && (
                <form
                  className="account-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    changeEmail.mutate();
                  }}
                >
                  <label className="field">
                    <span>Нова email-адреса</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={emailForm.email}
                      onChange={(event) => {
                        changeEmail.reset();
                        setEmailForm({
                          ...emailForm,
                          email: event.target.value
                        });
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Поточний пароль</span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={emailForm.currentPassword}
                      onChange={(event) => {
                        changeEmail.reset();
                        setEmailForm({
                          ...emailForm,
                          currentPassword: event.target.value
                        });
                      }}
                      required
                    />
                  </label>
                  {changeEmail.error && (
                    <div className="form-error" role="alert">
                      {changeEmail.error instanceof ApiError
                        ? changeEmail.error.message
                        : "Не вдалося змінити email"}
                    </div>
                  )}
                  {changeEmail.isSuccess && (
                    <div className="form-success" role="status">
                      Надіслано підтвердження на нову адресу.
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
                      ? "Надсилаємо…"
                      : "Підтвердити зміну"}
                  </Button>
                  {verificationToken && (
                    <div className="dev-verification">
                      <small>
                        Demo-режим: підтвердження доступне одразу без поштового
                        сервера.
                      </small>
                      <Button
                        size="small"
                        onClick={() => confirmEmail.mutate(verificationToken)}
                        disabled={confirmEmail.isPending}
                      >
                        {confirmEmail.isPending
                          ? "Підтверджуємо…"
                          : "Підтвердити email"}
                      </Button>
                    </div>
                  )}
                </form>
              )}
              <hr />
              <div className="integration-row">
                <div>
                  <strong>Telegram</strong>
                  <span>
                    {preferences.data.telegramConnected
                      ? "Бот підключено"
                      : preferences.data.telegramAvailable
                        ? "Отримуйте запрошення в один дотик"
                        : "Бот не налаштований для цієї компанії"}
                  </span>
                </div>
                {preferences.data.telegramConnected ? (
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => disconnectTelegram.mutate()}
                  >
                    Від’єднати
                  </Button>
                ) : (
                  <Button
                    size="small"
                    disabled={
                      !preferences.data.telegramAvailable ||
                      telegramLink.isPending
                    }
                    onClick={() => telegramLink.mutate()}
                  >
                    Підключити
                  </Button>
                )}
              </div>
              <hr />
              <div className="notification-matrix">
                <div className="notification-matrix__header">
                  <span>Група</span>
                  <span>Застосунок</span>
                  <span>Email</span>
                  <span>Telegram</span>
                </div>
                {(
                  [
                    ["INVITATIONS", "Нові запрошення"],
                    ["CHANGES", "Зміни й скасування"],
                    ["REMINDERS", "Нагадування"],
                    ["ACCESS", "Доступ і безпека"]
                  ] as const
                ).map(([category, label]) => (
                  <div className="notification-matrix__row" key={category}>
                    <strong>{label}</strong>
                    {(
                      ["IN_APP", "EMAIL", "TELEGRAM"] as const
                    ).map((channel) => {
                      const checked =
                        preferences.data.subscriptions.find(
                          (item) =>
                            item.category === category &&
                            item.channel === channel
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
                              ? "Спочатку підключіть Telegram"
                              : `${label}: ${channel}`
                          }
                        >
                          <span className="notification-channel-label">
                            {channel === "IN_APP"
                              ? "Застосунок"
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
                                enabled: event.target.checked
                              })
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
              <small>
                Канали налаштовуються незалежно: наприклад, запрошення можна
                отримувати в Telegram, а нагадування — лише в застосунку.
              </small>
              <hr />
              <div className="security-section">
                <div>
                  <h3>Зміна пароля</h3>
                  <p>
                    Після зміни інші активні сесії буде завершено автоматично.
                  </p>
                </div>
                <form
                  className="form-stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    changePassword.mutate();
                  }}
                >
                  <label className="field">
                    <span>Поточний пароль</span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={passwordForm.currentPassword}
                      onChange={(event) => {
                        changePassword.reset();
                        setPasswordForm({
                          ...passwordForm,
                          currentPassword: event.target.value
                        });
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Новий пароль</span>
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
                          newPassword: event.target.value
                        });
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Повторіть новий пароль</span>
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
                          confirmPassword: event.target.value
                        });
                      }}
                      required
                    />
                    {passwordForm.confirmPassword &&
                      passwordForm.newPassword !==
                        passwordForm.confirmPassword && (
                        <small className="field-error">
                          Паролі не збігаються
                        </small>
                      )}
                  </label>
                  {changePassword.error && (
                    <div className="form-error" role="alert">
                      {changePassword.error instanceof ApiError
                        ? changePassword.error.message
                        : "Не вдалося змінити пароль"}
                    </div>
                  )}
                  {changePassword.isSuccess && (
                    <div className="form-success" role="status">
                      Пароль успішно змінено.
                    </div>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={
                      changePassword.isPending ||
                      passwordForm.newPassword.length < 8 ||
                      passwordForm.newPassword !==
                        passwordForm.confirmPassword
                    }
                  >
                    {changePassword.isPending
                      ? "Змінюємо…"
                      : "Змінити пароль"}
                  </Button>
                </form>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

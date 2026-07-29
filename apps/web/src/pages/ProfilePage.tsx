import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Theme, User } from "../types";
import { Avatar } from "../components/Avatar";

type NotificationCategory =
  | "INVITATIONS"
  | "CHANGES"
  | "REMINDERS"
  | "ACCESS";
type NotificationChannel = "IN_APP" | "EMAIL" | "TELEGRAM";

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
  const [profile, setProfile] = useState({
    name: user.name,
    bio: user.bio ?? "",
    avatarPreset: user.avatarPreset,
    locale: user.locale,
    theme: user.theme,
    timezone:
      user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  });
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
                <small>JPG, PNG чи WebP до 2 МБ</small>
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
            <div className="form-grid">
              <label className="field">
                <span>Мова</span>
                <select
                  value={profile.locale}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      locale: event.target.value as "uk" | "en"
                    })
                  }
                >
                  <option value="uk">Українська</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="field">
                <span>Тема</span>
                <select
                  value={profile.theme}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      theme: event.target.value as Theme
                    })
                  }
                >
                  <option value="SYSTEM">Як у системі</option>
                  <option value="LIGHT">Світла</option>
                  <option value="DARK">Темна</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Часовий пояс</span>
              <input
                value={profile.timezone}
                onChange={(event) =>
                  setProfile({ ...profile, timezone: event.target.value })
                }
              />
            </label>
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
            <button
              className="button button--primary"
              disabled={save.isPending}
            >
              {save.isPending ? "Зберігаємо…" : "Зберегти профіль"}
            </button>
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
                  <button
                    className="button button--ghost button--small"
                    onClick={() => disconnectTelegram.mutate()}
                  >
                    Від’єднати
                  </button>
                ) : (
                  <button
                    className="button button--secondary button--small"
                    disabled={
                      !preferences.data.telegramAvailable ||
                      telegramLink.isPending
                    }
                    onClick={() => telegramLink.mutate()}
                  >
                    Підключити
                  </button>
                )}
              </div>
              <hr />
              <div className="notification-matrix">
                <div className="notification-matrix__header">
                  <span>Група</span>
                  <span>У застосунку</span>
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
                отримувати в Telegram, а нагадування — лише у застосунку.
              </small>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

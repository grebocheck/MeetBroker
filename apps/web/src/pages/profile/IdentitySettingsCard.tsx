import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "../../components/Avatar";
import { SearchSelect } from "../../components/SearchSelect";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/error-message";
import { useI18n } from "../../lib/i18n";
import type { User } from "../../types";
import { normalizeTimeZone, timeZoneOptions } from "./time-zones";

export function IdentitySettingsCard({ user }: { user: User }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    name: user.name,
    bio: user.bio ?? "",
    avatarPreset: user.avatarPreset,
    timezone: normalizeTimeZone(
      user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
  });
  const options = useMemo(
    () => timeZoneOptions(profile.timezone),
    [profile.timezone],
  );
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
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
            options={options}
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
  );
}

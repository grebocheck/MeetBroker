import { useI18n } from "../lib/i18n";
import type { User } from "../types";
import { IdentitySettingsCard } from "./profile/IdentitySettingsCard";
import { NotificationSettingsCard } from "./profile/NotificationSettingsCard";

export function ProfilePage({ user }: { user: User }) {
  const { t } = useI18n();

  return (
    <div
      className="page editorial-page profile-page"
      data-page-mark={t("marks.identity")}
    >
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("profile.eyebrow")}</span>
          <h1>{t("profile")}</h1>
          <p>{t("profile.subtitle")}</p>
        </div>
      </header>

      <div className="settings-layout">
        <IdentitySettingsCard user={user} />
        <NotificationSettingsCard user={user} />
      </div>
    </div>
  );
}

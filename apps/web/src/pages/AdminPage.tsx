import { useState } from "react";
import { useI18n } from "../lib/i18n";
import { AuditAdmin } from "./admin/AuditAdmin";
import { BookingsAdmin } from "./admin/BookingsAdmin";
import { DeliveriesAdmin } from "./admin/DeliveriesAdmin";
import { RoomsAdmin } from "./admin/RoomsAdmin";
import { UsersAdmin } from "./admin/UsersAdmin";

export function AdminPage() {
  const { t } = useI18n();
  const [section, setSection] = useState<
    "users" | "bookings" | "rooms" | "deliveries" | "audit"
  >("users");
  const sections = [
    ["users", "01", t("admin.users")],
    ["bookings", "02", t("admin.bookings")],
    ["rooms", "03", t("admin.rooms")],
    ["deliveries", "04", t("admin.deliveries")],
    ["audit", "05", t("admin.audit")],
  ] as const;
  const activeSection = sections.find(([value]) => value === section);

  return (
    <div
      className="page editorial-page admin-page"
      data-page-mark={t("marks.control")}
    >
      <header className="page-header admin-hero">
        <div>
          <span className="eyebrow">{t("admin.eyebrow")}</span>
          <h1>{t("administration")}</h1>
          <p>{t("admin.subtitle")}</p>
        </div>
        <div className="admin-hero__status" aria-hidden="true">
          <span>{t("marks.control")}</span>
          <strong>{t("shell.admin")} · 05</strong>
        </div>
      </header>
      <nav className="admin-section-tabs" aria-label={t("administration")}>
        {sections.map(([value, index, label]) => (
          <button
            className={section === value ? "is-active" : ""}
            onClick={() => setSection(value)}
            aria-current={section === value ? "page" : undefined}
            key={value}
          >
            <span>{index}</span>
            <strong>{label}</strong>
          </button>
        ))}
      </nav>
      <div className={`admin-workspace admin-workspace--${section}`}>
        <div className="admin-workspace__caption" aria-hidden="true">
          <span>{t("stage.admin")}</span>
          <strong>
            {activeSection?.[1]} · {activeSection?.[2]}
          </strong>
        </div>
        <div className="admin-workspace__content">
          {section === "users" && <UsersAdmin />}
          {section === "bookings" && <BookingsAdmin />}
          {section === "rooms" && <RoomsAdmin />}
          {section === "deliveries" && <DeliveriesAdmin />}
          {section === "audit" && <AuditAdmin />}
        </div>
      </div>
    </div>
  );
}

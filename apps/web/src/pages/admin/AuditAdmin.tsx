import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { Pagination } from "../../components/ui/Pagination";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/error-message";
import { useI18n } from "../../lib/i18n";
import {
  formatActivityValue,
  humanizeAction,
  humanizeDetailKey,
  humanizeTarget,
} from "./admin-formatters";

interface AuditLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function AuditAdmin() {
  const { dateLocale, t } = useI18n();
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ category });
  if (search) query.set("search", search);
  query.set("page", String(page));
  query.set("limit", "25");
  const logs = useQuery({
    queryKey: ["audit", category, search, page],
    queryFn: () =>
      api<{ logs: AuditLog[]; pagination: PaginationMeta }>(
        `/api/admin/audit?${query.toString()}`,
      ),
    placeholderData: (previousData) => previousData,
  });

  return (
    <section className="admin-card">
      <div className="admin-card__toolbar activity-toolbar">
        <div>
          <span className="eyebrow">{t("admin.auditEyebrow")}</span>
          <h2>{t("admin.audit")}</h2>
          <p>{t("admin.auditSubtitle")}</p>
        </div>
        <div className="segmented">
          {[
            ["", t("admin.all")],
            ["booking", t("admin.bookings")],
            ["access", t("admin.access")],
            ["room", t("admin.rooms")],
          ].map(([value, label]) => (
            <button
              key={value}
              className={category === value ? "is-active" : ""}
              onClick={() => {
                setCategory(value);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          className="admin-booking-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <label className="field">
            <span className="sr-only">{t("admin.searchAudit")}</span>
            <input
              type="search"
              placeholder={t("admin.auditSearchPlaceholder")}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <Button type="submit" size="small">
            {t("admin.search")}
          </Button>
        </form>
      </div>

      {logs.isLoading ? (
        <div className="subtle-box">{t("admin.loadingAudit")}</div>
      ) : logs.error ? (
        <div className="form-error">
          {errorMessage(logs.error, t, "admin.auditLoadError")}
        </div>
      ) : logs.data?.logs.length === 0 ? (
        <div className="empty-inline">{t("admin.auditEmpty")}</div>
      ) : (
        <>
          <div className="activity-list">
            {logs.data?.logs.map((log) => (
              <article className="activity-row" key={log.id}>
                <time dateTime={log.createdAt}>
                  {new Intl.DateTimeFormat(dateLocale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(log.createdAt))}
                </time>
                <div className="activity-row__main">
                  <strong>{humanizeAction(log.action, t)}</strong>
                  <span>
                    {log.targetName ?? humanizeTarget(log.targetType, t)}
                    {" · "}
                    {log.actorName ?? t("admin.system")}
                    {log.actorEmail ? ` (${log.actorEmail})` : ""}
                  </span>
                </div>
                <span
                  className={`status-badge ${
                    log.action.includes("ADMIN") ? "status-badge--warning" : ""
                  }`}
                >
                  {log.action.includes("ADMIN")
                    ? t("shell.admin")
                    : humanizeTarget(log.targetType, t)}
                </span>
                {Object.keys(log.details ?? {}).length > 0 && (
                  <details className="activity-details">
                    <summary>{t("admin.details")}</summary>
                    <dl>
                      {Object.entries(log.details).map(([key, value]) => (
                        <div key={key}>
                          <dt>{humanizeDetailKey(key, t)}</dt>
                          <dd>{formatActivityValue(value, dateLocale, t)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </article>
            ))}
          </div>
          {logs.data && (
            <Pagination
              page={logs.data.pagination.page}
              totalPages={logs.data.pagination.totalPages}
              total={logs.data.pagination.total}
              itemLabel={t("admin.auditItems")}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}

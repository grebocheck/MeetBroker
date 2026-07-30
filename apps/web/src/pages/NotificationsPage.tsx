import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/Button";
import { Pagination } from "../components/ui/Pagination";
import { api } from "../lib/api";
import { errorMessage } from "../lib/error-message";
import { useI18n } from "../lib/i18n";
import { navigate } from "../lib/router";
import type { NotificationItem, NotificationsResponse } from "../types";

export function NotificationsPage() {
  const { dateLocale, t } = useI18n();
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications", page],
    queryFn: () =>
      api<NotificationsResponse>(`/api/notifications?page=${page}&limit=12`),
    placeholderData: (previousData) => previousData,
  });
  const read = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const readAll = useMutation({
    mutationFn: () =>
      api<void>("/api/notifications/read-all", { method: "PATCH" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markRead = (item: NotificationItem) => {
    if (!item.read && !read.isPending) {
      read.reset();
      read.mutate(item.id);
    }
  };
  const actionError = read.error ?? readAll.error;

  return (
    <div
      className="page editorial-page notifications-page"
      data-page-mark={t("marks.log")}
    >
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("notifications.eyebrow")}</span>
          <h1>{t("notifications")}</h1>
          <p>{t("notifications.subtitle")}</p>
        </div>
        <div className="page-header__actions">
          <Button
            variant="ghost"
            size="small"
            disabled={!notifications.data?.unreadCount || readAll.isPending}
            onClick={() => {
              read.reset();
              readAll.reset();
              readAll.mutate();
            }}
          >
            {readAll.isPending
              ? t("notifications.marking")
              : t("notifications.readAll")}
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => navigate("/profile?section=notifications")}
          >
            {t("notifications.configure")}
          </Button>
        </div>
      </header>
      {notifications.isLoading ? (
        <div className="list-skeleton">
          <div>
            <i />
            <span />
            <span />
          </div>
          <div>
            <i />
            <span />
            <span />
          </div>
        </div>
      ) : notifications.isError ? (
        <div className="state-panel state-panel--error">
          <strong>{t("notifications.loadError")}</strong>
          <span>
            {errorMessage(notifications.error, t, "notifications.loadError")}
          </span>
          <Button
            variant="secondary"
            size="small"
            onClick={() => notifications.refetch()}
          >
            {t("retry")}
          </Button>
        </div>
      ) : notifications.data?.notifications.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">✓</span>
          <h2>{t("notifications.emptyTitle")}</h2>
          <p>{t("notifications.emptyBody")}</p>
        </div>
      ) : (
        <>
          {actionError && (
            <div className="form-error" role="alert">
              {errorMessage(actionError, t, "notifications.actionError")}
            </div>
          )}
          <div className="notification-list">
            {notifications.data?.notifications.map((item) => (
              <article
                key={item.id}
                className={`notification-row${item.read ? "" : " is-unread"}`}
              >
                <button
                  type="button"
                  className="notification-row__read"
                  aria-label={
                    item.read
                      ? t("notifications.readLabel", { title: item.title })
                      : t("notifications.markReadLabel", { title: item.title })
                  }
                  onClick={() => markRead(item)}
                >
                  <span className="notification-row__dot" />
                  <span className="notification-row__copy">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <small>
                      {new Intl.DateTimeFormat(dateLocale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.createdAt))}
                    </small>
                  </span>
                </button>
                {item.bookingId && (
                  <Button
                    variant="secondary"
                    size="small"
                    className="notification-row__action"
                    onClick={() => {
                      markRead(item);
                      navigate("/bookings");
                    }}
                  >
                    {t("notifications.goToBooking")}
                  </Button>
                )}
              </article>
            ))}
          </div>
          {notifications.data && (
            <Pagination
              page={notifications.data.pagination.page}
              totalPages={notifications.data.pagination.totalPages}
              total={notifications.data.pagination.total}
              itemLabel={t("notifications.itemLabel")}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/Button";
import { Pagination } from "../components/ui/Pagination";
import { api } from "../lib/api";
import { navigate } from "../lib/router";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  bookingId: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications", page],
    queryFn: () =>
      api<NotificationsResponse>(`/api/notifications?page=${page}&limit=12`),
    placeholderData: (previousData) => previousData
  });
  const read = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });
  const readAll = useMutation({
    mutationFn: () =>
      api<void>("/api/notifications/read-all", { method: "PATCH" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });

  const markRead = (item: NotificationItem) => {
    if (!item.read && !read.isPending) read.mutate(item.id);
  };

  return (
    <div className="page narrow-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Будьте в курсі</span>
          <h1>Сповіщення</h1>
          <p>Запрошення, зміни й важливі нагадування в одному місці.</p>
        </div>
        <div className="page-header__actions">
          <Button
            variant="ghost"
            size="small"
            disabled={
              !notifications.data?.unreadCount || readAll.isPending
            }
            onClick={() => readAll.mutate()}
          >
            {readAll.isPending ? "Позначаємо…" : "Прочитати всі"}
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => navigate("/profile?section=notifications")}
          >
            Налаштувати канали
          </Button>
        </div>
      </header>
      {notifications.isLoading ? (
        <div className="list-skeleton">
          <div><i /><span /><span /></div>
          <div><i /><span /><span /></div>
        </div>
      ) : notifications.data?.notifications.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">✓</span>
          <h2>Усе переглянуто</h2>
          <p>Нові запрошення й зміни з’являться тут.</p>
        </div>
      ) : (
        <>
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
                      ? `${item.title}. Прочитане сповіщення`
                      : `${item.title}. Позначити як прочитане`
                  }
                  onClick={() => markRead(item)}
                >
                  <span className="notification-row__dot" />
                  <span className="notification-row__copy">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <small>
                      {new Intl.DateTimeFormat("uk-UA", {
                        dateStyle: "medium",
                        timeStyle: "short"
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
                    До бронювання
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
              itemLabel="сповіщень"
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}

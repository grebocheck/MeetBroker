import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api<{ notifications: NotificationItem[] }>("/api/notifications")
  });
  const read = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });

  return (
    <div className="page narrow-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Будьте в курсі</span>
          <h1>Сповіщення</h1>
          <p>Запрошення, зміни й важливі нагадування в одному місці.</p>
        </div>
        <button
          className="button button--secondary"
          onClick={() => navigate("/profile?section=notifications")}
        >
          Налаштувати канали
        </button>
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
        <div className="notification-list">
          {notifications.data?.notifications.map((item) => (
            <button
              key={item.id}
              className={`notification-row${item.read ? "" : " is-unread"}`}
              onClick={() => {
                if (!item.read) read.mutate(item.id);
                if (item.bookingId) navigate("/bookings");
              }}
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
          ))}
        </div>
      )}
    </div>
  );
}

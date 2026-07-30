import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { errorMessage } from "../lib/error-message";
import { useI18n } from "../lib/i18n";
import type { User } from "../types";

interface OpenEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  meetingType: "ROOM" | "ONLINE";
  meetingUrl: string | null;
  imageUrl: string | null;
  room: { id: string; name: string; capacity: number } | null;
  organizer: { id: string; name: string };
  participantCount: number;
  myStatus: string | null;
}

export function EventsPage({ user }: { user: User }) {
  const { dateLocale, t } = useI18n();
  const queryClient = useQueryClient();
  const events = useQuery({
    queryKey: ["open-events"],
    queryFn: () => api<{ events: OpenEvent[] }>("/api/bookings/open"),
  });
  const participation = useMutation({
    mutationFn: ({ id, join }: { id: string; join: boolean }) =>
      api<void>(`/api/bookings/${id}/join`, {
        method: join ? "POST" : "DELETE",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["open-events"] }),
  });

  return (
    <div
      className="page editorial-page events-page"
      data-page-mark={t("marks.events")}
    >
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("events.eyebrow")}</span>
          <h1>{t("openEvents")}</h1>
          <p>{t("events.subtitle")}</p>
        </div>
      </header>
      {events.isLoading ? (
        <ListSkeleton />
      ) : events.isError ? (
        <div className="state-panel state-panel--error">
          <strong>{t("events.loadError")}</strong>
          <span>{errorMessage(events.error, t, "events.loadError")}</span>
        </div>
      ) : events.data?.events.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">◇</span>
          <h2>{t("events.emptyTitle")}</h2>
          <p>{t("events.emptyBody")}</p>
        </div>
      ) : (
        <div className="event-grid">
          {events.data?.events.map((event) => {
            const joined = event.myStatus === "ACCEPTED";
            const own = event.organizer.id === user.id;
            const capacity = event.room?.capacity ?? 51;
            const full = event.participantCount >= capacity;
            return (
              <article className="event-card" key={event.id}>
                <div className="event-card__accent" />
                {event.imageUrl && (
                  <div
                    className="event-card__visual"
                    style={{ backgroundImage: `url("${event.imageUrl}")` }}
                    role="img"
                    aria-label={event.title}
                  />
                )}
                <div className="event-card__date">
                  <span>
                    {new Intl.DateTimeFormat(dateLocale, {
                      weekday: "long",
                    }).format(new Date(event.startsAt))}
                  </span>
                  <strong>
                    {new Intl.DateTimeFormat(dateLocale, {
                      day: "numeric",
                      month: "long",
                    }).format(new Date(event.startsAt))}
                  </strong>
                </div>
                <h2>{event.title}</h2>
                <p>
                  {new Intl.DateTimeFormat(dateLocale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(event.startsAt))}
                  {" · "}
                  {event.room?.name ?? t("booking.onlineMeeting")}
                </p>
                <div className="event-card__meta">
                  <span>
                    {t("events.organizer", { name: event.organizer.name })}
                  </span>
                  <span>
                    {t("events.participants", {
                      current: event.participantCount,
                      capacity,
                    })}
                  </span>
                </div>
                {own ? (
                  <span className="status-badge status-badge--own">
                    {t("events.own")}
                  </span>
                ) : (
                  <button
                    className={`button ${
                      joined ? "button--secondary" : "button--primary"
                    } button--wide`}
                    disabled={participation.isPending || (!joined && full)}
                    onClick={() =>
                      participation.mutate({ id: event.id, join: !joined })
                    }
                  >
                    {joined
                      ? t("events.leave")
                      : full
                        ? t("events.full")
                        : t("events.join")}
                  </button>
                )}
                {event.meetingUrl && (
                  <a
                    className="button button--secondary button--wide"
                    href={event.meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("meetings.join")}
                  </a>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="event-grid">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="event-card skeleton-card" key={index} />
      ))}
    </div>
  );
}

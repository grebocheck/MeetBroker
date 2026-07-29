import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { User } from "../types";

interface OpenEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  room: { id: string; name: string; capacity: number };
  organizer: { id: string; name: string };
  participantCount: number;
  myStatus: string | null;
}

export function EventsPage({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const events = useQuery({
    queryKey: ["open-events"],
    queryFn: () => api<{ events: OpenEvent[] }>("/api/bookings/open")
  });
  const participation = useMutation({
    mutationFn: ({
      id,
      join
    }: {
      id: string;
      join: boolean;
    }) =>
      api<void>(`/api/bookings/${id}/join`, {
        method: join ? "POST" : "DELETE"
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["open-events"] })
  });

  return (
    <div className="page narrow-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Долучайтеся вільно</span>
          <h1>Відкриті події</h1>
          <p>
            Зустрічі, презентації та обговорення, відкриті для всієї команди.
          </p>
        </div>
      </header>
      {events.isLoading ? (
        <ListSkeleton />
      ) : events.isError ? (
        <div className="state-panel state-panel--error">
          <strong>Не вдалося завантажити події</strong>
          <span>
            {events.error instanceof ApiError
              ? events.error.message
              : "Спробуйте пізніше"}
          </span>
        </div>
      ) : events.data?.events.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">◇</span>
          <h2>Нових відкритих подій поки немає</h2>
          <p>Коли колеги створять відкриту зустріч, вона з’явиться тут.</p>
        </div>
      ) : (
        <div className="event-grid">
          {events.data?.events.map((event) => {
            const joined = event.myStatus === "ACCEPTED";
            const own = event.organizer.id === user.id;
            const full = event.participantCount >= event.room.capacity;
            return (
              <article className="event-card" key={event.id}>
                <div className="event-card__accent" />
                <div className="event-card__date">
                  <span>
                    {new Intl.DateTimeFormat("uk-UA", {
                      weekday: "long"
                    }).format(new Date(event.startsAt))}
                  </span>
                  <strong>
                    {new Intl.DateTimeFormat("uk-UA", {
                      day: "numeric",
                      month: "long"
                    }).format(new Date(event.startsAt))}
                  </strong>
                </div>
                <h2>{event.title}</h2>
                <p>
                  {new Intl.DateTimeFormat("uk-UA", {
                    hour: "2-digit",
                    minute: "2-digit"
                  }).format(new Date(event.startsAt))}
                  {" · "}
                  {event.room.name}
                </p>
                <div className="event-card__meta">
                  <span>Організатор: {event.organizer.name}</span>
                  <span>
                    {event.participantCount}/{event.room.capacity} учасників
                  </span>
                </div>
                {own ? (
                  <span className="status-badge status-badge--own">
                    Ваша подія
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
                      ? "Не братиму участі"
                      : full
                        ? "Усі місця зайняті"
                        : "Приєднатися"}
                  </button>
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

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/Button";
import { Pagination } from "../components/ui/Pagination";
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

interface OpenEventsPage {
  events: OpenEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function EventsPage({ user }: { user: User }) {
  const { dateLocale, t } = useI18n();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const query = new URLSearchParams({
    page: String(page),
    limit: "12",
  });
  if (search) query.set("search", search);
  const events = useQuery({
    queryKey: ["open-events", search, page],
    queryFn: () =>
      api<OpenEventsPage>(`/api/bookings/open?${query.toString()}`),
    placeholderData: (previousData) => previousData,
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
      <div className="events-toolbar">
        <form
          className="events-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <label className="field">
            <span className="sr-only">{t("events.search")}</span>
            <input
              type="search"
              maxLength={160}
              placeholder={t("events.searchPlaceholder")}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <Button type="submit" size="small" variant="primary">
            {t("events.search")}
          </Button>
        </form>
        <span className="result-count">
          {t("events.count", {
            count: events.data?.pagination.total ?? 0,
          })}
        </span>
      </div>
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
          <h2>
            {search ? t("events.emptySearchTitle") : t("events.emptyTitle")}
          </h2>
          <p>{search ? t("events.emptySearchBody") : t("events.emptyBody")}</p>
        </div>
      ) : (
        <>
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
          <Pagination
            page={events.data!.pagination.page}
            totalPages={events.data!.pagination.totalPages}
            total={events.data!.pagination.total}
            onPageChange={setPage}
            itemLabel={t("events.itemLabel")}
          />
        </>
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

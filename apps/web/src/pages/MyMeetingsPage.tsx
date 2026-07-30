import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { errorMessage } from "../lib/error-message";
import { useI18n } from "../lib/i18n";
import type {
  MyMeeting,
  MyMeetingsCalendar,
  Room,
  User,
} from "../types";
import { BookingDialog } from "../components/BookingDialog";
import { Button } from "../components/ui/Button";
import { ModalLayer } from "../components/ui/ModalLayer";

const DAY_COUNT = 6;

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function sameDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function MyMeetingsPage({ user }: { user: User }) {
  const { dateLocale, t } = useI18n();
  const queryClient = useQueryClient();
  const timeZone =
    user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [reference, setReference] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<MyMeeting | null>(null);
  const [editing, setEditing] = useState<MyMeeting | null>(null);
  const [creatingOnline, setCreatingOnline] = useState(false);
  const days = useMemo(
    () => Array.from({ length: DAY_COUNT }, (_, index) => addDays(reference, index)),
    [reference],
  );
  const rangeEnd = addDays(reference, DAY_COUNT);
  const meetings = useQuery({
    queryKey: [
      "my-meetings-calendar",
      reference.toISOString().slice(0, 10),
    ],
    queryFn: () =>
      api<MyMeetingsCalendar>(
        `/api/bookings/my-calendar?from=${encodeURIComponent(
          reference.toISOString(),
        )}&to=${encodeURIComponent(rangeEnd.toISOString())}`,
      ),
  });
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/api/rooms"),
    enabled: Boolean(editing?.room),
  });
  const grouped = new Map(
    days.map((day) => [
      day.toISOString().slice(0, 10),
      (meetings.data?.meetings ?? []).filter((meeting) =>
        sameDay(new Date(meeting.startsAt), day),
      ),
    ]),
  );
  const visibleMeetings = meetings.data?.meetings ?? [];
  const nextMeeting = visibleMeetings.find(
    (meeting) => new Date(meeting.endsAt) > new Date(),
  );
  const todayCount = visibleMeetings.filter((meeting) =>
    sameDay(new Date(meeting.startsAt), new Date()),
  ).length;
  const invitationCount = visibleMeetings.filter(
    (meeting) =>
      meeting.myRole === "PARTICIPANT" &&
      meeting.participantStatus === "INVITED",
  ).length;
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(new Date(value));
  const editingRoom =
    editing?.room &&
    rooms.data?.rooms.find((room) => room.id === editing.room?.id);
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["my-meetings-calendar"] }),
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] }),
      queryClient.invalidateQueries({ queryKey: ["schedule"] }),
      queryClient.invalidateQueries({ queryKey: ["open-events"] }),
    ]);
  };

  return (
    <div className="page meetings-calendar-page">
      <header className="page-header meetings-calendar-header">
        <div>
          <span className="eyebrow">{t("meetings.eyebrow")}</span>
          <h1>{t("myMeetings")}</h1>
          <p>{t("meetings.subtitle")}</p>
        </div>
        <Button onClick={() => setCreatingOnline(true)}>
          {t("meetings.newOnline")}
        </Button>
      </header>

      <section className="meetings-overview" aria-label={t("meetings.overview")}>
        <article className="meetings-next card">
          <span className="eyebrow">{t("meetings.nextMeeting")}</span>
          {meetings.isLoading ? (
            <div className="meetings-next__empty">
              <strong>{t("meetings.loading")}</strong>
            </div>
          ) : nextMeeting ? (
            <>
              {nextMeeting.imageUrl && (
                <span
                  className="meetings-next__visual"
                  style={{ backgroundImage: `url("${nextMeeting.imageUrl}")` }}
                  aria-hidden="true"
                />
              )}
              <div className="meetings-next__time">
                <strong>{formatTime(nextMeeting.startsAt)}</strong>
                <span>
                  {new Intl.DateTimeFormat(dateLocale, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone,
                  }).format(new Date(nextMeeting.startsAt))}
                </span>
              </div>
              <h2>{nextMeeting.title}</h2>
              <p>
                {nextMeeting.meetingType === "ONLINE"
                  ? t("booking.onlineMeeting")
                  : nextMeeting.room?.name}
                <span aria-hidden="true"> · </span>
                {nextMeeting.myRole === "ORGANIZER"
                  ? t("meetings.organizer")
                  : t("meetings.invited")}
              </p>
              <Button
                variant="secondary"
                size="small"
                onClick={() => setSelected(nextMeeting)}
              >
                {t("meetings.details")}
              </Button>
            </>
          ) : (
            <div className="meetings-next__empty">
              <strong>{t("meetings.noUpcoming")}</strong>
              <span>{t("meetings.noUpcomingBody")}</span>
            </div>
          )}
        </article>
        <div className="meetings-stats">
          <article className="meeting-stat card">
            <span>{t("meetings.todayCount")}</span>
            <strong>{meetings.isLoading ? "—" : todayCount}</strong>
            <small>{t("meetings.todayCountHint")}</small>
          </article>
          <article className="meeting-stat meeting-stat--accent card">
            <span>{t("meetings.invitationCount")}</span>
            <strong>{meetings.isLoading ? "—" : invitationCount}</strong>
            <small>{t("meetings.invitationCountHint")}</small>
          </article>
        </div>
      </section>

      <div className="agenda-stage">
        <div className="agenda-stage__caption" aria-hidden="true">
          <span>MeetBroker</span>
          <strong>Personal / Agenda</strong>
        </div>
        <section className="personal-agenda card">
          <div className="meetings-calendar__toolbar">
          <div className="calendar-navigation">
            <Button
              variant="secondary"
              onClick={() => setReference(addDays(reference, -DAY_COUNT))}
              aria-label={t("meetings.previousDays")}
            >
              ‹
            </Button>
            <Button
              variant="secondary"
              onClick={() => setReference(startOfDay(new Date()))}
            >
              {t("today")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setReference(addDays(reference, DAY_COUNT))}
              aria-label={t("meetings.nextDays")}
            >
              ›
            </Button>
          </div>
          <div className="meetings-range">
            <span>{t("meetings.sixDayAgenda")}</span>
            <strong>
              {new Intl.DateTimeFormat(dateLocale, {
                day: "numeric",
                month: "long",
                timeZone,
              }).format(days[0])}
              {" — "}
              {new Intl.DateTimeFormat(dateLocale, {
                day: "numeric",
                month: "long",
                timeZone,
              }).format(days[days.length - 1])}
            </strong>
          </div>
          </div>

          {meetings.isLoading ? (
            <div className="state-panel">{t("meetings.loading")}</div>
          ) : meetings.isError ? (
            <div className="state-panel state-panel--error">
              <strong>{t("meetings.loadError")}</strong>
              <span>{errorMessage(meetings.error, t, "meetings.loadError")}</span>
            </div>
          ) : (
            <div className="agenda-days">
              {days.map((day) => {
                const dayMeetings =
                  grouped.get(day.toISOString().slice(0, 10)) ?? [];
                const today = sameDay(day, new Date());
                return (
                  <section
                    className={`agenda-day${today ? " agenda-day--today" : ""}`}
                    key={day.toISOString()}
                  >
                    <header className="agenda-day__date">
                      <span>
                        {new Intl.DateTimeFormat(dateLocale, {
                          weekday: "short",
                          timeZone,
                        }).format(day)}
                      </span>
                      <strong>{day.getDate()}</strong>
                      {today && <small>{t("today")}</small>}
                    </header>
                    <div className="agenda-day__meetings">
                      {dayMeetings.length === 0 ? (
                        <div className="agenda-day__empty">
                          <span>{t("meetings.freeDay")}</span>
                        </div>
                      ) : (
                        dayMeetings.map((meeting) => (
                          <button
                            className={`agenda-meeting agenda-meeting--${meeting.meetingType.toLowerCase()}`}
                            onClick={() => setSelected(meeting)}
                            key={meeting.id}
                          >
                            <span className="agenda-meeting__time">
                              <strong>{formatTime(meeting.startsAt)}</strong>
                              <small>{formatTime(meeting.endsAt)}</small>
                            </span>
                            <span className="agenda-meeting__copy">
                              <strong>{meeting.title}</strong>
                              <small>
                                {meeting.meetingType === "ONLINE"
                                  ? t("booking.onlineMeeting")
                                  : meeting.room?.name}
                                <span aria-hidden="true"> · </span>
                                {meeting.organizer.name}
                              </small>
                            </span>
                            <span className="agenda-meeting__badges">
                              <em>
                                {meeting.myRole === "ORGANIZER"
                                  ? t("meetings.organizer")
                                  : t("meetings.invited")}
                              </em>
                              {meeting.participantStatus === "INVITED" && (
                                <em className="is-pending">
                                  {t("meetings.awaitingResponse")}
                                </em>
                              )}
                            </span>
                            <span
                              className="agenda-meeting__arrow"
                              aria-hidden="true"
                            >
                              ›
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {selected && (
        <ModalLayer role="presentation" onMouseDown={() => setSelected(null)}>
          <section
            className="modal meeting-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-details-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal__header">
              <div>
                <span className="eyebrow">
                  {selected.meetingType === "ONLINE"
                    ? t("booking.onlineMeeting")
                    : selected.room?.name}
                </span>
                <h2 id="meeting-details-title">{selected.title}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setSelected(null)}
                aria-label={t("close")}
              >
                ×
              </button>
            </div>
            <div className="meeting-details">
              <p>
                <strong>{t("meetings.when")}</strong>
                <span>
                  {new Intl.DateTimeFormat(dateLocale, {
                    dateStyle: "full",
                    timeStyle: "short",
                    timeZone,
                  }).format(new Date(selected.startsAt))}
                  {" — "}
                  {formatTime(selected.endsAt)}
                </span>
              </p>
              <p>
                <strong>{t("meetings.organizedBy")}</strong>
                <span>{selected.organizer.name}</span>
              </p>
              <p>
                <strong>{t("meetings.participants")}</strong>
                <span>
                  {selected.participants.length
                    ? selected.participants.map((person) => person.name).join(", ")
                    : t("meetings.noParticipants")}
                </span>
              </p>
            </div>
            <div className="modal__actions">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                {t("close")}
              </Button>
              {selected.myRole === "ORGANIZER" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(selected);
                    setSelected(null);
                  }}
                >
                  {t("meetings.edit")}
                </Button>
              )}
              {selected.meetingType === "ONLINE" && selected.meetingUrl && (
                <a
                  className="button button--primary"
                  href={selected.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("meetings.join")}
                </a>
              )}
            </div>
          </section>
        </ModalLayer>
      )}

      {creatingOnline && (
        <BookingDialog
          onClose={() => setCreatingOnline(false)}
          onSaved={async () => {
            setCreatingOnline(false);
            await invalidate();
          }}
        />
      )}
      {editing && (editing.meetingType === "ONLINE" || editingRoom) && (
        <BookingDialog
          key={`edit-${editing.id}`}
          room={editingRoom || undefined}
          booking={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await invalidate();
          }}
        />
      )}
      {editing?.meetingType === "ROOM" && rooms.isLoading && (
        <div className="floating-status">{t("meetings.loadingRoom")}</div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { addDays, addWeeks } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import {
  dateKeyInZone,
  officeLocalToInstant,
  officeWeek
} from "../lib/date";
import { useI18n } from "../lib/i18n";
import type { Booking, Room, Schedule, User } from "../types";
import { Avatar } from "../components/Avatar";
import {
  BookingDialog,
  type BookingDraft
} from "../components/BookingDialog";

const SLOT_HEIGHT = 32;
const DEFAULT_TIME_ZONE = "Europe/Kyiv";

function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function CalendarPage({ user }: { user: User }) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [reference, setReference] = useState(new Date());
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/api/rooms")
  });
  const roomId = selectedRoomId ?? rooms.data?.rooms[0]?.id ?? null;
  const officeTimeZone = DEFAULT_TIME_ZONE;
  const weekDays = useMemo(
    () => officeWeek(reference, officeTimeZone),
    [reference, officeTimeZone]
  );
  const rangeStart = officeLocalToInstant(
    weekDays[0],
    0,
    0,
    officeTimeZone
  );
  const rangeEnd = officeLocalToInstant(
    addDays(weekDays[6], 1),
    0,
    0,
    officeTimeZone
  );
  const schedule = useQuery({
    queryKey: ["schedule", roomId, rangeStart.toISOString()],
    queryFn: () =>
      api<Schedule>(
        `/api/bookings/schedule?roomId=${roomId}&from=${encodeURIComponent(
          rangeStart.toISOString()
        )}&to=${encodeURIComponent(rangeEnd.toISOString())}`
      ),
    enabled: Boolean(roomId)
  });

  const room = schedule.data?.room ?? rooms.data?.rooms.find((r) => r.id === roomId);
  const startMinutes = clockMinutes(room?.workStart ?? "09:00");
  const endMinutes = clockMinutes(room?.workEnd ?? "19:00");
  const slots = Array.from(
    { length: Math.max(1, (endMinutes - startMinutes) / 30) },
    (_, index) => startMinutes + index * 30
  );

  const cancel = useMutation({
    mutationFn: (bookingId: string) =>
      api<void>(`/api/bookings/${bookingId}`, {
        method: "DELETE",
        body: JSON.stringify({})
      }),
    onSuccess: () => {
      setSelectedBooking(null);
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    }
  });

  const weekTitle = new Intl.DateTimeFormat(
    locale === "uk" ? "uk-UA" : "en-GB",
    { day: "numeric", month: "long" }
  );
  const localTimeZone =
    user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="page calendar-page">
      <header className="page-header calendar-toolbar">
        <div>
          <span className="eyebrow">{t("calendar")}</span>
          <h1>{room?.name ?? "Переговорні"}</h1>
          {room && (
            <div className="room-meta">
              <span>{room.floor} {t("floor")}</span>
              <span>•</span>
              <span>{room.capacity} {t("capacity")}</span>
            </div>
          )}
        </div>
        <div className="toolbar-actions">
          <label className="compact-select">
            <span className="sr-only">Кімната</span>
            <select
              value={roomId ?? ""}
              onChange={(event) => setSelectedRoomId(event.target.value)}
            >
              {rooms.data?.rooms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.capacity}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button--primary"
            onClick={() => {
              if (!room) return;
              const next = officeLocalToInstant(
                weekDays[0],
                startMinutes / 60,
                startMinutes % 60,
                officeTimeZone
              );
              setDraft({
                startsAt: next > new Date() ? next : new Date(Date.now() + 3_600_000),
                endsAt:
                  next > new Date()
                    ? new Date(next.getTime() + 3_600_000)
                    : new Date(Date.now() + 7_200_000)
              });
            }}
          >
            <span className="button-plus">+</span>
            {t("book")}
          </button>
        </div>
      </header>

      <section className="calendar-card">
        <div className="calendar-card__toolbar">
          <div className="week-nav">
            <button
              className="icon-button icon-button--bordered"
              onClick={() => setReference((date) => addWeeks(date, -1))}
              aria-label="Попередній тиждень"
            >
              ‹
            </button>
            <button
              className="button button--secondary button--small"
              onClick={() => setReference(new Date())}
            >
              {t("today")}
            </button>
            <button
              className="icon-button icon-button--bordered"
              onClick={() => setReference((date) => addWeeks(date, 1))}
              aria-label="Наступний тиждень"
            >
              ›
            </button>
            <strong>
              {weekTitle.format(weekDays[0])} — {weekTitle.format(weekDays[6])}
            </strong>
          </div>
          <div className="timezone-note">
            <span>Ваш час: {localTimeZone}</span>
            {localTimeZone !== officeTimeZone && (
              <span>Офіс: {officeTimeZone}</span>
            )}
          </div>
        </div>

        {schedule.isError ? (
          <div className="state-panel state-panel--error">
            <strong>Не вдалося завантажити розклад</strong>
            <span>
              {schedule.error instanceof ApiError
                ? schedule.error.message
                : "Сервер тимчасово недоступний"}
            </span>
            <button
              className="button button--secondary"
              onClick={() => schedule.refetch()}
            >
              {t("retry")}
            </button>
          </div>
        ) : !room || schedule.isLoading ? (
          <CalendarSkeleton />
        ) : (
          <div className="calendar-scroll">
            <div
              className="week-grid"
              style={{
                "--calendar-height": `${slots.length * SLOT_HEIGHT}px`
              } as React.CSSProperties}
            >
              <div className="week-grid__corner" />
              {weekDays.map((day) => {
                const instant = officeLocalToInstant(
                  day,
                  12,
                  0,
                  officeTimeZone
                );
                const isToday =
                  dateKeyInZone(instant, officeTimeZone) ===
                  dateKeyInZone(new Date(), officeTimeZone);
                return (
                  <div
                    className={`day-heading${isToday ? " is-today" : ""}`}
                    key={day.toISOString()}
                  >
                    <span>
                      {new Intl.DateTimeFormat(
                        locale === "uk" ? "uk-UA" : "en-GB",
                        { weekday: "short", timeZone: officeTimeZone }
                      ).format(instant)}
                    </span>
                    <strong>
                      {new Intl.DateTimeFormat(
                        locale === "uk" ? "uk-UA" : "en-GB",
                        { day: "2-digit", month: "2-digit", timeZone: officeTimeZone }
                      ).format(instant)}
                    </strong>
                  </div>
                );
              })}
              <div className="time-column">
                {slots.map((minutes, index) => {
                  const instant = officeLocalToInstant(
                    weekDays[0],
                    Math.floor(minutes / 60),
                    minutes % 60,
                    officeTimeZone
                  );
                  return (
                    <span
                      key={minutes}
                      style={{ top: index * SLOT_HEIGHT - 7 }}
                    >
                      {new Intl.DateTimeFormat(
                        locale === "uk" ? "uk-UA" : "en-GB",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                          timeZone: localTimeZone
                        }
                      ).format(instant)}
                    </span>
                  );
                })}
              </div>
              {weekDays.map((day) => (
                <DayColumn
                  key={day.toISOString()}
                  day={day}
                  slots={slots}
                  startMinutes={startMinutes}
                  officeTimeZone={officeTimeZone}
                  schedule={schedule.data!}
                  currentUserId={user.id}
                  onCreate={setDraft}
                  onBooking={setSelectedBooking}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {draft && room && (
        <BookingDialog
          room={room}
          draft={draft}
          onClose={() => setDraft(null)}
          onCreated={() => {
            setDraft(null);
            queryClient.invalidateQueries({ queryKey: ["schedule"] });
          }}
        />
      )}
      {selectedBooking && (
        <BookingDrawer
          booking={selectedBooking}
          currentUserId={user.id}
          onClose={() => setSelectedBooking(null)}
          onCancel={() => {
            if (window.confirm("Скасувати це бронювання?")) {
              cancel.mutate(selectedBooking.id);
            }
          }}
          cancelling={cancel.isPending}
        />
      )}
    </div>
  );
}

function DayColumn({
  day,
  slots,
  startMinutes,
  officeTimeZone,
  schedule,
  currentUserId,
  onCreate,
  onBooking
}: {
  day: Date;
  slots: number[];
  startMinutes: number;
  officeTimeZone: string;
  schedule: Schedule;
  currentUserId: string;
  onCreate: (draft: BookingDraft) => void;
  onBooking: (booking: Booking) => void;
}) {
  const key = dateKeyInZone(
    officeLocalToInstant(day, 12, 0, officeTimeZone),
    officeTimeZone
  );
  const bookings = schedule.bookings.filter(
    (booking) =>
      dateKeyInZone(new Date(booking.startsAt), officeTimeZone) === key
  );
  const blocks = schedule.blocks.filter(
    (block) => dateKeyInZone(new Date(block.startsAt), officeTimeZone) === key
  );

  return (
    <div className="day-column">
      {slots.map((minutes) => {
        const start = officeLocalToInstant(
          day,
          Math.floor(minutes / 60),
          minutes % 60,
          officeTimeZone
        );
        return (
          <button
            className="calendar-slot"
            key={minutes}
            onClick={() =>
              onCreate({
                startsAt: start,
                endsAt: new Date(start.getTime() + 30 * 60_000)
              })
            }
            aria-label={`Вільний слот ${start.toISOString()}`}
          />
        );
      })}
      {blocks.map((block) => {
        const localStart = toZonedTime(new Date(block.startsAt), officeTimeZone);
        const minutes = localStart.getHours() * 60 + localStart.getMinutes();
        const duration =
          (new Date(block.endsAt).getTime() -
            new Date(block.startsAt).getTime()) /
          60_000;
        return (
          <div
            className="booking-block booking-block--maintenance"
            style={{
              top: ((minutes - startMinutes) / 30) * SLOT_HEIGHT + 2,
              height: Math.max(28, (duration / 30) * SLOT_HEIGHT - 4)
            }}
            key={block.id}
          >
            <span>{block.title}</span>
          </div>
        );
      })}
      {bookings.map((booking) => {
        const localStart = toZonedTime(
          new Date(booking.startsAt),
          officeTimeZone
        );
        const minutes = localStart.getHours() * 60 + localStart.getMinutes();
        const duration =
          (new Date(booking.endsAt).getTime() -
            new Date(booking.startsAt).getTime()) /
          60_000;
        const own = booking.organizer.id === currentUserId;
        return (
          <button
            className={`booking-block${
              own ? " booking-block--own" : ""
            }${booking.participationMode === "OPEN" ? " booking-block--open" : ""}`}
            style={{
              top: ((minutes - startMinutes) / 30) * SLOT_HEIGHT + 2,
              height: Math.max(28, (duration / 30) * SLOT_HEIGHT - 4)
            }}
            key={booking.id}
            onClick={() => onBooking(booking)}
          >
            <small>
              {new Intl.DateTimeFormat("uk-UA", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
              }).format(new Date(booking.startsAt))}
            </small>
            <strong>{booking.title}</strong>
            <span>{own ? "Ваше бронювання" : booking.organizer.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function BookingDrawer({
  booking,
  currentUserId,
  onClose,
  onCancel,
  cancelling
}: {
  booking: Booking;
  currentUserId: string;
  onClose: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer__header">
          <span
            className={`event-dot${
              booking.organizer.id === currentUserId ? " event-dot--own" : ""
            }`}
          />
          <button className="icon-button" onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>
        <span className="eyebrow">
          {booking.participationMode === "OPEN"
            ? "Відкрита подія"
            : "Зустріч за запрошенням"}
        </span>
        <h2>{booking.title}</h2>
        <div className="drawer-time">
          {new Intl.DateTimeFormat("uk-UA", {
            dateStyle: "full",
            timeStyle: "short"
          }).format(new Date(booking.startsAt))}
        </div>
        <hr />
        <span className="detail-label">Організатор</span>
        <div className="person-detail">
          <Avatar
            name={booking.organizer.name}
            preset={booking.organizer.avatarPreset}
            url={booking.organizer.avatarUrl}
            size="lg"
          />
          <div>
            <strong>{booking.organizer.name}</strong>
            <p>{booking.organizer.bio || "Колега у MeetBroker"}</p>
          </div>
        </div>
        {booking.participants.length > 0 && (
          <>
            <span className="detail-label">Учасники</span>
            <div className="avatar-stack">
              {booking.participants.slice(0, 8).map((person) => (
                <Avatar
                  key={person.id}
                  name={person.name}
                  preset={person.avatarPreset}
                  url={person.avatarUrl}
                  size="sm"
                />
              ))}
              <span>{booking.participants.length}</span>
            </div>
          </>
        )}
        {booking.organizer.id === currentUserId && (
          <button
            className="button button--danger button--wide drawer__action"
            onClick={onCancel}
            disabled={cancelling}
          >
            {cancelling ? "Скасовуємо…" : "Скасувати бронювання"}
          </button>
        )}
      </aside>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="calendar-skeleton">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index}>
          <span />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}

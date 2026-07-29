import { useMemo, useState } from "react";
import { addDays, addWeeks } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { dateKeyInZone, officeLocalToInstant, officeWeek } from "../lib/date";
import { useI18n } from "../lib/i18n";
import type { Booking, Room, Schedule, User } from "../types";
import { Avatar } from "../components/Avatar";
import { RoomVisual } from "../components/RoomVisual";
import { BookingDialog, type BookingDraft } from "../components/BookingDialog";
import { CancelBookingDialog } from "../components/CancelBookingDialog";

const SLOT_HEIGHT = 32;
const DEFAULT_TIME_ZONE = "Europe/Kyiv";

function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function CalendarPage({ user }: { user: User }) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const initialParams = new URLSearchParams(window.location.search);
  const initialDate = initialParams.get("date");
  const [reference, setReference] = useState(() => {
    const parsed = initialDate ? new Date(initialDate) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    initialParams.get("roomId"),
  );
  const [minCapacity, setMinCapacity] = useState(0);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(
    null,
  );
  const rooms = useQuery({
    queryKey: ["rooms", minCapacity],
    queryFn: () =>
      api<{ rooms: Room[] }>(
        minCapacity > 0
          ? `/api/rooms?minCapacity=${minCapacity}`
          : "/api/rooms",
      ),
  });
  const roomOptions = rooms.data?.rooms ?? [];
  const roomId = roomOptions.some(
    (candidate) => candidate.id === selectedRoomId,
  )
    ? selectedRoomId
    : (roomOptions[0]?.id ?? null);
  const officeTimeZone = DEFAULT_TIME_ZONE;
  const weekDays = useMemo(
    () => officeWeek(reference, officeTimeZone),
    [reference, officeTimeZone],
  );
  const rangeStart = officeLocalToInstant(weekDays[0], 0, 0, officeTimeZone);
  const rangeEnd = officeLocalToInstant(
    addDays(weekDays[6], 1),
    0,
    0,
    officeTimeZone,
  );
  const schedule = useQuery({
    queryKey: ["schedule", roomId, rangeStart.toISOString()],
    queryFn: () =>
      api<Schedule>(
        `/api/bookings/schedule?roomId=${roomId}&from=${encodeURIComponent(
          rangeStart.toISOString(),
        )}&to=${encodeURIComponent(rangeEnd.toISOString())}`,
      ),
    enabled: Boolean(roomId),
  });

  const room =
    schedule.data?.room ?? rooms.data?.rooms.find((r) => r.id === roomId);
  const workStartMinutes = clockMinutes(room?.workStart ?? "09:00");
  const workEndMinutes = clockMinutes(room?.workEnd ?? "19:00");
  const startMinutes = Math.min(7 * 60, workStartMinutes);
  const endMinutes = Math.max(21 * 60, workEndMinutes);
  const slots = Array.from(
    { length: Math.max(1, (endMinutes - startMinutes) / 30) },
    (_, index) => startMinutes + index * 30,
  );

  const cancel = useMutation({
    mutationFn: (bookingId: string) =>
      api<void>(`/api/bookings/${bookingId}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      setSelectedBooking(null);
      setCancellingBooking(null);
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });

  const weekTitle = new Intl.DateTimeFormat(
    locale === "uk" ? "uk-UA" : "en-GB",
    { day: "numeric", month: "long" },
  );
  const localTimeZone =
    user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const officeNow = toZonedTime(now, officeTimeZone);
  const nowMinutes = officeNow.getHours() * 60 + officeNow.getMinutes();
  const currentDayVisible = weekDays.some(
    (day) =>
      dateKeyInZone(
        officeLocalToInstant(day, 12, 0, officeTimeZone),
        officeTimeZone,
      ) === dateKeyInZone(now, officeTimeZone),
  );
  const showCurrentTime =
    currentDayVisible && nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  const currentTimeLabel = new Intl.DateTimeFormat(
    locale === "uk" ? "uk-UA" : "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: officeTimeZone,
    },
  ).format(now);

  return (
    <div className="page calendar-page">
      <header className="page-header calendar-toolbar">
        <div className="room-identity">
          <RoomVisual
            room={{
              name: room?.name ?? "Переговорні",
              imageUrl: room?.imageUrl ?? null,
            }}
          />
          <div>
            <span className="eyebrow">{t("calendar")}</span>
            <h1>{room?.name ?? "Переговорні"}</h1>
            {room && (
              <div className="room-meta">
                <span>
                  {room.floor} {t("floor")}
                </span>
                <span>•</span>
                <span>
                  {room.capacity} {t("capacity")}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="toolbar-actions">
          <label className="compact-select capacity-filter">
            <span className="sr-only">Мінімальна місткість</span>
            <select
              value={minCapacity}
              onChange={(event) => {
                setMinCapacity(Number(event.target.value));
                setSelectedRoomId(null);
              }}
            >
              <option value={0}>Будь-яка місткість</option>
              <option value={4}>Від 4 місць</option>
              <option value={6}>Від 6 місць</option>
              <option value={8}>Від 8 місць</option>
              <option value={10}>Від 10 місць</option>
              <option value={12}>Від 12 місць</option>
            </select>
          </label>
          <label className="compact-select">
            <span className="sr-only">Кімната</span>
            <select
              value={roomId ?? ""}
              onChange={(event) => setSelectedRoomId(event.target.value)}
              disabled={rooms.isLoading || roomOptions.length === 0}
            >
              {roomOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.capacity}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button--primary"
            disabled={!room}
            onClick={() => {
              if (!room) return;
              const candidates = weekDays.flatMap((day) =>
                slots
                  .filter(
                    (minutes) =>
                      minutes >= workStartMinutes && minutes < workEndMinutes,
                  )
                  .map((minutes) =>
                    officeLocalToInstant(
                      day,
                      Math.floor(minutes / 60),
                      minutes % 60,
                      officeTimeZone,
                    ),
                  ),
              );
              const next =
                candidates.find((candidate) => candidate > new Date()) ??
                officeLocalToInstant(
                  addDays(weekDays[6], 1),
                  Math.floor(workStartMinutes / 60),
                  workStartMinutes % 60,
                  officeTimeZone,
                );
              setDraft({
                startsAt: next,
                endsAt: new Date(next.getTime() + 3_600_000),
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

        {rooms.isError ? (
          <div className="state-panel state-panel--error">
            <strong>Не вдалося завантажити кімнати</strong>
            <span>
              {rooms.error instanceof ApiError
                ? rooms.error.message
                : "Сервер тимчасово недоступний"}
            </span>
            <button
              className="button button--secondary"
              onClick={() => rooms.refetch()}
            >
              {t("retry")}
            </button>
          </div>
        ) : !rooms.isLoading && roomOptions.length === 0 ? (
          <div className="empty-state calendar-empty-state">
            <span className="empty-state__icon">○</span>
            <h2>Немає кімнати потрібної місткості</h2>
            <p>Зменште кількість місць або перегляньте всі доступні кімнати.</p>
            <button
              className="button button--secondary"
              onClick={() => setMinCapacity(0)}
            >
              Скинути фільтр
            </button>
          </div>
        ) : schedule.isError ? (
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
          <>
            <div className="calendar-scroll">
              <div
                className="week-grid"
                style={
                  {
                    "--calendar-height": `${slots.length * SLOT_HEIGHT}px`,
                  } as React.CSSProperties
                }
              >
                <div className="week-grid__corner" />
                {weekDays.map((day) => {
                  const instant = officeLocalToInstant(
                    day,
                    12,
                    0,
                    officeTimeZone,
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
                          { weekday: "short", timeZone: officeTimeZone },
                        ).format(instant)}
                      </span>
                      <strong>
                        {new Intl.DateTimeFormat(
                          locale === "uk" ? "uk-UA" : "en-GB",
                          {
                            day: "2-digit",
                            month: "2-digit",
                            timeZone: officeTimeZone,
                          },
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
                      officeTimeZone,
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
                            timeZone: localTimeZone,
                          },
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
                    workStartMinutes={workStartMinutes}
                    workEndMinutes={workEndMinutes}
                    officeTimeZone={officeTimeZone}
                    schedule={schedule.data!}
                    currentUserId={user.id}
                    onCreate={setDraft}
                    onBooking={setSelectedBooking}
                  />
                ))}
                {showCurrentTime && (
                  <div
                    className="current-time-line"
                    style={{
                      top:
                        58 + ((nowMinutes - startMinutes) / 30) * SLOT_HEIGHT,
                    }}
                  >
                    <span>{currentTimeLabel}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="calendar-legend">
              <div>
                <span className="legend-swatch legend-swatch--own" />
                Ваші бронювання
              </div>
              <div>
                <span className="legend-swatch legend-swatch--other" />
                Інші зустрічі
              </div>
              <div>
                <span className="legend-swatch legend-swatch--open" />
                Відкриті події
              </div>
              <div>
                <span className="legend-swatch legend-swatch--maintenance" />
                Недоступність
              </div>
              <div>
                <span className="legend-swatch legend-swatch--closed" />
                Поза робочими годинами
              </div>
              <span className="calendar-legend__hint">
                Натисніть на вільний час, щоб забронювати
              </span>
            </div>
          </>
        )}
      </section>

      {draft && room && (
        <BookingDialog
          key={`create-${draft.startsAt.toISOString()}`}
          room={room}
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            queryClient.invalidateQueries({ queryKey: ["schedule"] });
            queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
          }}
        />
      )}
      {editingBooking && room && (
        <BookingDialog
          key={`edit-${editingBooking.id}`}
          room={room}
          booking={editingBooking}
          onClose={() => setEditingBooking(null)}
          onSaved={() => {
            setEditingBooking(null);
            queryClient.invalidateQueries({ queryKey: ["schedule"] });
            queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
            queryClient.invalidateQueries({ queryKey: ["open-events"] });
          }}
        />
      )}
      {selectedBooking && (
        <BookingDrawer
          booking={selectedBooking}
          currentUserId={user.id}
          onClose={() => setSelectedBooking(null)}
          onEdit={() => {
            setEditingBooking(selectedBooking);
            setSelectedBooking(null);
          }}
          onCancel={() => {
            setCancellingBooking(selectedBooking);
            setSelectedBooking(null);
          }}
          cancelling={cancel.isPending}
        />
      )}
      {cancellingBooking && room && (
        <CancelBookingDialog
          booking={{
            title: cancellingBooking.title,
            roomName: room.name,
            startsAt: cancellingBooking.startsAt,
            endsAt: cancellingBooking.endsAt,
            participantCount: cancellingBooking.participants.length,
          }}
          pending={cancel.isPending}
          error={cancel.error}
          onClose={() => {
            cancel.reset();
            setCancellingBooking(null);
          }}
          onConfirm={() => cancel.mutate(cancellingBooking.id)}
        />
      )}
    </div>
  );
}

function DayColumn({
  day,
  slots,
  startMinutes,
  workStartMinutes,
  workEndMinutes,
  officeTimeZone,
  schedule,
  currentUserId,
  onCreate,
  onBooking,
}: {
  day: Date;
  slots: number[];
  startMinutes: number;
  workStartMinutes: number;
  workEndMinutes: number;
  officeTimeZone: string;
  schedule: Schedule;
  currentUserId: string;
  onCreate: (draft: BookingDraft) => void;
  onBooking: (booking: Booking) => void;
}) {
  const key = dateKeyInZone(
    officeLocalToInstant(day, 12, 0, officeTimeZone),
    officeTimeZone,
  );
  const bookings = schedule.bookings.filter(
    (booking) =>
      dateKeyInZone(new Date(booking.startsAt), officeTimeZone) === key,
  );
  const blocks = schedule.blocks.filter(
    (block) => dateKeyInZone(new Date(block.startsAt), officeTimeZone) === key,
  );

  return (
    <div className="day-column">
      {slots.map((minutes) => {
        const outsideWorkingHours =
          minutes < workStartMinutes || minutes >= workEndMinutes;
        const start = officeLocalToInstant(
          day,
          Math.floor(minutes / 60),
          minutes % 60,
          officeTimeZone,
        );
        return (
          <button
            className={`calendar-slot${
              outsideWorkingHours ? " calendar-slot--closed" : ""
            }`}
            key={minutes}
            disabled={outsideWorkingHours}
            onClick={() => {
              if (!outsideWorkingHours) {
                onCreate({
                  startsAt: start,
                  endsAt: new Date(start.getTime() + 30 * 60_000),
                });
              }
            }}
            aria-label={
              outsideWorkingHours
                ? `Кімната не працює ${start.toISOString()}`
                : `Вільний слот ${start.toISOString()}`
            }
          />
        );
      })}
      {blocks.map((block) => {
        const localStart = toZonedTime(
          new Date(block.startsAt),
          officeTimeZone,
        );
        const minutes = localStart.getHours() * 60 + localStart.getMinutes();
        const duration =
          (new Date(block.endsAt).getTime() -
            new Date(block.startsAt).getTime()) /
          60_000;
        return (
          <div
            className={`booking-block booking-block--maintenance${
              block.seriesId ? " booking-block--recurring" : ""
            }`}
            style={{
              top: ((minutes - startMinutes) / 30) * SLOT_HEIGHT + 2,
              height: Math.max(28, (duration / 30) * SLOT_HEIGHT - 4),
            }}
            key={block.id}
          >
            <small>
              {block.seriesId ? "Повторювана недоступність" : "Недоступність"}
            </small>
            <span>{block.title}</span>
          </div>
        );
      })}
      {bookings.map((booking) => {
        const localStart = toZonedTime(
          new Date(booking.startsAt),
          officeTimeZone,
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
              height: Math.max(28, (duration / 30) * SLOT_HEIGHT - 4),
            }}
            key={booking.id}
            onClick={() => onBooking(booking)}
          >
            <small>
              {new Intl.DateTimeFormat("uk-UA", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
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
  onEdit,
  onCancel,
  cancelling,
}: {
  booking: Booking;
  currentUserId: string;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="drawer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer__header">
          <span
            className={`event-dot${
              booking.organizer.id === currentUserId ? " event-dot--own" : ""
            }`}
          />
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Закрити"
          >
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
            timeStyle: "short",
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
          <div className="drawer__actions">
            <button
              className="button button--primary button--wide"
              onClick={onEdit}
            >
              Редагувати
            </button>
            <button
              className="button button--danger button--wide"
              onClick={onCancel}
              disabled={cancelling}
            >
              {cancelling ? "Скасовуємо…" : "Скасувати бронювання"}
            </button>
          </div>
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

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { errorMessage } from "../lib/error-message";
import {
  dateKeyInZone,
  officeDateWindow,
  officeLocalToInstant,
} from "../lib/date";
import { useI18n } from "../lib/i18n";
import type { Booking, Room, RoomBlock, Schedule, User } from "../types";
import { RoomVisual } from "../components/RoomVisual";
import { BookingDialog, type BookingDraft } from "../components/BookingDialog";
import { CancelBookingDialog } from "../components/CancelBookingDialog";
import { RoomBlockDrawer } from "../components/RoomBlockDrawer";
import { BookingDrawer } from "./calendar/BookingDrawer";
import { CalendarDayColumn } from "./calendar/CalendarDayColumn";
import { CalendarSkeleton } from "./calendar/CalendarSkeleton";
import {
  CALENDAR_SLOT_HEIGHT,
  calendarDayCount,
  clockMinutes,
  nextWorkingDate,
} from "./calendar/calendar.model";

const DEFAULT_TIME_ZONE = "Europe/Kyiv";

export function CalendarPage({ user }: { user: User }) {
  const { dateLocale, t } = useI18n();
  const queryClient = useQueryClient();
  const initialParams = new URLSearchParams(window.location.search);
  const initialDate = initialParams.get("date");
  const initialReference = (() => {
    const parsed = initialDate ? new Date(initialDate) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  })();
  const [reference, setReference] = useState(initialReference);
  const calendarCardRef = useRef<HTMLElement>(null);
  const [visibleDayCount, setVisibleDayCount] = useState(6);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    initialParams.get("roomId"),
  );
  const [minCapacity, setMinCapacity] = useState(0);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<RoomBlock | null>(null);
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
  useLayoutEffect(() => {
    const card = calendarCardRef.current;
    if (!card) return;

    const updateDayCount = () => {
      setVisibleDayCount(calendarDayCount(card.clientWidth));
    };
    updateDayCount();

    const observer = new ResizeObserver(updateDayCount);
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const visibleDays = useMemo(
    () => officeDateWindow(reference, officeTimeZone, visibleDayCount),
    [reference, officeTimeZone, visibleDayCount],
  );
  const rangeStart = officeLocalToInstant(visibleDays[0], 0, 0, officeTimeZone);
  const rangeEnd = officeLocalToInstant(
    addDays(visibleDays[visibleDays.length - 1], 1),
    0,
    0,
    officeTimeZone,
  );
  const schedule = useQuery({
    queryKey: [
      "schedule",
      roomId,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
    ],
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
    mutationFn: ({
      bookingId,
      scope,
    }: {
      bookingId: string;
      scope: "OCCURRENCE" | "FUTURE";
    }) =>
      api<void>(`/api/bookings/${bookingId}`, {
        method: "DELETE",
        body: JSON.stringify({ scope }),
      }),
    onSuccess: () => {
      setSelectedBooking(null);
      setCancellingBooking(null);
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });

  const localTimeZone =
    user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dayDisplayInstants = visibleDays.map((day) =>
    officeLocalToInstant(
      day,
      Math.floor(workStartMinutes / 60),
      workStartMinutes % 60,
      officeTimeZone,
    ),
  );
  const weekTitle = new Intl.DateTimeFormat(dateLocale, {
    day: "numeric",
    month: "long",
    timeZone: localTimeZone,
  });
  const now = new Date();
  const officeNow = toZonedTime(now, officeTimeZone);
  const nowMinutes = officeNow.getHours() * 60 + officeNow.getMinutes();
  const currentDayVisible = dayDisplayInstants.some(
    (instant) =>
      dateKeyInZone(instant, localTimeZone) ===
      dateKeyInZone(now, localTimeZone),
  );
  const showCurrentTime =
    currentDayVisible && nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  const currentTimeLabel = new Intl.DateTimeFormat(dateLocale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: localTimeZone,
  }).format(now);

  return (
    <div className="page calendar-page">
      <header className="page-header calendar-toolbar">
        <span className="calendar-toolbar__word" aria-hidden="true">
          {t("marks.schedule")}
        </span>
        <div className="room-identity">
          <RoomVisual
            room={{
              name: room?.name ?? t("calendar.rooms"),
              imageUrl: room?.imageUrl ?? null,
            }}
          />
          <div>
            <span className="eyebrow">{t("calendar")}</span>
            <h1>{room?.name ?? t("calendar.rooms")}</h1>
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
      </header>

      <div className="schedule-stage">
        <div className="schedule-stage__caption" aria-hidden="true">
          <span>{t("stage.schedule")}</span>
          <strong>{t("stage.liveRoomPlan")}</strong>
        </div>
        <section className="calendar-card" ref={calendarCardRef}>
          <div className="calendar-table-toolbar">
            <div className="schedule-controls">
              <div className="toolbar-actions">
                <label className="compact-select capacity-filter">
                  <span className="sr-only">
                    {t("calendar.minimumCapacity")}
                  </span>
                  <select
                    value={minCapacity}
                    onChange={(event) => {
                      setMinCapacity(Number(event.target.value));
                      setSelectedRoomId(null);
                    }}
                  >
                    <option value={0}>{t("calendar.anyCapacity")}</option>
                    {[4, 6, 8, 10, 12].map((count) => (
                      <option value={count} key={count}>
                        {t("calendar.fromSeats", { count })}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="compact-select">
                  <span className="sr-only">{t("room")}</span>
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
                    const candidates = visibleDays.flatMap((day) => {
                      const weekday = day.getDay() === 0 ? 7 : day.getDay();
                      if (!room.workingDays.includes(weekday)) return [];
                      return slots
                        .filter(
                          (minutes) =>
                            minutes >= workStartMinutes &&
                            minutes < workEndMinutes,
                        )
                        .map((minutes) =>
                          officeLocalToInstant(
                            day,
                            Math.floor(minutes / 60),
                            minutes % 60,
                            officeTimeZone,
                          ),
                        );
                    });
                    const next =
                      candidates.find((candidate) => candidate > new Date()) ??
                      officeLocalToInstant(
                        nextWorkingDate(
                          visibleDays[visibleDays.length - 1],
                          room.workingDays,
                        ),
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
            </div>
            <div className="calendar-card__toolbar">
              <div className="week-nav">
                <button
                  className="icon-button icon-button--bordered"
                  onClick={() => {
                    setReference((date) => addDays(date, -visibleDayCount));
                  }}
                  aria-label={t("calendar.previousPeriod")}
                >
                  ‹
                </button>
                <button
                  className="button button--secondary button--small"
                  onClick={() => {
                    const today = new Date();
                    setReference(today);
                  }}
                >
                  {t("today")}
                </button>
                <button
                  className="icon-button icon-button--bordered"
                  onClick={() => {
                    setReference((date) => addDays(date, visibleDayCount));
                  }}
                  aria-label={t("calendar.nextPeriod")}
                >
                  ›
                </button>
                <strong>
                  {weekTitle.format(dayDisplayInstants[0])} —{" "}
                  {weekTitle.format(
                    dayDisplayInstants[dayDisplayInstants.length - 1],
                  )}
                </strong>
              </div>
              <div className="timezone-note">
                <span>{t("calendar.userTime", { zone: localTimeZone })}</span>
                {localTimeZone !== officeTimeZone && (
                  <span>
                    {t("calendar.officeTime", { zone: officeTimeZone })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {rooms.isError ? (
            <div className="state-panel state-panel--error">
              <strong>{t("calendar.roomsLoadError")}</strong>
              <span>
                {errorMessage(rooms.error, t, "calendar.roomsLoadError")}
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
              <h2>{t("calendar.noCapacityTitle")}</h2>
              <p>{t("calendar.noCapacityBody")}</p>
              <button
                className="button button--secondary"
                onClick={() => setMinCapacity(0)}
              >
                {t("calendar.resetFilter")}
              </button>
            </div>
          ) : schedule.isError ? (
            <div className="state-panel state-panel--error">
              <strong>{t("calendar.scheduleLoadError")}</strong>
              <span>
                {errorMessage(schedule.error, t, "calendar.scheduleLoadError")}
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
                      "--calendar-height": `${slots.length * CALENDAR_SLOT_HEIGHT}px`,
                      "--calendar-days": visibleDayCount,
                    } as React.CSSProperties
                  }
                >
                  <div className="week-grid__corner" />
                  {visibleDays.map((day, index) => {
                    const instant = dayDisplayInstants[index];
                    const isoWeekday = day.getDay() === 0 ? 7 : day.getDay();
                    const isWorkingDay = room.workingDays.includes(isoWeekday);
                    const isToday =
                      dateKeyInZone(instant, localTimeZone) ===
                      dateKeyInZone(new Date(), localTimeZone);
                    return (
                      <div
                        className={`day-heading${isToday ? " is-today" : ""}${
                          !isWorkingDay ? " is-closed" : ""
                        }`}
                        key={day.toISOString()}
                      >
                        <span>
                          {new Intl.DateTimeFormat(dateLocale, {
                            weekday: "short",
                            timeZone: localTimeZone,
                          }).format(instant)}
                        </span>
                        <strong>
                          {new Intl.DateTimeFormat(dateLocale, {
                            day: "2-digit",
                            month: "2-digit",
                            timeZone: localTimeZone,
                          }).format(instant)}
                        </strong>
                      </div>
                    );
                  })}
                  <div className="time-column">
                    {slots.map((minutes, index) => {
                      const instant = officeLocalToInstant(
                        visibleDays[0],
                        Math.floor(minutes / 60),
                        minutes % 60,
                        officeTimeZone,
                      );
                      return (
                        <span
                          className={index === 0 ? "is-first" : undefined}
                          key={minutes}
                          style={{ top: index * CALENDAR_SLOT_HEIGHT }}
                        >
                          {new Intl.DateTimeFormat(dateLocale, {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                            timeZone: localTimeZone,
                          }).format(instant)}
                        </span>
                      );
                    })}
                  </div>
                  {visibleDays.map((day, index) => {
                    const isoWeekday = day.getDay() === 0 ? 7 : day.getDay();
                    return (
                      <CalendarDayColumn
                        key={day.toISOString()}
                        day={day}
                        slots={slots}
                        startMinutes={startMinutes}
                        workStartMinutes={workStartMinutes}
                        workEndMinutes={workEndMinutes}
                        workingDay={room.workingDays.includes(isoWeekday)}
                        officeTimeZone={officeTimeZone}
                        schedule={schedule.data!}
                        currentUserId={user.id}
                        onCreate={setDraft}
                        onBooking={setSelectedBooking}
                        onBlock={setSelectedBlock}
                      />
                    );
                  })}
                  {showCurrentTime && (
                    <div
                      className="current-time-line"
                      style={{
                        top:
                          58 +
                          ((nowMinutes - startMinutes) / 30) *
                            CALENDAR_SLOT_HEIGHT,
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
                  {t("calendar.legendOwn")}
                </div>
                <div>
                  <span className="legend-swatch legend-swatch--other" />
                  {t("calendar.legendOther")}
                </div>
                <div>
                  <span className="legend-swatch legend-swatch--open" />
                  {t("calendar.legendOpen")}
                </div>
                <div>
                  <span className="legend-swatch legend-swatch--maintenance" />
                  {t("calendar.legendUnavailable")}
                </div>
                <div>
                  <span className="legend-swatch legend-swatch--closed" />
                  {t("calendar.legendClosed")}
                </div>
                <span className="calendar-legend__hint">
                  {t("calendar.legendHint")}
                </span>
              </div>
            </>
          )}
        </section>
      </div>

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
      {selectedBlock && room && (
        <RoomBlockDrawer
          block={selectedBlock}
          room={room}
          timeZone={localTimeZone}
          onClose={() => setSelectedBlock(null)}
        />
      )}
      {cancellingBooking && room && (
        <CancelBookingDialog
          booking={{
            title: cancellingBooking.title,
            roomName: room.name,
            startsAt: cancellingBooking.startsAt,
            endsAt: cancellingBooking.endsAt,
            seriesId: cancellingBooking.seriesId,
            participantCount: cancellingBooking.participants.length,
          }}
          pending={cancel.isPending}
          error={cancel.error}
          timeZone={localTimeZone}
          onClose={() => {
            cancel.reset();
            setCancellingBooking(null);
          }}
          onConfirm={(scope) =>
            cancel.mutate({ bookingId: cancellingBooking.id, scope })
          }
        />
      )}
    </div>
  );
}

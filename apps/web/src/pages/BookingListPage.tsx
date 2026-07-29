import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient
} from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { navigate } from "../lib/router";
import type { User } from "../types";
import { CancelBookingDialog } from "../components/CancelBookingDialog";

interface MyBooking {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  room: { id: string; name: string };
  organizerId: string;
  participationMode: string;
  participantStatus: "INVITED" | "ACCEPTED" | "DECLINED" | null;
}

interface BookingPage {
  bookings: MyBooking[];
  hasMore: boolean;
  nextOffset: number | null;
}

export function BookingListPage({ user }: { user: User }) {
  const [section, setSection] = useState<"future" | "past">("future");
  const [cancellingBooking, setCancellingBooking] =
    useState<MyBooking | null>(null);
  const queryClient = useQueryClient();
  const bookings = useInfiniteQuery({
    queryKey: ["my-bookings", section],
    queryFn: ({ pageParam }) =>
      api<BookingPage>(
        `/api/bookings/mine?section=${section}&offset=${pageParam}`
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined
  });
  const visibleBookings =
    bookings.data?.pages.flatMap((page) => page.bookings) ?? [];
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/bookings/${id}`, {
        method: "DELETE",
        body: JSON.stringify({})
      }),
    onSuccess: () => {
      setCancellingBooking(null);
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    }
  });
  const respond = useMutation({
    mutationFn: ({
      id,
      status
    }: {
      id: string;
      status: "ACCEPTED" | "DECLINED";
    }) =>
      api<void>(`/api/bookings/${id}/respond`, {
        method: "POST",
        body: JSON.stringify({ status })
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] })
  });

  return (
    <div className="page narrow-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Ваш робочий час</span>
          <h1>Мої бронювання</h1>
          <p>Організовані вами зустрічі та запрошення від колег.</p>
        </div>
      </header>
      <div className="tabs">
        <button
          className={section === "future" ? "is-active" : ""}
          onClick={() => setSection("future")}
        >
          Майбутні
        </button>
        <button
          className={section === "past" ? "is-active" : ""}
          onClick={() => setSection("past")}
        >
          Минулі
        </button>
      </div>

      {bookings.isLoading ? (
        <ListSkeleton />
      ) : bookings.isError && visibleBookings.length === 0 ? (
        <div className="state-panel state-panel--error">
          <strong>Не вдалося завантажити бронювання</strong>
          <span>
            {bookings.error instanceof ApiError
              ? bookings.error.message
              : "Спробуйте пізніше"}
          </span>
          <button className="button button--secondary" onClick={() => bookings.refetch()}>
            Повторити
          </button>
        </div>
      ) : visibleBookings.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">○</span>
          <h2>
            {section === "future"
              ? "Попереду поки вільно"
              : "Історія бронювань порожня"}
          </h2>
          <p>
            {section === "future"
              ? "Оберіть кімнату й зручний слот у календарі."
              : "Минулі зустрічі з’являться тут автоматично."}
          </p>
          {section === "future" && (
            <button
              className="button button--primary"
              onClick={() => navigate("/calendar")}
            >
              Відкрити розклад
            </button>
          )}
        </div>
      ) : (
        <div className="booking-list">
          {visibleBookings.map((booking) => {
            const organizer = booking.organizerId === user.id;
            return (
              <article className="booking-row" key={booking.id}>
                <div className="date-tile">
                  <strong>
                    {new Intl.DateTimeFormat("uk-UA", {
                      day: "2-digit"
                    }).format(new Date(booking.startsAt))}
                  </strong>
                  <span>
                    {new Intl.DateTimeFormat("uk-UA", {
                      month: "short"
                    }).format(new Date(booking.startsAt))}
                  </span>
                </div>
                <button
                  className="booking-row__main"
                  onClick={() =>
                    navigate(
                      `/calendar?roomId=${booking.room.id}&date=${booking.startsAt}`
                    )
                  }
                >
                  <span className="booking-row__time">
                    {new Intl.DateTimeFormat("uk-UA", {
                      hour: "2-digit",
                      minute: "2-digit"
                    }).format(new Date(booking.startsAt))}
                    {" — "}
                    {new Intl.DateTimeFormat("uk-UA", {
                      hour: "2-digit",
                      minute: "2-digit"
                    }).format(new Date(booking.endsAt))}
                  </span>
                  <strong>{booking.title}</strong>
                  <span>{booking.room.name}</span>
                </button>
                <div className="booking-row__aside">
                  <span
                    className={`status-badge${
                      organizer ? " status-badge--own" : ""
                    }`}
                  >
                    {organizer
                      ? "Організатор"
                      : booking.participantStatus === "INVITED"
                        ? "Очікує відповіді"
                        : booking.participantStatus === "ACCEPTED"
                          ? "Прийнято"
                          : "Відмовлено"}
                  </span>
                  {section === "future" &&
                    (organizer ? (
                      <button
                        className="button button--danger button--small"
                        disabled={cancel.isPending}
                        onClick={() => setCancellingBooking(booking)}
                      >
                        Скасувати
                      </button>
                    ) : booking.participantStatus === "INVITED" ? (
                      <div className="button-row button-row--tight">
                        <button
                          className="button button--primary button--small"
                          onClick={() =>
                            respond.mutate({
                              id: booking.id,
                              status: "ACCEPTED"
                            })
                          }
                        >
                          Прийняти
                        </button>
                        <button
                          className="button button--ghost button--small"
                          onClick={() =>
                            respond.mutate({
                              id: booking.id,
                              status: "DECLINED"
                            })
                          }
                        >
                          Відмовитися
                        </button>
                      </div>
                    ) : null)}
                </div>
              </article>
            );
          })}
          {bookings.hasNextPage && (
            <div className="load-more-row">
              <button
                className="button button--secondary"
                onClick={() => bookings.fetchNextPage()}
                disabled={bookings.isFetchingNextPage}
              >
                {bookings.isFetchingNextPage
                  ? "Завантажуємо…"
                  : "Показати більше"}
              </button>
            </div>
          )}
          {bookings.isFetchNextPageError && (
            <div className="form-error load-more-error" role="alert">
              Не вдалося завантажити наступні бронювання.
              <button
                type="button"
                onClick={() => bookings.fetchNextPage()}
              >
                Спробувати ще раз
              </button>
            </div>
          )}
        </div>
      )}
      {cancellingBooking && (
        <CancelBookingDialog
          booking={{
            title: cancellingBooking.title,
            roomName: cancellingBooking.room.name,
            startsAt: cancellingBooking.startsAt,
            endsAt: cancellingBooking.endsAt
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

function ListSkeleton() {
  return (
    <div className="list-skeleton">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index}>
          <i />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

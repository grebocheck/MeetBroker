import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient
} from "@tanstack/react-query";
import { api } from "../lib/api";
import { errorMessage } from "../lib/error-message";
import { useI18n } from "../lib/i18n";
import { navigate } from "../lib/router";
import type { User } from "../types";
import { CancelBookingDialog } from "../components/CancelBookingDialog";
import { Button } from "../components/ui/Button";

interface MyBooking {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  room: { id: string; name: string };
  organizerId: string;
  participationMode: string;
  seriesId: string | null;
  participantStatus: "INVITED" | "ACCEPTED" | "DECLINED" | null;
}

interface BookingPage {
  bookings: MyBooking[];
  hasMore: boolean;
  nextOffset: number | null;
}

export function BookingListPage({ user }: { user: User }) {
  const { dateLocale, t } = useI18n();
  const timeZone =
    user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
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
    mutationFn: ({
      id,
      scope,
    }: {
      id: string;
      scope: "OCCURRENCE" | "FUTURE";
    }) =>
      api<void>(`/api/bookings/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ scope })
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
          <span className="eyebrow">{t("bookings.eyebrow")}</span>
          <h1>{t("myBookings")}</h1>
          <p>{t("bookings.subtitle")}</p>
        </div>
      </header>
      <div className="tabs">
        <button
          className={section === "future" ? "is-active" : ""}
          onClick={() => setSection("future")}
        >
          {t("bookings.future")}
        </button>
        <button
          className={section === "past" ? "is-active" : ""}
          onClick={() => setSection("past")}
        >
          {t("bookings.past")}
        </button>
      </div>

      {bookings.isLoading ? (
        <ListSkeleton />
      ) : bookings.isError && visibleBookings.length === 0 ? (
        <div className="state-panel state-panel--error">
          <strong>{t("bookings.loadError")}</strong>
          <span>
            {errorMessage(bookings.error, t, "bookings.loadError")}
          </span>
          <button className="button button--secondary" onClick={() => bookings.refetch()}>
            {t("retry")}
          </button>
        </div>
      ) : visibleBookings.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">○</span>
          <h2>
            {section === "future"
              ? t("bookings.emptyFuture")
              : t("bookings.emptyPast")}
          </h2>
          <p>
            {section === "future"
              ? t("bookings.emptyFutureBody")
              : t("bookings.emptyPastBody")}
          </p>
          {section === "future" && (
            <button
              className="button button--primary"
              onClick={() => navigate("/calendar")}
            >
              {t("bookings.openSchedule")}
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
                    {new Intl.DateTimeFormat(dateLocale, {
                      day: "2-digit",
                      timeZone
                    }).format(new Date(booking.startsAt))}
                  </strong>
                  <span>
                    {new Intl.DateTimeFormat(dateLocale, {
                      month: "short",
                      timeZone
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
                    {new Intl.DateTimeFormat(dateLocale, {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone
                    }).format(new Date(booking.startsAt))}
                    {" — "}
                    {new Intl.DateTimeFormat(dateLocale, {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone
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
                      ? t("bookings.organizer")
                      : booking.participantStatus === "INVITED"
                        ? t("bookings.awaiting")
                        : booking.participantStatus === "ACCEPTED"
                          ? t("bookings.accepted")
                          : t("bookings.declined")}
                  </span>
                  {booking.seriesId && (
                    <span className="status-badge status-badge--series">
                      {t("bookings.series")}
                    </span>
                  )}
                  {section === "future" &&
                    (organizer ? (
                      <button
                        className="button button--danger button--small"
                        disabled={cancel.isPending}
                        onClick={() => setCancellingBooking(booking)}
                      >
                        {t("cancel")}
                      </button>
                    ) : booking.participantStatus === "INVITED" ? (
                      <div className="button-row button-row--tight">
                        <Button
                          variant="primary"
                          size="small"
                          onClick={() =>
                            respond.mutate({
                              id: booking.id,
                              status: "ACCEPTED"
                            })
                          }
                        >
                          {t("bookings.accept")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() =>
                            respond.mutate({
                              id: booking.id,
                              status: "DECLINED"
                            })
                          }
                        >
                          {t("bookings.decline")}
                        </Button>
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
                  ? t("bookings.loadingMore")
                  : t("bookings.showMore")}
              </button>
            </div>
          )}
          {bookings.isFetchNextPageError && (
            <div className="form-error load-more-error" role="alert">
              {t("bookings.moreError")}
              <button
                type="button"
                onClick={() => bookings.fetchNextPage()}
              >
                {t("retry")}
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
            endsAt: cancellingBooking.endsAt,
            seriesId: cancellingBooking.seriesId,
          }}
          pending={cancel.isPending}
          error={cancel.error}
          timeZone={timeZone}
          onClose={() => {
            cancel.reset();
            setCancellingBooking(null);
          }}
          onConfirm={(scope) =>
            cancel.mutate({ id: cancellingBooking.id, scope })
          }
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

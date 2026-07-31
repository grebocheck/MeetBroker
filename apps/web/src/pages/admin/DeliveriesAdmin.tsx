import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { Pagination } from "../../components/ui/Pagination";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/error-message";
import { useI18n } from "../../lib/i18n";

type DeliveryStatus = "PENDING" | "PROCESSING" | "SENT" | "FAILED";

interface Delivery {
  id: string;
  eventType: string;
  title: string;
  category: string | null;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryResponse {
  deliveries: Delivery[];
  summary: Record<
    "pending" | "processing" | "sent" | "failed" | "exhausted",
    number
  >;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function DeliveriesAdmin() {
  const { dateLocale, t } = useI18n();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({
    status,
    page: String(page),
    limit: "20",
  });
  if (search) query.set("search", search);
  const deliveries = useQuery({
    queryKey: ["admin-notification-deliveries", status, search, page],
    queryFn: () =>
      api<DeliveryResponse>(
        `/api/admin/notification-deliveries?${query.toString()}`,
      ),
    placeholderData: (previousData) => previousData,
  });
  const retry = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/admin/notification-deliveries/${id}/retry`, {
        method: "POST",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["admin-notification-deliveries"],
      }),
  });
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(dateLocale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const statusLabels: Record<DeliveryStatus, string> = {
    PENDING: t("admin.deliveryPending"),
    PROCESSING: t("admin.deliveryProcessing"),
    SENT: t("admin.deliverySent"),
    FAILED: t("admin.deliveryFailed"),
  };

  return (
    <section className="admin-card delivery-admin">
      <div className="admin-card__toolbar activity-toolbar">
        <div>
          <span className="eyebrow">{t("admin.deliveryEyebrow")}</span>
          <h2>{t("admin.deliveries")}</h2>
          <p>{t("admin.deliverySubtitle")}</p>
        </div>
        <div className="segmented delivery-admin__filters">
          {[
            ["", t("admin.all")],
            ["FAILED", t("admin.deliveryFailed")],
            ["PENDING", t("admin.deliveryPending")],
            ["PROCESSING", t("admin.deliveryProcessing")],
            ["SENT", t("admin.deliverySent")],
          ].map(([value, label]) => (
            <button
              key={value}
              className={status === value ? "is-active" : ""}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          className="admin-booking-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <label className="field">
            <span className="sr-only">{t("admin.searchDeliveries")}</span>
            <input
              type="search"
              placeholder={t("admin.deliverySearchPlaceholder")}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <Button type="submit" size="small">
            {t("admin.search")}
          </Button>
        </form>
      </div>

      {deliveries.data && (
        <div className="delivery-summary" aria-label={t("admin.deliveries")}>
          {[
            ["pending", t("admin.deliveryPending")],
            ["processing", t("admin.deliveryProcessing")],
            ["failed", t("admin.deliveryFailed")],
            ["exhausted", t("admin.deliveryExhausted")],
            ["sent", t("admin.deliverySent")],
          ].map(([key, label]) => (
            <div key={key}>
              <span>{label}</span>
              <strong>
                {
                  deliveries.data.summary[
                    key as keyof DeliveryResponse["summary"]
                  ]
                }
              </strong>
            </div>
          ))}
        </div>
      )}

      {deliveries.isLoading ? (
        <div className="subtle-box">{t("admin.loadingDeliveries")}</div>
      ) : deliveries.error ? (
        <div className="form-error">
          {errorMessage(deliveries.error, t, "admin.deliveriesLoadError")}
        </div>
      ) : deliveries.data?.deliveries.length === 0 ? (
        <div className="empty-inline">{t("admin.deliveriesEmpty")}</div>
      ) : (
        <>
          <div className="delivery-list">
            {deliveries.data?.deliveries.map((delivery) => (
              <article className="delivery-row" key={delivery.id}>
                <div className="delivery-row__main">
                  <span className="eyebrow">
                    {t("admin.deliveryEvent", {
                      type: delivery.eventType.replaceAll("_", " "),
                    })}
                  </span>
                  <strong>{delivery.title}</strong>
                  <span>
                    {t("admin.deliveryAttempts", {
                      count: delivery.attempts,
                    })}
                    {" · "}
                    {formatDate(delivery.updatedAt)}
                  </span>
                </div>
                <span
                  className={`status-badge status-badge--delivery-${delivery.status.toLowerCase()}`}
                >
                  {statusLabels[delivery.status]}
                </span>
                <div className="delivery-row__details">
                  <strong>{t("admin.deliveryLastError")}</strong>
                  <span>
                    {delivery.lastError ?? t("admin.deliveryNoError")}
                  </span>
                  {delivery.status === "FAILED" && delivery.attempts < 8 && (
                    <small>
                      {t("admin.deliveryNextAttempt", {
                        date: formatDate(delivery.nextAttemptAt),
                      })}
                    </small>
                  )}
                </div>
                {delivery.status === "FAILED" && (
                  <Button
                    size="small"
                    variant="primary"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(delivery.id)}
                  >
                    {retry.isPending && retry.variables === delivery.id
                      ? t("admin.deliveryRetrying")
                      : t("admin.deliveryRetry")}
                  </Button>
                )}
                {retry.isError && retry.variables === delivery.id && (
                  <div className="form-error">
                    {errorMessage(retry.error, t, "admin.deliveryRetryError")}
                  </div>
                )}
              </article>
            ))}
          </div>
          {deliveries.data && (
            <Pagination
              page={deliveries.data.pagination.page}
              totalPages={deliveries.data.pagination.totalPages}
              total={deliveries.data.pagination.total}
              itemLabel={t("admin.deliveryItems")}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}

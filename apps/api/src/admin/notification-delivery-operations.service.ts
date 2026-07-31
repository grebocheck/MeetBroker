import { HttpStatus, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, ilike, or, SQL, sql } from "drizzle-orm";
import { apiError } from "../common/http-error";
import { recordActivity } from "../common/record-activity";
import { DatabaseService } from "../database/database.service";
import { notificationOutbox } from "../database/schema";

const DELIVERY_STATUSES = ["PENDING", "PROCESSING", "SENT", "FAILED"] as const;
type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

@Injectable()
export class NotificationDeliveryOperationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(status?: string, search?: string, page = 1, limit = 20) {
    const normalizedStatus = DELIVERY_STATUSES.includes(
      status?.toUpperCase() as DeliveryStatus,
    )
      ? (status!.toUpperCase() as DeliveryStatus)
      : undefined;
    const normalizedSearch = search?.trim().slice(0, 160) ?? "";
    const normalizedPage = Number.isFinite(page)
      ? Math.max(Math.trunc(page), 1)
      : 1;
    const normalizedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.trunc(limit), 1), 100)
      : 20;
    const filters: SQL[] = [];
    if (normalizedStatus) {
      filters.push(eq(notificationOutbox.status, normalizedStatus));
    }
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch.replace(/[%_]/g, "\\$&")}%`;
      filters.push(
        or(
          ilike(notificationOutbox.eventType, pattern),
          ilike(notificationOutbox.eventKey, pattern),
          ilike(notificationOutbox.lastError, pattern),
          sql`${notificationOutbox.payload}->>'title' ilike ${pattern}`,
        )!,
      );
    }
    const where = filters.length ? and(...filters) : undefined;
    const [rows, totals, summary] = await Promise.all([
      this.database.orm
        .select({
          id: notificationOutbox.id,
          eventType: notificationOutbox.eventType,
          payload: notificationOutbox.payload,
          status: notificationOutbox.status,
          attempts: notificationOutbox.attempts,
          nextAttemptAt: notificationOutbox.nextAttemptAt,
          lastError: notificationOutbox.lastError,
          processedAt: notificationOutbox.processedAt,
          createdAt: notificationOutbox.createdAt,
          updatedAt: notificationOutbox.updatedAt,
        })
        .from(notificationOutbox)
        .where(where)
        .orderBy(
          asc(
            sql`case when ${notificationOutbox.status} = 'FAILED' then 0 else 1 end`,
          ),
          desc(notificationOutbox.updatedAt),
        )
        .limit(normalizedLimit)
        .offset((normalizedPage - 1) * normalizedLimit),
      this.database.orm
        .select({ total: sql<number>`count(*)::int` })
        .from(notificationOutbox)
        .where(where),
      this.database.orm
        .select({
          pending: sql<number>`count(*) filter (where ${notificationOutbox.status} = 'PENDING')::int`,
          processing: sql<number>`count(*) filter (where ${notificationOutbox.status} = 'PROCESSING')::int`,
          sent: sql<number>`count(*) filter (where ${notificationOutbox.status} = 'SENT')::int`,
          failed: sql<number>`count(*) filter (where ${notificationOutbox.status} = 'FAILED')::int`,
          exhausted: sql<number>`count(*) filter (where ${notificationOutbox.status} = 'FAILED' and ${notificationOutbox.attempts} >= 8)::int`,
        })
        .from(notificationOutbox),
    ]);
    const total = Number(totals[0]?.total ?? 0);
    return {
      deliveries: rows.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        title: row.payload.title,
        category: row.payload.category ?? null,
        status: row.status,
        attempts: row.attempts,
        nextAttemptAt: row.nextAttemptAt,
        lastError: row.lastError,
        processedAt: row.processedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      summary: {
        pending: Number(summary[0]?.pending ?? 0),
        processing: Number(summary[0]?.processing ?? 0),
        sent: Number(summary[0]?.sent ?? 0),
        failed: Number(summary[0]?.failed ?? 0),
        exhausted: Number(summary[0]?.exhausted ?? 0),
      },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages: Math.max(Math.ceil(total / normalizedLimit), 1),
      },
    };
  }

  async retry(actorId: string, deliveryId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const orm = this.database.ormFor(client);
      const rows = await orm
        .select({
          id: notificationOutbox.id,
          status: notificationOutbox.status,
          attempts: notificationOutbox.attempts,
          eventType: notificationOutbox.eventType,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, deliveryId))
        .limit(1)
        .for("update");
      const delivery = rows[0];
      if (!delivery) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "NOTIFICATION_DELIVERY_NOT_FOUND",
          "Notification delivery was not found",
        );
      }
      if (delivery.status !== "FAILED") {
        throw apiError(
          HttpStatus.CONFLICT,
          "NOTIFICATION_DELIVERY_NOT_FAILED",
          "Only failed notification deliveries can be retried",
        );
      }
      await orm
        .update(notificationOutbox)
        .set({
          status: "PENDING",
          attempts: 0,
          nextAttemptAt: sql`now()`,
          lastError: null,
          processedAt: null,
          updatedAt: sql`now()`,
        })
        .where(eq(notificationOutbox.id, deliveryId));
      await recordActivity(
        client,
        actorId,
        "NOTIFICATION_DELIVERY_RETRIED",
        "NOTIFICATION_DELIVERY",
        deliveryId,
        {
          eventType: delivery.eventType,
          previousAttempts: delivery.attempts,
        },
      );
    });
  }
}

import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { addDays, differenceInCalendarDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { randomUUID } from "node:crypto";
import { apiError } from "../common/http-error";
import { DatabaseService } from "../database/database.service";
import type { CreateRoomBlockDto } from "./admin.dto";

type RoomBlockOccurrence = {
  startsAt: Date;
  endsAt: Date;
};

@Injectable()
export class RoomAvailabilityService {
  private readonly officeTimeZone: string;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService,
  ) {
    this.officeTimeZone =
      config.get<string>("OFFICE_TIMEZONE") ?? "Europe/Kyiv";
  }

  async create(actorId: string, dto: CreateRoomBlockDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertRange(startsAt, endsAt);

    const recurrence = dto.recurrence ?? "NONE";
    if (recurrence === "NONE") {
      return this.createSingle(actorId, dto, startsAt, endsAt);
    }

    const schedule = this.recurrenceSchedule(dto, startsAt, endsAt);
    const seriesId = randomUUID();
    await this.database.transaction(async (client) => {
      await client.query(
        `
          insert into room_block_series (
            id, room_id, title, private_note, frequency,
            recurrence_interval, weekdays, starts_at, ends_at,
            recurrence_until, timezone, created_by
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          seriesId,
          dto.roomId,
          dto.title.trim(),
          dto.privateNote?.trim() || null,
          recurrence,
          schedule.interval,
          schedule.weekdays,
          startsAt,
          endsAt,
          schedule.untilKey,
          this.officeTimeZone,
          actorId,
        ],
      );
      for (const [index, occurrence] of schedule.occurrences.entries()) {
        await client.query(
          `
            insert into room_blocks (
              id, room_id, title, private_note, starts_at, ends_at,
              created_by, series_id, occurrence_index
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            randomUUID(),
            dto.roomId,
            dto.title.trim(),
            dto.privateNote?.trim() || null,
            occurrence.startsAt,
            occurrence.endsAt,
            actorId,
            seriesId,
            index,
          ],
        );
      }
    });
    await this.audit(
      actorId,
      "ROOM_BLOCK_SERIES_CREATED",
      "ROOM_BLOCK_SERIES",
      seriesId,
      {
        roomId: dto.roomId,
        recurrence,
        recurrenceInterval: schedule.interval,
        weekdays: schedule.weekdays,
        recurrenceUntil: schedule.untilKey,
        occurrenceCount: schedule.occurrences.length,
      },
    );
    return { id: seriesId, occurrenceCount: schedule.occurrences.length };
  }

  async list(roomId?: string) {
    const result = await this.database.query<{
      id: string;
      kind: "ONCE" | "SERIES";
      room_id: string;
      room_name: string;
      title: string;
      private_note: string | null;
      starts_at: Date;
      ends_at: Date;
      frequency: "DAILY" | "WEEKLY" | null;
      recurrence_interval: number | null;
      weekdays: number[] | null;
      recurrence_until: string | null;
      occurrence_count: string;
    }>(
      `
        select
          rb.id,
          'ONCE'::text as kind,
          rb.room_id,
          r.name as room_name,
          rb.title,
          rb.private_note,
          rb.starts_at,
          rb.ends_at,
          null::text as frequency,
          null::integer as recurrence_interval,
          null::smallint[] as weekdays,
          null::text as recurrence_until,
          '1'::text as occurrence_count
        from room_blocks rb
        join rooms r on r.id = rb.room_id
        where rb.series_id is null
          and rb.cancelled_at is null
          and rb.ends_at > now()
          and ($1 = '' or rb.room_id::text = $1)
        union all
        select
          s.id,
          'SERIES'::text as kind,
          s.room_id,
          r.name,
          s.title,
          s.private_note,
          s.starts_at,
          s.ends_at,
          s.frequency,
          s.recurrence_interval,
          s.weekdays,
          s.recurrence_until::text,
          count(rb.id) filter (
            where rb.cancelled_at is null and rb.ends_at > now()
          )::text
        from room_block_series s
        join rooms r on r.id = s.room_id
        left join room_blocks rb on rb.series_id = s.id
        where s.cancelled_at is null
          and ($1 = '' or s.room_id::text = $1)
        group by s.id, r.name
        having count(rb.id) filter (
          where rb.cancelled_at is null and rb.ends_at > now()
        ) > 0
        order by starts_at
      `,
      [roomId?.trim() ?? ""],
    );
    return result.rows.map((block) => ({
      id: block.id,
      kind: block.kind,
      roomId: block.room_id,
      roomName: block.room_name,
      title: block.title,
      privateNote: block.private_note,
      startsAt: block.starts_at,
      endsAt: block.ends_at,
      frequency: block.frequency,
      recurrenceInterval: block.recurrence_interval,
      weekdays: block.weekdays,
      recurrenceUntil: block.recurrence_until,
      occurrenceCount: Number(block.occurrence_count),
    }));
  }

  async cancel(actorId: string, id: string, scope: string): Promise<void> {
    if (scope === "series") {
      await this.cancelSeries(actorId, id);
      return;
    }
    const result = await this.database.query(
      `
        update room_blocks
        set cancelled_at = now()
        where id = $1 and cancelled_at is null
      `,
      [id],
    );
    if (!result.rowCount) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "ROOM_BLOCK_NOT_FOUND",
        "Room unavailability interval was not found",
      );
    }
    await this.audit(actorId, "ROOM_BLOCK_CANCELLED", "ROOM_BLOCK", id);
  }

  private async createSingle(
    actorId: string,
    dto: CreateRoomBlockDto,
    startsAt: Date,
    endsAt: Date,
  ) {
    const id = randomUUID();
    await this.database.query(
      `
        insert into room_blocks (
          id, room_id, title, private_note, starts_at, ends_at, created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        id,
        dto.roomId,
        dto.title.trim(),
        dto.privateNote?.trim() || null,
        startsAt,
        endsAt,
        actorId,
      ],
    );
    await this.audit(actorId, "ROOM_BLOCK_CREATED", "ROOM_BLOCK", id, {
      roomId: dto.roomId,
      recurrence: "NONE",
      startsAt,
      endsAt,
    });
    return { id, occurrenceCount: 1 };
  }

  private recurrenceSchedule(
    dto: CreateRoomBlockDto,
    startsAt: Date,
    endsAt: Date,
  ): {
    interval: number;
    weekdays: number[] | null;
    untilKey: string;
    occurrences: RoomBlockOccurrence[];
  } {
    if (!dto.recurrenceUntil) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "RECURRENCE_END_REQUIRED",
        "Recurring room unavailability must have an end date",
      );
    }
    const recurrence = dto.recurrence!;
    const interval = dto.recurrenceInterval ?? 1;
    const weekdays =
      recurrence === "WEEKLY"
        ? [...new Set(dto.weekdays ?? [])].sort((a, b) => a - b)
        : null;
    if (recurrence === "WEEKLY" && !weekdays?.length) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "RECURRENCE_WEEKDAYS_REQUIRED",
        "Weekly recurrence must include at least one weekday",
      );
    }

    const startLocal = toZonedTime(startsAt, this.officeTimeZone);
    const startKey = this.localDateKey(startLocal);
    const untilKey = dto.recurrenceUntil.slice(0, 10);
    const recurrenceDays = differenceInCalendarDays(
      new Date(`${untilKey}T12:00:00Z`),
      new Date(`${startKey}T12:00:00Z`),
    );
    if (recurrenceDays < 0 || recurrenceDays > 366) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_RECURRENCE_RANGE",
        "Recurrence must end between its start date and one year later",
      );
    }

    const durationMs = endsAt.getTime() - startsAt.getTime();
    const time = `${String(startLocal.getHours()).padStart(2, "0")}:${String(
      startLocal.getMinutes(),
    ).padStart(2, "0")}:00`;
    const occurrences: RoomBlockOccurrence[] = [];
    for (let dayOffset = 0; dayOffset <= recurrenceDays; dayOffset += 1) {
      const localDay = addDays(startLocal, dayOffset);
      const eligible =
        recurrence === "DAILY"
          ? dayOffset % interval === 0
          : Math.floor(dayOffset / 7) % interval === 0 &&
            weekdays!.includes(localDay.getDay());
      if (!eligible) continue;
      const occurrenceStart = fromZonedTime(
        `${this.localDateKey(localDay)}T${time}`,
        this.officeTimeZone,
      );
      if (occurrenceStart < startsAt) continue;
      occurrences.push({
        startsAt: occurrenceStart,
        endsAt: new Date(occurrenceStart.getTime() + durationMs),
      });
    }
    if (!occurrences.length) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "EMPTY_RECURRENCE",
        "Recurrence does not produce any room unavailability intervals",
      );
    }
    return { interval, weekdays, untilKey, occurrences };
  }

  private async cancelSeries(actorId: string, id: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const series = await client.query(
        `
          update room_block_series
          set cancelled_at = now(), cancelled_by = $2
          where id = $1 and cancelled_at is null
        `,
        [id, actorId],
      );
      if (!series.rowCount) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "ROOM_BLOCK_SERIES_NOT_FOUND",
          "Room unavailability series was not found",
        );
      }
      await client.query(
        `
          update room_blocks
          set cancelled_at = now()
          where series_id = $1 and cancelled_at is null and ends_at > now()
        `,
        [id],
      );
    });
    await this.audit(
      actorId,
      "ROOM_BLOCK_SERIES_CANCELLED",
      "ROOM_BLOCK_SERIES",
      id,
    );
  }

  private assertRange(startsAt: Date, endsAt: Date): void {
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      startsAt >= endsAt
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_BLOCK_RANGE",
        "Room block time is invalid",
      );
    }
    if (endsAt.getTime() - startsAt.getTime() > 24 * 60 * 60 * 1000) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "BLOCK_DURATION_TOO_LONG",
        "A room unavailability interval cannot exceed 24 hours",
      );
    }
  }

  private localDateKey(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  private async audit(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: unknown = {},
  ): Promise<void> {
    await this.database.query(
      `
        insert into audit_logs
          (id, actor_id, action, target_type, target_id, details)
        values ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        randomUUID(),
        actorId,
        action,
        targetType,
        targetId,
        JSON.stringify(details),
      ],
    );
  }
}

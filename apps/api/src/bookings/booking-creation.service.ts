import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AccessPoliciesService } from "../access-policies/access-policies.service";
import { DatabaseService } from "../database/database.service";
import { apiError } from "../common/http-error";
import { recordActivity } from "../common/record-activity";
import type { CurrentUser } from "../common/types";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreateBookingDto } from "./bookings.dto";
import {
  bookingRuleMessage,
  BookingRuleError,
  normalizeMeetingUrl,
  validateBookingRules,
  validateMeetingRules,
} from "./booking-rules";
import { bookingInvitationCopy } from "./booking-notification-copy";
import {
  buildRecurrenceOccurrences,
  RecurrenceError,
  type RecurrenceOccurrence,
} from "./recurrence";
import { BookingAttendeesService } from "./booking-attendees.service";

interface RoomRow {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  work_start: string;
  work_end: string;
  working_days: number[];
  image_path: string | null;
  image_url: string | null;
  active: boolean;
}

@Injectable()
export class BookingCreationService {
  private readonly officeTimeZone: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly accessPolicies: AccessPoliciesService,
    private readonly bookingAttendees: BookingAttendeesService,
    config: ConfigService,
  ) {
    this.officeTimeZone =
      config.get<string>("OFFICE_TIMEZONE") ?? "Europe/Kyiv";
  }

  async create(user: CurrentUser, dto: CreateBookingDto) {
    const title = dto.title.trim();
    if (!title) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "TITLE_REQUIRED",
        "Booking title is required",
      );
    }
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const meetingType = dto.meetingType ?? "ROOM";
    const meetingUrl =
      meetingType === "ONLINE" ? normalizeMeetingUrl(dto.meetingUrl) : null;
    if (meetingType === "ROOM" && !dto.roomId) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "ROOM_REQUIRED",
        "A room is required for an in-person meeting",
      );
    }
    if (meetingType === "ONLINE" && !meetingUrl) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "MEETING_URL_REQUIRED",
        "An HTTPS meeting link is required for an online meeting",
      );
    }
    const participantIds = [
      ...new Set((dto.participantIds ?? []).filter((id) => id !== user.id)),
    ];
    const recurrence = dto.recurrence ?? "NONE";
    const recurrenceInterval = dto.recurrenceInterval ?? 1;
    const weekdays =
      recurrence === "WEEKLY"
        ? [...new Set(dto.weekdays ?? [])].sort((a, b) => a - b)
        : null;
    const recurrenceTimeZone = user.timezone ?? this.officeTimeZone;
    let occurrences: RecurrenceOccurrence[] = [{ startsAt, endsAt }];

    if (recurrence !== "NONE") {
      if (!dto.recurrenceUntil) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "RECURRENCE_END_REQUIRED",
          "Recurring booking must have an end date",
        );
      }
      if (recurrence === "WEEKLY" && !weekdays?.length) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "RECURRENCE_WEEKDAYS_REQUIRED",
          "Weekly recurrence must include at least one weekday",
        );
      }
      try {
        occurrences = buildRecurrenceOccurrences({
          startsAt,
          endsAt,
          frequency: recurrence,
          interval: recurrenceInterval,
          weekdays,
          until: dto.recurrenceUntil,
          timeZone: recurrenceTimeZone,
        });
      } catch (error) {
        if (!(error instanceof RecurrenceError)) throw error;
        const mapped = {
          INVALID_RANGE: [
            "INVALID_RECURRENCE_RANGE",
            "Recurrence must end between its start date and one year later",
          ],
          EMPTY: [
            "EMPTY_RECURRENCE",
            "Recurrence does not produce any bookings",
          ],
          TOO_MANY: [
            "TOO_MANY_OCCURRENCES",
            "A booking series cannot contain more than 100 events",
          ],
        }[error.code];
        throw apiError(HttpStatus.BAD_REQUEST, mapped[0], mapped[1]);
      }
    }

    return this.database.transaction(async (client) => {
      let room: RoomRow | null = null;
      if (meetingType === "ROOM") {
        await client.query("select pg_advisory_xact_lock(hashtext($1))", [
          dto.roomId,
        ]);
        const roomResult = await client.query<RoomRow>(
          `
            select id, name, floor, capacity, work_start::text, work_end::text,
              working_days, image_path, image_url, active
            from rooms where id = $1
          `,
          [dto.roomId],
        );
        room = roomResult.rows[0] ?? null;
        if (!room || !room.active) {
          throw apiError(
            HttpStatus.NOT_FOUND,
            "ROOM_NOT_FOUND",
            "Room was not found",
          );
        }
      }

      await this.assertCanCreate(client, user.id, room?.id);
      const overrideReason =
        meetingType === "ROOM" ? dto.overrideReason?.trim() : undefined;
      if (room && participantIds.length + 1 > room.capacity) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "ROOM_CAPACITY_EXCEEDED",
          "Number of participants exceeds room capacity",
        );
      }
      const participants = await this.bookingAttendees.loadEligible(
        client,
        participantIds,
      );
      if (participants.length !== participantIds.length) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "INVALID_PARTICIPANT",
          "One or more participants are unavailable",
        );
      }
      await this.bookingAttendees.lock(client, [user.id, ...participantIds]);
      await this.bookingAttendees.assertAvailable(
        client,
        [user.id, ...participantIds],
        occurrences,
      );

      const seriesId = recurrence === "NONE" ? null : randomUUID();
      if (seriesId) {
        await client.query(
          `
            insert into booking_series (
              id, organizer_id, room_id, frequency, recurrence_interval,
              weekdays, starts_at, ends_at, recurrence_until, timezone,
              meeting_type, meeting_url
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            seriesId,
            user.id,
            room?.id ?? null,
            recurrence,
            recurrenceInterval,
            weekdays,
            startsAt,
            endsAt,
            dto.recurrenceUntil!.slice(0, 10),
            recurrenceTimeZone,
            meetingType,
            meetingUrl,
          ],
        );
      }

      const bookingIds: string[] = [];
      for (const [occurrenceIndex, occurrence] of occurrences.entries()) {
        const ruleError = room
          ? validateBookingRules({
              startsAt: occurrence.startsAt,
              endsAt: occurrence.endsAt,
              now: new Date(),
              officeTimeZone: this.officeTimeZone,
              workStart: room.work_start,
              workEnd: room.work_end,
              workingDays: room.working_days,
            })
          : validateMeetingRules({
              startsAt: occurrence.startsAt,
              endsAt: occurrence.endsAt,
              now: new Date(),
              officeTimeZone: this.officeTimeZone,
            });
        if (
          ruleError &&
          !(
            user.role === "ADMIN" &&
            (ruleError === "OUTSIDE_WORKING_HOURS" ||
              ruleError === "OUTSIDE_WORKING_DAYS") &&
            overrideReason
          )
        ) {
          throw this.ruleException(ruleError);
        }

        if (room) {
          const block = await client.query(
            `
              select id
              from room_blocks
              where room_id = $1
                and cancelled_at is null
                and starts_at < $3
                and ends_at > $2
              limit 1
            `,
            [room.id, occurrence.startsAt, occurrence.endsAt],
          );
          if (block.rowCount && !(user.role === "ADMIN" && overrideReason)) {
            throw apiError(
              HttpStatus.CONFLICT,
              "ROOM_UNAVAILABLE",
              "Room is unavailable during one of the requested events",
              { startsAt: occurrence.startsAt },
            );
          }
        }

        const bookingId = randomUUID();
        try {
          await client.query(
            `
              insert into bookings (
                id, room_id, organizer_id, title, starts_at, ends_at,
                participation_mode, override_reason, series_id,
                occurrence_index, meeting_type, meeting_url
              )
              values (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
              )
            `,
            [
              bookingId,
              room?.id ?? null,
              user.id,
              title,
              occurrence.startsAt,
              occurrence.endsAt,
              dto.participationMode ?? "INVITE_ONLY",
              overrideReason || null,
              seriesId,
              seriesId ? occurrenceIndex : null,
              meetingType,
              meetingUrl,
            ],
          );
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            (error as Error & { code: string }).code === "23P01"
          ) {
            throw apiError(
              HttpStatus.CONFLICT,
              "SLOT_TAKEN",
              "One of the requested time slots is already booked",
              { startsAt: occurrence.startsAt },
            );
          }
          throw error;
        }
        bookingIds.push(bookingId);

        for (const participant of participants) {
          await client.query(
            `
              insert into booking_participants (booking_id, user_id, status)
              values ($1, $2, 'INVITED')
            `,
            [bookingId, participant.id],
          );
          const invitation = bookingInvitationCopy(
            user.name,
            title,
            room?.name ?? null,
            occurrence.startsAt,
            participant,
            this.officeTimeZone,
          );
          await this.notifications.enqueue(client, {
            eventKey: `booking:${bookingId}:invite:${participant.id}`,
            userId: participant.id,
            type: "BOOKING_INVITATION",
            category: "INVITATIONS",
            title: invitation.title,
            body: invitation.body,
            bookingId,
          });
        }

        if (overrideReason) {
          await client.query(
            `
              insert into audit_logs
                (id, actor_id, action, target_type, target_id, details)
              values ($1, $2, 'BOOKING_AVAILABILITY_OVERRIDE', 'BOOKING', $3, $4)
            `,
            [
              randomUUID(),
              user.id,
              bookingId,
              JSON.stringify({ reason: overrideReason, seriesId }),
            ],
          );
        }

        await recordActivity(
          client,
          user.id,
          "BOOKING_CREATED",
          "BOOKING",
          bookingId,
          {
            title,
            roomName: room?.name ?? null,
            meetingType,
            meetingUrl,
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
            participationMode: dto.participationMode ?? "INVITE_ONLY",
            participantCount: participants.length,
            seriesId,
            occurrenceIndex: seriesId ? occurrenceIndex : null,
          },
        );
      }

      return {
        id: bookingIds[0],
        seriesId,
        occurrenceCount: bookingIds.length,
      };
    });
  }

  private async assertCanCreate(
    client: PoolClient,
    userId: string,
    roomId?: string,
  ): Promise<void> {
    await this.accessPolicies.assertAllowed(
      client,
      userId,
      "BOOKING_CREATE",
      roomId,
    );
  }

  private ruleException(code: BookingRuleError) {
    return apiError(HttpStatus.BAD_REQUEST, code, bookingRuleMessage(code));
  }
}

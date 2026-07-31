import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { apiError } from "../common/http-error";
import { recordActivity } from "../common/record-activity";
import type { CurrentUser } from "../common/types";
import { DatabaseService } from "../database/database.service";

interface BookingImageOwner {
  organizer_id: string;
  image_path: string | null;
  cancelled_at: Date | null;
}

@Injectable()
export class BookingImagesService {
  private readonly uploadDir: string;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService,
  ) {
    this.uploadDir =
      config.get<string>("UPLOAD_DIR") ??
      resolve(process.cwd(), "storage/uploads");
  }

  async save(user: CurrentUser, bookingId: string, file: Express.Multer.File) {
    const booking = await this.authorizedBooking(
      user,
      bookingId,
      "update this meeting image",
    );
    const processed = await this.process(file.buffer);

    await mkdir(this.uploadDir, { recursive: true });
    const filename = `booking-${randomUUID()}.webp`;
    await writeFile(resolve(this.uploadDir, filename), processed, {
      flag: "wx",
    });
    try {
      await this.database.transaction(async (client) => {
        await client.query(
          `
            update bookings
            set image_path = $2, updated_at = now()
            where id = $1 and cancelled_at is null
          `,
          [bookingId, filename],
        );
        await recordActivity(
          client,
          user.id,
          "BOOKING_IMAGE_UPDATED",
          "BOOKING",
          bookingId,
        );
      });
    } catch (error) {
      await this.removeFile(filename);
      throw error;
    }
    if (booking.image_path && booking.image_path !== filename) {
      await this.removeFile(booking.image_path);
    }
    return { imageUrl: `/uploads/${filename}` };
  }

  async remove(user: CurrentUser, bookingId: string): Promise<void> {
    const booking = await this.authorizedBooking(
      user,
      bookingId,
      "remove this meeting image",
    );
    await this.database.transaction(async (client) => {
      await client.query(
        "update bookings set image_path = null, updated_at = now() where id = $1",
        [bookingId],
      );
      await recordActivity(
        client,
        user.id,
        "BOOKING_IMAGE_REMOVED",
        "BOOKING",
        bookingId,
      );
    });
    if (booking.image_path) await this.removeFile(booking.image_path);
  }

  private async authorizedBooking(
    user: CurrentUser,
    bookingId: string,
    action: string,
  ): Promise<BookingImageOwner> {
    const result = await this.database.query<BookingImageOwner>(
      `
        select organizer_id, image_path, cancelled_at
        from bookings
        where id = $1
      `,
      [bookingId],
    );
    const booking = result.rows[0];
    if (!booking || booking.cancelled_at) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "BOOKING_NOT_FOUND",
        "Booking was not found",
      );
    }
    if (booking.organizer_id !== user.id && user.role !== "ADMIN") {
      throw apiError(
        HttpStatus.FORBIDDEN,
        "NOT_BOOKING_OWNER",
        `Only the organizer can ${action}`,
      );
    }
    return booking;
  }

  private async process(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer, {
        failOn: "warning",
        limitInputPixels: 30_000_000,
      })
        .rotate()
        .resize(1400, 788, { fit: "cover", position: "attention" })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_BOOKING_IMAGE",
        "Meeting image must be a valid image",
      );
    }
  }

  private async removeFile(filename: string): Promise<void> {
    await unlink(resolve(this.uploadDir, filename)).catch(() => undefined);
  }
}

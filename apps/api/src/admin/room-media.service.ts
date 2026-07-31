import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { apiError } from "../common/http-error";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class RoomMediaService {
  private readonly uploadDir: string;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService,
  ) {
    this.uploadDir =
      config.get<string>("UPLOAD_DIR") ??
      resolve(process.cwd(), "storage/uploads");
  }

  async save(actorId: string, roomId: string, file: Express.Multer.File) {
    const previousPath = await this.roomImagePath(roomId);

    let processed: Buffer;
    try {
      processed = await sharp(file.buffer, {
        failOn: "warning",
        limitInputPixels: 30_000_000,
      })
        .rotate()
        .resize(1600, 900, { fit: "cover", position: "attention" })
        .webp({ quality: 84 })
        .toBuffer();
    } catch {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_ROOM_IMAGE",
        "Room image must be a valid image",
      );
    }

    await mkdir(this.uploadDir, { recursive: true });
    const filename = `room-${randomUUID()}.webp`;
    await writeFile(resolve(this.uploadDir, filename), processed, {
      flag: "wx",
    });
    await this.database.query(
      `
        update rooms
        set image_path = $2, image_url = null, updated_at = now()
        where id = $1
      `,
      [roomId, filename],
    );

    if (previousPath && previousPath !== filename) {
      await unlink(resolve(this.uploadDir, previousPath)).catch(
        () => undefined,
      );
    }
    await this.audit(actorId, "ROOM_IMAGE_UPDATED", roomId);
    return { imageUrl: `/uploads/${filename}` };
  }

  async remove(actorId: string, roomId: string): Promise<void> {
    const previousPath = await this.roomImagePath(roomId);
    await this.database.query(
      `
        update rooms
        set image_path = null, image_url = null, updated_at = now()
        where id = $1
      `,
      [roomId],
    );
    if (previousPath) {
      await unlink(resolve(this.uploadDir, previousPath)).catch(
        () => undefined,
      );
    }
    await this.audit(actorId, "ROOM_IMAGE_REMOVED", roomId);
  }

  private async roomImagePath(roomId: string): Promise<string | null> {
    const room = await this.database.query<{ image_path: string | null }>(
      "select image_path from rooms where id = $1",
      [roomId],
    );
    if (!room.rows[0]) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "ROOM_NOT_FOUND",
        "Room was not found",
      );
    }
    return room.rows[0].image_path;
  }

  private async audit(
    actorId: string,
    action: string,
    roomId: string,
  ): Promise<void> {
    await this.database.query(
      `
        insert into audit_logs
          (id, actor_id, action, target_type, target_id, details)
        values ($1, $2, $3, 'ROOM', $4, '{}'::jsonb)
      `,
      [randomUUID(), actorId, action, roomId],
    );
  }
}

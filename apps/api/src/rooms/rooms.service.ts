import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class RoomsService {
  constructor(private readonly database: DatabaseService) {}

  async list(minCapacity?: number) {
    const result = await this.database.query<{
      id: string;
      name: string;
      floor: number;
      capacity: number;
      work_start: string;
      work_end: string;
      working_days: number[];
      image_path: string | null;
      image_url: string | null;
    }>(
      `
        select
          id,
          name,
          floor,
          capacity,
          work_start::text,
          work_end::text,
          working_days,
          image_path,
          image_url
        from rooms
        where active = true
          and ($1::integer is null or capacity >= $1)
        order by floor, name
      `,
      [minCapacity ?? null],
    );

    return result.rows.map((room) => ({
      id: room.id,
      name: room.name,
      floor: room.floor,
      capacity: room.capacity,
      workStart: room.work_start.slice(0, 5),
      workEnd: room.work_end.slice(0, 5),
      workingDays: room.working_days,
      imageUrl: room.image_path
        ? `/uploads/${room.image_path}`
        : room.image_url,
    }));
  }
}

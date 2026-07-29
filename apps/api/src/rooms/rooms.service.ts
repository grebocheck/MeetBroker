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
      image_path: string | null;
    }>(
      `
        select
          id,
          name,
          floor,
          capacity,
          work_start::text,
          work_end::text,
          image_path
        from rooms
        where active = true
          and ($1::integer is null or capacity >= $1)
        order by floor, name
      `,
      [minCapacity ?? null]
    );

    return result.rows.map((room) => ({
      id: room.id,
      name: room.name,
      floor: room.floor,
      capacity: room.capacity,
      workStart: room.work_start.slice(0, 5),
      workEnd: room.work_end.slice(0, 5),
      imageUrl: room.image_path ? `/uploads/${room.image_path}` : null
    }));
  }
}

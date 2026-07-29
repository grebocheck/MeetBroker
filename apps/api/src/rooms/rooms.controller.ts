import { Controller, Get, Query } from "@nestjs/common";
import { Approved } from "../auth/auth.decorators";
import { RoomsService } from "./rooms.service";

@Approved()
@Controller("api/rooms")
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  async list(@Query("minCapacity") minCapacity?: string) {
    const parsed = minCapacity ? Number(minCapacity) : undefined;
    return {
      rooms: await this.rooms.list(
        Number.isInteger(parsed) && Number(parsed) > 0 ? parsed : undefined
      )
    };
  }
}

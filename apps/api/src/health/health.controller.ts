import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/auth.decorators";
import { DatabaseService } from "../database/database.service";

@Controller("api/health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Public()
  @Get()
  async health() {
    await this.database.query("select 1");
    return { status: "ok" };
  }
}

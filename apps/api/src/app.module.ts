import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AccessPoliciesModule } from "./access-policies/access-policies.module";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { BookingsModule } from "./bookings/bookings.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { RoomsModule } from "./rooms/rooms.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AccessPoliciesModule,
    AuthModule,
    UsersModule,
    RoomsModule,
    NotificationsModule,
    BookingsModule,
    AdminModule,
    HealthModule,
  ],
})
export class AppModule {}

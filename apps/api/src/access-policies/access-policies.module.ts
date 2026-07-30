import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AccessPoliciesService } from "./access-policies.service";

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [AccessPoliciesService],
  exports: [AccessPoliciesService],
})
export class AccessPoliciesModule {}

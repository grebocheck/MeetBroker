import { ConfigService } from "@nestjs/config";

export type ApplicationMode = "DEMO" | "PRODUCTION";

export class ApplicationModePolicy {
  readonly mode: ApplicationMode;
  readonly adminApprovalRequired: boolean;

  constructor(config: ConfigService) {
    this.mode = parseApplicationMode(config.get<string>("APP_MODE"));
    this.adminApprovalRequired = this.mode === "PRODUCTION";
  }
}

export function parseApplicationMode(
  value: string | undefined,
): ApplicationMode {
  const normalized = value?.trim().toUpperCase() ?? "PRODUCTION";
  if (normalized === "DEMO" || normalized === "PRODUCTION") {
    return normalized;
  }
  throw new Error(
    `APP_MODE must be DEMO or PRODUCTION, received ${JSON.stringify(value)}`,
  );
}

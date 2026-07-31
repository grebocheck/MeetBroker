import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import {
  ApplicationModePolicy,
  parseApplicationMode,
} from "./application-mode";

describe("application mode", () => {
  it("uses the secure production policy by default", () => {
    const policy = new ApplicationModePolicy(new ConfigService({}));

    expect(policy.mode).toBe("PRODUCTION");
    expect(policy.adminApprovalRequired).toBe(true);
  });

  it("allows demo registrations without administrator approval", () => {
    const policy = new ApplicationModePolicy(
      new ConfigService({ APP_MODE: " demo " }),
    );

    expect(policy.mode).toBe("DEMO");
    expect(policy.adminApprovalRequired).toBe(false);
  });

  it("rejects an ambiguous deployment mode", () => {
    expect(() => parseApplicationMode("staging")).toThrow(
      "APP_MODE must be DEMO or PRODUCTION",
    );
  });
});

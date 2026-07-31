import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

interface QueryCall {
  sql: string;
  values: unknown[] | undefined;
}

function serviceFor(configValues: Record<string, string>) {
  const transactionCalls: QueryCall[] = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      transactionCalls.push({ sql, values });
      return { rowCount: 1, rows: [] };
    }),
  };
  const database = {
    query: vi.fn(async () => ({ rowCount: 0, rows: [] })),
    transaction: vi.fn(
      async (callback: (transactionClient: typeof client) => unknown) =>
        callback(client),
    ),
  };
  const service = new AuthService(
    database as never,
    {} as never,
    new ConfigService(configValues),
  );
  return { service, transactionCalls };
}

function userInsert(calls: QueryCall): boolean {
  return calls.sql.includes("insert into users");
}

describe("AuthService registration policies", () => {
  it("creates a ready user in demo mode without email verification", async () => {
    const { service, transactionCalls } = serviceFor({
      APP_MODE: "DEMO",
      EMAIL_VERIFICATION_REQUIRED: "false",
      NODE_ENV: "development",
    });

    const result = await service.register({
      name: " Demo User ",
      email: " Demo@Example.com ",
      password: "password123",
    });
    const insert = transactionCalls.find(userInsert);

    expect(result.verificationRequired).toBe(false);
    expect(insert?.values?.[1]).toBe("Demo User");
    expect(insert?.values?.[2]).toBe("demo@example.com");
    expect(insert?.values?.[4]).toBe(false);
    expect(insert?.values?.[5]).toBe(false);
    expect(
      transactionCalls.some(({ sql }) =>
        sql.includes("email_verification_tokens"),
      ),
    ).toBe(false);
  });

  it("requires both email verification and approval in production", async () => {
    const { service, transactionCalls } = serviceFor({
      APP_MODE: "PRODUCTION",
      EMAIL_VERIFICATION_REQUIRED: "true",
      NODE_ENV: "production",
      SMTP_HOST: "smtp.example.com",
    });

    const result = await service.register({
      name: "Corporate User",
      email: "corporate@example.com",
      password: "password123",
    });
    const insert = transactionCalls.find(userInsert);

    expect(result.verificationRequired).toBe(true);
    expect(insert?.values?.[4]).toBe(true);
    expect(insert?.values?.[5]).toBe(true);
    expect(
      transactionCalls.some(({ sql }) =>
        sql.includes("email_verification_tokens"),
      ),
    ).toBe(true);
    expect(
      transactionCalls.some(({ sql }) => sql.includes("notification_outbox")),
    ).toBe(true);
  });
});

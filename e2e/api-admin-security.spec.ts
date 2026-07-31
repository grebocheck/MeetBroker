import {
  expect,
  request,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { demoCredentials } from "./demo-credentials";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const adminId = "00000000-0000-4000-8000-000000000001";

let admin: APIRequestContext;
let user: APIRequestContext;

test.beforeAll(async () => {
  [admin, user] = await Promise.all([
    authenticatedContext(
      demoCredentials.admin.email,
      demoCredentials.admin.password,
    ),
    authenticatedContext(
      demoCredentials.user.email,
      demoCredentials.user.password,
    ),
  ]);
});

test.afterAll(async () => {
  await Promise.all([admin.dispose(), user.dispose()]);
});

test("keeps administration endpoints outside the employee boundary", async () => {
  const responses = await Promise.all([
    user.get("/api/admin/users"),
    user.get("/api/admin/audit"),
    user.get("/api/admin/notification-deliveries"),
  ]);

  for (const response of responses) {
    expect(response.status()).toBe(403);
  }
});

test("does not expose role management over HTTP", async () => {
  const response = await admin.patch(`/api/admin/users/${adminId}/role`, {
    data: { role: "USER" },
  });

  expect(response.status()).toBe(404);
});

test("prevents an administrator from revoking their own access", async () => {
  const response = await admin.post(`/api/admin/users/${adminId}/revoke`, {
    data: { reason: "Security boundary integration test" },
  });

  expect(response.status()).toBe(400);
  await expectApiError(response, "CANNOT_REVOKE_SELF");
});

async function authenticatedContext(
  email: string,
  password: string,
): Promise<APIRequestContext> {
  const context = await request.newContext({ baseURL });
  const response = await context.post("/api/auth/login", {
    data: { email, password },
  });
  expect(response.ok()).toBe(true);
  return context;
}

async function expectApiError(
  response: APIResponse,
  code: string,
): Promise<void> {
  const body = (await response.json()) as { error?: { code?: string } };
  expect(body.error?.code).toBe(code);
}

import { describe, expect, it } from "vitest";
import { ApiError } from "../lib/api";
import { authErrorTarget } from "./auth-error";

describe("authErrorTarget", () => {
  it.each([
    ["EMAIL_TAKEN", "email"],
    ["NAME_REQUIRED", "name"],
    ["PASSWORD_LENGTH", "password"],
  ] as const)("maps %s to the matching registration field", (code, field) => {
    expect(authErrorTarget(new ApiError(code, "failed", 400), "register")).toBe(
      field,
    );
  });

  it("places invalid login credentials beside the password field", () => {
    expect(
      authErrorTarget(
        new ApiError("INVALID_CREDENTIALS", "failed", 401),
        "login",
      ),
    ).toBe("password");
  });

  it("keeps network and unknown API failures at form level", () => {
    expect(authErrorTarget(new TypeError("offline"), "login")).toBe("form");
    expect(
      authErrorTarget(
        new ApiError("INTERNAL_ERROR", "failed", 500),
        "register",
      ),
    ).toBe("form");
  });
});

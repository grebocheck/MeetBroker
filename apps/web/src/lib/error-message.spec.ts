import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { errorMessage } from "./error-message";
import { translate } from "./i18n";

const en = (key: Parameters<typeof translate>[1], variables?: Record<string, string | number>) =>
  translate("en", key, variables);
const uk = (key: Parameters<typeof translate>[1], variables?: Record<string, string | number>) =>
  translate("uk", key, variables);

describe("errorMessage", () => {
  it("localizes known API errors instead of exposing server text", () => {
    const error = new ApiError(
      "INVALID_CREDENTIALS",
      "Server-side message",
      401,
    );

    expect(errorMessage(error, en)).toBe(
      translate("en", "errors.INVALID_CREDENTIALS"),
    );
    expect(errorMessage(error, uk)).toBe(
      translate("uk", "errors.INVALID_CREDENTIALS"),
    );
  });

  it("includes a restriction reason supplied by the API", () => {
    const error = new ApiError(
      "CAPABILITY_RESTRICTED",
      "Restricted",
      403,
      { reason: "Repeated misuse" },
    );

    expect(errorMessage(error, en)).toContain("Repeated misuse");
  });

  it("uses a safe localized message for network and unknown errors", () => {
    expect(errorMessage(new TypeError("Failed to fetch"), en)).toBe(
      translate("en", "errors.network"),
    );
    expect(
      errorMessage(new Error("Sensitive implementation detail"), uk),
    ).toBe(translate("uk", "errors.generic"));
  });
});

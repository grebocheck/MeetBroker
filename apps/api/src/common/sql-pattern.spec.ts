import { describe, expect, it } from "vitest";
import { escapeLikePattern } from "./sql-pattern";

describe("escapeLikePattern", () => {
  it("escapes PostgreSQL LIKE metacharacters and the escape character", () => {
    expect(escapeLikePattern(String.raw`room\\name_100%`)).toBe(
      String.raw`room\\\\name\_100\%`,
    );
  });

  it("leaves ordinary search terms unchanged", () => {
    expect(escapeLikePattern("Planning release")).toBe("Planning release");
  });
});

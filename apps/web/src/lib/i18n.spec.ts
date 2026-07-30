import { describe, expect, it } from "vitest";
import { en } from "../locales/en";
import { uk } from "../locales/uk";
import { translate } from "./i18n";

describe("i18n catalogs", () => {
  it("keep identical keys in every supported locale", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(uk).sort());
  });

  it("interpolates named values without changing the catalog", () => {
    expect(translate("en", "calendar.fromSeats", { count: 8 })).toBe(
      "8+ seats",
    );
    expect(translate("uk", "calendar.fromSeats", { count: 8 })).toBe(
      "Від 8 місць",
    );
  });
});

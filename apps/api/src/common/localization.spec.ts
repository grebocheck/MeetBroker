import { describe, expect, it } from "vitest";
import { intlLocale, localize } from "./localization";

describe("API localization", () => {
  it("formats every supported locale with its regional date locale", () => {
    expect(intlLocale("uk")).toBe("uk-UA");
    expect(intlLocale("en")).toBe("en-GB");
    expect(intlLocale("de")).toBe("de-DE");
    expect(intlLocale("es")).toBe("es-ES");
    expect(intlLocale("fr")).toBe("fr-FR");
    expect(intlLocale("ja")).toBe("ja-JP");
  });

  it("interpolates notification variables in the selected language", () => {
    expect(
      localize("de", "reminderBody", {
        title: "Planung",
        time: "14:00",
      }),
    ).toBe("„Planung“ beginnt um 14:00.");
    expect(
      localize("ja", "cancelledWithReason", {
        title: "リリース計画",
        reason: "メンテナンス",
      }),
    ).toBe("会議「リリース計画」はキャンセルされました。理由: メンテナンス。");
  });
});

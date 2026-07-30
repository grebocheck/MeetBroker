import { describe, expect, it } from "vitest";
import { de } from "../locales/de";
import { en } from "../locales/en";
import { es } from "../locales/es";
import { fr } from "../locales/fr";
import { ja } from "../locales/ja";
import { uk } from "../locales/uk";
import { resolveBrowserLocale, translate } from "./i18n";

const catalogs = { uk, en, de, es, fr, ja };
const placeholders = (value: string) =>
  [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();

describe("i18n catalogs", () => {
  it("keep identical keys in every supported locale", () => {
    const expected = Object.keys(uk).sort();
    for (const catalog of Object.values(catalogs)) {
      expect(Object.keys(catalog).sort()).toEqual(expected);
    }
  });

  it("preserves interpolation placeholders in every locale", () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      for (const catalog of Object.values(catalogs)) {
        expect(placeholders(catalog[key])).toEqual(placeholders(en[key]));
      }
    }
  });

  it("interpolates named values without changing the catalog", () => {
    expect(translate("en", "calendar.fromSeats", { count: 8 })).toBe(
      "8+ seats",
    );
    expect(translate("uk", "calendar.fromSeats", { count: 8 })).toBe(
      "Від 8 місць",
    );
  });

  it("resolves supported browser locales and falls back to English", () => {
    expect(resolveBrowserLocale("de-AT")).toBe("de");
    expect(resolveBrowserLocale("es-MX")).toBe("es");
    expect(resolveBrowserLocale("fr-CA")).toBe("fr");
    expect(resolveBrowserLocale("ja-JP")).toBe("ja");
    expect(resolveBrowserLocale("pt-BR")).toBe("en");
  });
});

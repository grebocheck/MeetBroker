import type { SearchSelectOption } from "../../components/SearchSelect";

const fallbackTimeZones = [
  "Europe/Kyiv",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Warsaw",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

const currentTimeZoneAliases: Readonly<Record<string, string>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Godthab": "America/Nuuk",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

export function normalizeTimeZone(value: string): string {
  return currentTimeZoneAliases[value] ?? value;
}

export function timeZoneOptions(current: string): SearchSelectOption[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  const browserTimeZones =
    intl.supportedValuesOf?.("timeZone") ?? fallbackTimeZones;
  const zones = Array.from(
    new Set([
      ...browserTimeZones.map(normalizeTimeZone),
      ...fallbackTimeZones.map(normalizeTimeZone),
    ]),
  ).sort((left, right) => left.localeCompare(right));

  if (current && !zones.includes(current)) {
    zones.unshift(current);
  }
  return zones.map((zone) => ({
    value: zone,
    label: zone.replaceAll("_", " "),
  }));
}

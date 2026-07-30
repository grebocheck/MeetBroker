import { describe, expect, it } from "vitest";
import type { useI18n } from "../../lib/i18n";
import {
  formatActivityValue,
  humanizeAction,
  humanizeDetailKey,
  humanizeTarget,
} from "./admin-formatters";

const t = ((key: string) => `translated:${key}`) as ReturnType<
  typeof useI18n
>["t"];

describe("admin audit formatters", () => {
  it("translates known actions and preserves future unknown actions", () => {
    expect(humanizeAction("BOOKING_CREATED", t)).toBe(
      "translated:audit.BOOKING_CREATED",
    );
    expect(humanizeAction("NEW_ACTION", t)).toBe("NEW_ACTION");
  });

  it("translates known target and detail labels with safe fallbacks", () => {
    expect(humanizeTarget("ROOM_BLOCK", t)).toBe(
      "translated:admin.targetRoomBlock",
    );
    expect(humanizeTarget("DEVICE", t)).toBe("DEVICE");
    expect(humanizeDetailKey("participantCount", t)).toBe(
      "translated:admin.participants",
    );
    expect(humanizeDetailKey("newField", t)).toBe("newField");
  });

  it("formats empty, enum, primitive, and structured activity values", () => {
    expect(formatActivityValue(null, "uk-UA", t)).toBe("—");
    expect(formatActivityValue("OPEN", "uk-UA", t)).toBe(
      "translated:admin.statusOpen",
    );
    expect(formatActivityValue(false, "uk-UA", t)).toBe("false");
    expect(formatActivityValue({ count: 2 }, "uk-UA", t)).toBe('{"count":2}');
  });
});

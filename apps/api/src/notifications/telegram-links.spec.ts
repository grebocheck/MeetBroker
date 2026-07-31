import { describe, expect, it } from "vitest";
import {
  normalizeTelegramBotUsername,
  telegramConnectLinks,
} from "./telegram-links";

describe("normalizeTelegramBotUsername", () => {
  it.each([
    ["Heridium_bot", "Heridium_bot"],
    ["@Heridium_bot", "Heridium_bot"],
    ["https://t.me/Heridium_bot", "Heridium_bot"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeTelegramBotUsername(input)).toBe(expected);
  });

  it("rejects unrelated URLs and malformed usernames", () => {
    expect(
      normalizeTelegramBotUsername("https://telegram.org/Heridium_bot"),
    ).toBeUndefined();
    expect(normalizeTelegramBotUsername("bot with spaces")).toBeUndefined();
  });
});

describe("telegramConnectLinks", () => {
  it("builds app and t.me fallbacks with the same start token", () => {
    expect(telegramConnectLinks("Heridium_bot", "opaque_token")).toEqual({
      appUrl: "tg://resolve?domain=Heridium_bot&start=opaque_token",
      webUrl: "https://t.me/Heridium_bot?start=opaque_token",
    });
  });
});

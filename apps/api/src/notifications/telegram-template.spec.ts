import { describe, expect, it } from "vitest";
import { renderTelegramMessage } from "./telegram-template";

describe("renderTelegramMessage", () => {
  it("renders a localized event hierarchy", () => {
    const message = renderTelegramMessage(
      {
        title: "Нове запрошення",
        body: "Ігор запросив вас на «Планування релізу».",
        eventType: "BOOKING_INVITATION",
      },
      "uk",
    );

    expect(message).toContain("📅 <b>Нове запрошення</b>");
    expect(message).toContain("MeetBroker · Запрошення");
    expect(message).toContain("────────────");
  });

  it("escapes untrusted HTML while keeping the template markup", () => {
    const message = renderTelegramMessage(
      {
        title: "<b>Unsafe</b>",
        body: "Meeting & <script>alert(1)</script>",
        eventType: "BOOKING_UPDATED",
      },
      "en",
    );

    expect(message).toContain("<b>&lt;b&gt;Unsafe&lt;/b&gt;</b>");
    expect(message).toContain(
      "Meeting &amp; &lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(message).not.toContain("<script>");
  });

  it("uses a neutral fallback for unknown events", () => {
    expect(
      renderTelegramMessage(
        { title: "System", body: "Something happened", eventType: "CUSTOM" },
        "ja",
      ),
    ).toContain("🔔");
  });
});

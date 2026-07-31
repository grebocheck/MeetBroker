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

    expect(message).toBe(
      [
        "<b>MEETBROKER</b>  •  📅 <b>Запрошення</b>",
        "━━━━━━━━━━━━━━",
        "<b>Нове запрошення</b>",
        "Ігор запросив вас на «Планування релізу».",
        "↗️ <i>Перегляньте деталі у MeetBroker</i>",
      ].join("\n\n"),
    );
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
    expect(message).toContain("↗️ <i>View details in MeetBroker</i>");
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

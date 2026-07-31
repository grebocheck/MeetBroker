import { describe, expect, it } from "vitest";
import { renderEmailHtml } from "./email-template";

describe("renderEmailHtml", () => {
  it("renders a branded, localized call to action", () => {
    const html = renderEmailHtml(
      {
        title: "Підтвердіть email",
        body: "Профіль майже готовий.\n\nПерейдіть: https://meet.test/verify?token=abc",
      },
      "uk",
    );

    expect(html).toContain("MeetBroker / Notification");
    expect(html).toContain("Відкрити MeetBroker");
    expect(html).toContain('href="https://meet.test/verify?token=abc"');
    expect(html).not.toContain("Перейдіть: https://");
  });

  it("escapes untrusted notification content", () => {
    const html = renderEmailHtml(
      {
        title: "<script>alert(1)</script>",
        body: "Meeting <img src=x onerror=alert(1)>",
      },
      "en",
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

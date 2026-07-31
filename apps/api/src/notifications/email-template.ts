import { localize } from "../common/localization";
import type { Locale } from "../common/types";
import type { NotificationMessage } from "./notification-channel";

const URL_PATTERN = /https?:\/\/[^\s<>"]+/i;

export function renderEmailHtml(
  message: NotificationMessage,
  locale: Locale,
): string {
  const actionUrl = message.body.match(URL_PATTERN)?.[0];
  const preheader = actionUrl
    ? message.body.replace(actionUrl, "").replace(/\s+/g, " ").trim()
    : message.body.replace(/\s+/g, " ").trim();
  const paragraphs = message.body
    .split(/\n{2,}/)
    .map((paragraph) => cleanParagraph(paragraph, actionUrl))
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px;color:#bfd3ef;font-size:16px;line-height:1.65;">${escapeHtml(paragraph)}</p>`,
    )
    .join("");
  const action = actionUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 8px;"><tr><td style="background:#159cff;clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%);"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;">${escapeHtml(localize(locale, "emailOpenAction"))}</a></td></tr></table>`
    : "";

  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(message.title)}</title>
</head>
<body style="margin:0;padding:0;background:#020d24;font-family:Arial,'Helvetica Neue',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">${escapeHtml(preheader.slice(0, 140))}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#020d24;">
    <tr>
      <td align="center" style="padding:36px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;border:1px solid #1766b6;background:#082453;">
          <tr>
            <td style="height:8px;background:#159cff;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:26px 34px 18px;background:#06183b;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display:inline-block;width:30px;height:26px;border-left:3px solid #49d5ff;border-bottom:3px solid #49d5ff;vertical-align:middle;"></span>
                    <strong style="margin-left:10px;color:#ffffff;font-size:21px;letter-spacing:-0.6px;vertical-align:middle;">MeetBroker</strong>
                  </td>
                  <td align="right" style="color:#49d5ff;font-size:10px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase;">System / Message</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:42px 34px 38px;background:#0a2d65;">
              <div style="margin-bottom:12px;color:#49d5ff;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">MeetBroker / Notification</div>
              <h1 style="margin:0 0 24px;color:#ffffff;font-size:30px;line-height:1.15;letter-spacing:-1.1px;">${escapeHtml(message.title)}</h1>
              ${paragraphs}
              ${action}
            </td>
          </tr>
          <tr>
            <td style="height:4px;background:#ff4f91;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:20px 34px;background:#06183b;color:#7895bd;font-size:12px;line-height:1.5;">
              ${escapeHtml(localize(locale, "emailFooter"))}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function cleanParagraph(paragraph: string, actionUrl?: string): string {
  if (!actionUrl || !paragraph.includes(actionUrl)) return paragraph.trim();
  return paragraph
    .replace(actionUrl, "")
    .replace(/[:：]\s*$/, "")
    .trim();
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

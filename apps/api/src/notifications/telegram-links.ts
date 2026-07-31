export interface TelegramConnectLinks {
  appUrl: string;
  webUrl: string;
}

export function normalizeTelegramBotUsername(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  let username = trimmed.replace(/^@/, "");
  if (/^https?:\/\//i.test(username)) {
    try {
      const url = new URL(username);
      if (url.hostname !== "t.me" && url.hostname !== "telegram.me") {
        return undefined;
      }
      username = url.pathname.replace(/^\/+|\/+$/g, "");
    } catch {
      return undefined;
    }
  }
  return /^[A-Za-z0-9_]{5,32}$/.test(username) ? username : undefined;
}

export function telegramConnectLinks(
  botUsername: string,
  token: string,
): TelegramConnectLinks {
  const app = new URL("tg://resolve");
  app.searchParams.set("domain", botUsername);
  app.searchParams.set("start", token);

  const web = new URL(`https://t.me/${botUsername}`);
  web.searchParams.set("start", token);
  return { appUrl: app.toString(), webUrl: web.toString() };
}

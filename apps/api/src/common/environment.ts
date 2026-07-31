const BOOLEAN_VALUES = new Set(["true", "false"]);
const TELEGRAM_SECRET_PATTERN = /^[A-Za-z0-9_-]+$/;

type Environment = Record<string, unknown>;

export function validateEnvironment(source: Environment): Environment {
  const environment = { ...source };

  environment.NODE_ENV = enumValue(
    source,
    "NODE_ENV",
    ["development", "test", "production"],
    "production",
  );
  environment.APP_MODE = enumValue(
    source,
    "APP_MODE",
    ["DEMO", "PRODUCTION"],
    "PRODUCTION",
  );
  environment.APP_ORIGIN = httpUrl(source, "APP_ORIGIN");
  environment.DATABASE_URL = databaseUrl(source);
  environment.API_PORT = integerValue(source, "API_PORT", 1, 65_535, 3000);
  environment.SESSION_TTL_DAYS = integerValue(
    source,
    "SESSION_TTL_DAYS",
    1,
    365,
    30,
  );
  environment.NOTIFY_BEFORE_MINUTES = integerValue(
    source,
    "NOTIFY_BEFORE_MINUTES",
    1,
    1_440,
    10,
  );
  environment.WORKER_HEARTBEAT_MAX_AGE_SECONDS = integerValue(
    source,
    "WORKER_HEARTBEAT_MAX_AGE_SECONDS",
    10,
    600,
    45,
  );
  environment.SMTP_PORT = integerValue(source, "SMTP_PORT", 1, 65_535, 587);
  environment.EMAIL_VERIFICATION_REQUIRED = booleanValue(
    source,
    "EMAIL_VERIFICATION_REQUIRED",
    true,
  );
  environment.SMTP_SECURE = booleanValue(source, "SMTP_SECURE", false);
  environment.TELEGRAM_UPDATE_MODE = enumValue(
    source,
    "TELEGRAM_UPDATE_MODE",
    ["WEBHOOK", "POLLING", "DISABLED"],
    "DISABLED",
  );

  validateCookieName(source);
  validateTimezone(source);
  validateTelegram(environment);
  validateProductionEmail(environment);

  return environment;
}

function stringValue(source: Environment, key: string): string | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function enumValue(
  source: Environment,
  key: string,
  allowed: readonly string[],
  fallback: string,
): string {
  const value = stringValue(source, key) ?? fallback;
  const normalized = value.toUpperCase();
  const match = allowed.find(
    (candidate) => candidate.toUpperCase() === normalized,
  );
  if (!match) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
  }
  return match;
}

function integerValue(
  source: Environment,
  key: string,
  minimum: number,
  maximum: number,
  fallback: number,
): string {
  const raw = stringValue(source, key) ?? String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${key} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return String(value);
}

function booleanValue(
  source: Environment,
  key: string,
  fallback: boolean,
): string {
  const value = (stringValue(source, key) ?? String(fallback)).toLowerCase();
  if (!BOOLEAN_VALUES.has(value)) {
    throw new Error(`${key} must be true or false`);
  }
  return value;
}

function httpUrl(source: Environment, key: string): string {
  const raw = stringValue(source, key);
  if (!raw) throw new Error(`${key} is required`);
  let value: URL;
  try {
    value = new URL(raw);
  } catch {
    throw new Error(`${key} must be a valid absolute URL`);
  }
  if (!["http:", "https:"].includes(value.protocol)) {
    throw new Error(`${key} must use http or https`);
  }
  if (value.username || value.password) {
    throw new Error(`${key} must not contain credentials`);
  }
  return value.toString().replace(/\/$/, "");
}

function databaseUrl(source: Environment): string {
  const raw = stringValue(source, "DATABASE_URL");
  if (!raw) throw new Error("DATABASE_URL is required");
  let value: URL;
  try {
    value = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(value.protocol)) {
    throw new Error("DATABASE_URL must use postgres or postgresql");
  }
  return raw;
}

function validateCookieName(source: Environment): void {
  const value = stringValue(source, "SESSION_COOKIE_NAME");
  if (value && !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)) {
    throw new Error("SESSION_COOKIE_NAME contains unsupported characters");
  }
}

function validateTimezone(source: Environment): void {
  const timezone = stringValue(source, "OFFICE_TIMEZONE");
  if (!timezone) return;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new Error("OFFICE_TIMEZONE must be a valid IANA time zone");
  }
}

function validateTelegram(environment: Environment): void {
  const mode = String(environment.TELEGRAM_UPDATE_MODE);
  const token = stringValue(environment, "TELEGRAM_BOT_TOKEN");
  const username = stringValue(environment, "TELEGRAM_BOT_USERNAME");
  const secret = stringValue(environment, "TELEGRAM_WEBHOOK_SECRET");

  if (mode !== "DISABLED" && (!token || !username)) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME are required when Telegram updates are enabled",
    );
  }
  if (mode !== "WEBHOOK") return;
  if (
    !secret ||
    secret.length < 32 ||
    secret.length > 256 ||
    !TELEGRAM_SECRET_PATTERN.test(secret) ||
    secret === "change-me"
  ) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET must contain 32-256 letters, digits, underscores or hyphens",
    );
  }
}

function validateProductionEmail(environment: Environment): void {
  const production = environment.NODE_ENV === "production";
  const verification = environment.EMAIL_VERIFICATION_REQUIRED === "true";
  if (production && verification && !stringValue(environment, "SMTP_HOST")) {
    throw new Error(
      "SMTP_HOST is required when email verification is enabled in production",
    );
  }
}

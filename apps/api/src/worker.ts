import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { NotificationWorkerService } from "./notifications/notification-worker.service";
import { TelegramPollingService } from "./notifications/telegram-polling.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"]
  });
  const worker = app.get(NotificationWorkerService);
  const telegramPolling = app.get(TelegramPollingService);
  let stopping = false;

  const shutdown = async () => {
    stopping = true;
    await app.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (!stopping) {
    const [processed] = await Promise.all([
      worker.processBatch(),
      telegramPolling.processUpdates()
    ]);
    await new Promise((resolveWait) =>
      setTimeout(
        resolveWait,
        processed > 0 ? 250 : telegramPolling.isEnabled() ? 0 : 2_000
      )
    );
  }
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`
  );
  process.exitCode = 1;
});

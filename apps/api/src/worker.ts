import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { writeWorkerHeartbeat } from "./common/worker-heartbeat";
import { NotificationWorkerService } from "./notifications/notification-worker.service";
import { TelegramPollingService } from "./notifications/telegram-polling.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });
  const worker = app.get(NotificationWorkerService);
  const telegramPolling = app.get(TelegramPollingService);
  let stopping = false;
  await writeWorkerHeartbeat("STARTING");

  const shutdown = async () => {
    stopping = true;
    await writeWorkerHeartbeat("STOPPING").catch(() => undefined);
    await app.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (!stopping) {
    let processed = 0;
    try {
      await writeWorkerHeartbeat("RUNNING");
      [processed] = await Promise.all([
        worker.processBatch(),
        telegramPolling.processUpdates(),
      ]);
      await writeWorkerHeartbeat("IDLE", { processed });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : String(error);
      await writeWorkerHeartbeat("DEGRADED", { error: message }).catch(
        () => undefined,
      );
      await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
      continue;
    }
    await new Promise((resolveWait) =>
      setTimeout(
        resolveWait,
        processed > 0 ? 250 : telegramPolling.isEnabled() ? 0 : 2_000,
      ),
    );
  }
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { NotificationWorkerService } from "./notifications/notification-worker.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"]
  });
  const worker = app.get(NotificationWorkerService);
  let stopping = false;

  const shutdown = async () => {
    stopping = true;
    await app.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (!stopping) {
    const processed = await worker.processBatch();
    await new Promise((resolveWait) =>
      setTimeout(resolveWait, processed > 0 ? 250 : 2_000)
    );
  }
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`
  );
  process.exitCode = 1;
});

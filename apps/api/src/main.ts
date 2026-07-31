import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { resolve } from "node:path";
import { ApiErrorFilter } from "./common/api-error.filter";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const production = process.env.NODE_ENV === "production";
  app.set("trust proxy", 1);
  app.use(
    helmet({
      strictTransportSecurity: production
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.APP_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiErrorFilter());
  app.useStaticAssets(
    process.env.UPLOAD_DIR ?? resolve(process.cwd(), "storage/uploads"),
    { prefix: "/uploads/" },
  );
  app.enableShutdownHooks();

  await app.listen(Number(process.env.API_PORT ?? 3000), "0.0.0.0");
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});

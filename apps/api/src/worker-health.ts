import { readHealthyWorkerHeartbeat } from "./common/worker-heartbeat";

readHealthyWorkerHeartbeat()
  .then((heartbeat) => {
    process.stdout.write(
      `worker ${heartbeat.status.toLowerCase()} (${heartbeat.updatedAt})\n`,
    );
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });

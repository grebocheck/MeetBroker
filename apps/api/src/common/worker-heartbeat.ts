import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type WorkerHeartbeatStatus =
  "STARTING" | "RUNNING" | "IDLE" | "DEGRADED" | "STOPPING";

export interface WorkerHeartbeat {
  status: WorkerHeartbeatStatus;
  updatedAt: string;
  pid: number;
  processed?: number;
  error?: string;
}

export const DEFAULT_WORKER_HEARTBEAT_FILE =
  "/tmp/meetbroker-worker-heartbeat.json";
export const DEFAULT_WORKER_HEARTBEAT_MAX_AGE_SECONDS = 45;

export async function writeWorkerHeartbeat(
  status: WorkerHeartbeatStatus,
  details: Pick<WorkerHeartbeat, "processed" | "error"> = {},
  filePath = heartbeatFilePath(),
): Promise<void> {
  const heartbeat: WorkerHeartbeat = {
    status,
    updatedAt: new Date().toISOString(),
    pid: process.pid,
    ...details,
  };
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(temporaryPath, JSON.stringify(heartbeat), {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

export async function readHealthyWorkerHeartbeat(
  filePath = heartbeatFilePath(),
  maxAgeSeconds = heartbeatMaxAgeSeconds(),
  now = Date.now(),
): Promise<WorkerHeartbeat> {
  const heartbeat = JSON.parse(
    await readFile(filePath, "utf8"),
  ) as WorkerHeartbeat;
  const updatedAt = Date.parse(heartbeat.updatedAt);
  if (
    !Number.isFinite(updatedAt) ||
    !Number.isInteger(heartbeat.pid) ||
    !heartbeat.status
  ) {
    throw new Error("Worker heartbeat is malformed");
  }
  if (now - updatedAt > maxAgeSeconds * 1_000) {
    throw new Error("Worker heartbeat is stale");
  }
  if (heartbeat.status === "STOPPING") {
    throw new Error("Worker is stopping");
  }
  return heartbeat;
}

export function heartbeatFilePath(): string {
  return (
    process.env.WORKER_HEARTBEAT_FILE?.trim() || DEFAULT_WORKER_HEARTBEAT_FILE
  );
}

export function heartbeatMaxAgeSeconds(): number {
  const value = Number(process.env.WORKER_HEARTBEAT_MAX_AGE_SECONDS);
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_WORKER_HEARTBEAT_MAX_AGE_SECONDS;
}

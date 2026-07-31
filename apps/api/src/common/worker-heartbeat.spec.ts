import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readHealthyWorkerHeartbeat,
  writeWorkerHeartbeat,
} from "./worker-heartbeat";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function heartbeatPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "meetbroker-heartbeat-"));
  temporaryDirectories.push(directory);
  return join(directory, "worker.json");
}

describe("worker heartbeat", () => {
  it("writes an atomic heartbeat that can be checked", async () => {
    const filePath = await heartbeatPath();

    await writeWorkerHeartbeat("IDLE", { processed: 3 }, filePath);

    await expect(
      readHealthyWorkerHeartbeat(filePath, 30),
    ).resolves.toMatchObject({
      status: "IDLE",
      processed: 3,
      pid: process.pid,
    });
    expect(JSON.parse(await readFile(filePath, "utf8"))).toBeTruthy();
  });

  it("rejects stale and stopping workers", async () => {
    const filePath = await heartbeatPath();
    await writeFile(
      filePath,
      JSON.stringify({
        status: "IDLE",
        updatedAt: "2026-01-01T00:00:00.000Z",
        pid: 42,
      }),
    );

    await expect(
      readHealthyWorkerHeartbeat(
        filePath,
        10,
        Date.parse("2026-01-01T00:00:11.000Z"),
      ),
    ).rejects.toThrow("stale");

    await writeWorkerHeartbeat("STOPPING", {}, filePath);
    await expect(readHealthyWorkerHeartbeat(filePath, 30)).rejects.toThrow(
      "stopping",
    );
  });
});

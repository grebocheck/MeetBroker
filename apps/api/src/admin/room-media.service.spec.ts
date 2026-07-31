import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomMediaService } from "./room-media.service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createService() {
  const uploadDir = await mkdtemp(join(tmpdir(), "meetbroker-room-media-"));
  temporaryDirectories.push(uploadDir);
  const database = {
    query: vi.fn(async (...args: unknown[]) => {
      void args;
      return { rows: [] as unknown[], rowCount: 1 };
    }),
  };
  const config = {
    get: vi.fn((key: string) => (key === "UPLOAD_DIR" ? uploadDir : undefined)),
  };
  return {
    database,
    service: new RoomMediaService(database as never, config as never),
    uploadDir,
  };
}

function upload(buffer: Buffer): Express.Multer.File {
  return {
    buffer,
    destination: "",
    encoding: "7bit",
    fieldname: "image",
    filename: "",
    mimetype: "image/png",
    originalname: "room.png",
    path: "",
    size: buffer.length,
    stream: undefined as never,
  };
}

describe("RoomMediaService", () => {
  it("fails before image processing when the room does not exist", async () => {
    const { database, service } = await createService();

    await expect(
      service.save("actor-id", "missing-room", upload(Buffer.from("invalid"))),
    ).rejects.toMatchObject({
      response: { code: "ROOM_NOT_FOUND", message: "Room was not found" },
      status: 404,
    });
    expect(database.query).toHaveBeenCalledOnce();
  });

  it("rejects malformed image bytes without changing the room", async () => {
    const { database, service } = await createService();
    database.query.mockResolvedValueOnce({
      rows: [{ image_path: null }],
      rowCount: 1,
    });

    await expect(
      service.save("actor-id", "room-id", upload(Buffer.from("invalid"))),
    ).rejects.toMatchObject({
      response: {
        code: "INVALID_ROOM_IMAGE",
        message: "Room image must be a valid image",
      },
      status: 400,
    });
    expect(database.query).toHaveBeenCalledOnce();
  });

  it("stores an optimized WebP and returns its public uploads path", async () => {
    const { database, service, uploadDir } = await createService();
    database.query.mockResolvedValueOnce({
      rows: [{ image_path: "previous.webp" }],
      rowCount: 1,
    });
    const source = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: "#157fdb",
      },
    })
      .png()
      .toBuffer();

    const result = await service.save("actor-id", "room-id", upload(source));

    expect(result.imageUrl).toMatch(/^\/uploads\/room-.+\.webp$/);
    const [filename] = await readdir(uploadDir);
    expect(result.imageUrl).toBe(`/uploads/${filename}`);
    await expect(
      sharp(join(uploadDir, filename)).metadata(),
    ).resolves.toMatchObject({
      format: "webp",
      height: 900,
      width: 1600,
    });
    expect(database.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      "room-id",
      filename,
    ]);
    expect(database.query).toHaveBeenNthCalledWith(3, expect.any(String), [
      expect.any(String),
      "actor-id",
      "ROOM_IMAGE_UPDATED",
      "room-id",
    ]);
  });

  it("clears the database image and records the removal audit event", async () => {
    const { database, service } = await createService();
    database.query.mockResolvedValueOnce({
      rows: [{ image_path: "missing-on-disk.webp" }],
      rowCount: 1,
    });

    await service.remove("actor-id", "room-id");

    expect(database.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      "room-id",
    ]);
    expect(database.query).toHaveBeenNthCalledWith(3, expect.any(String), [
      expect.any(String),
      "actor-id",
      "ROOM_IMAGE_REMOVED",
      "room-id",
    ]);
  });
});

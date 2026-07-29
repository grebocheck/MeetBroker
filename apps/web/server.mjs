import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const port = Number(process.env.PORT ?? 4173);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

createServer((request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url ?? "/", "http://localhost").pathname
  );
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, safePath);
  if (
    pathname === "/" ||
    !existsSync(filePath) ||
    !statSync(filePath).isFile()
  ) {
    filePath = join(root, "index.html");
  }

  const extension = extname(filePath);
  response.setHeader(
    "content-type",
    mimeTypes[extension] ?? "application/octet-stream"
  );
  if (filePath.includes(`${join(root, "assets")}`)) {
    response.setHeader("cache-control", "public, max-age=31536000, immutable");
  } else {
    response.setHeader("cache-control", "no-cache");
  }
  createReadStream(filePath)
    .on("error", () => {
      response.statusCode = 500;
      response.end("Unable to read asset");
    })
    .pipe(response);
}).listen(port, "0.0.0.0", () => {
  process.stdout.write(`MeetBroker web listening on ${port}\n`);
});

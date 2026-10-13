import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
export const dynamic = "force-dynamic";

// Serves files from public/ at request time (so clips analyzed after `next start` work too), with Range support for seeking.
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const root = path.join(process.cwd(), "public");
  const file = path.join(root, ...(await params).path);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response("not found", { status: 404 });
  const size = fs.statSync(file).size;
  const type = file.endsWith(".json") ? "application/json" : file.endsWith(".mp4") ? "video/mp4" : file.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream";
  const range = req.headers.get("range");
  const base = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-store" };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? +m[1] : 0;
    const end = m && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { ...base, "content-length": String(size) } });
}

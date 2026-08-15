// The deployed function, on a local port. One handler, same as production.
//
//   node dev.mjs            then open http://localhost:8787/scene
//
// Clicking through the whole cycle needs a public URL, because GitHub's image
// proxy has to reach it: put a tunnel in front and point a scratch repo at it.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8787);
const eyes = (await import("./api/eyes.mjs")).default;

createServer(async (req, res) => {
  const p = new URL(req.url, "http://localhost").pathname;
  console.log(`${new Date().toISOString().slice(11, 23)}  ${req.url}`);
  try {
    if (p === "/play" || p === "/scene") return await eyes(req, res);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    return res.end(String(err && err.message) + "\n");
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("try /play or /scene\n");
}).listen(PORT, () => console.log(`eyes on :${PORT}`));

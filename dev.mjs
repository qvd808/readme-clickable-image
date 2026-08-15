// The two Vercel functions, on a local port. Same handlers the deployment
// runs - there is deliberately no second implementation to drift out of sync.
//
//   node dev.mjs            then open http://localhost:8787/scene
//
// Clicking through the whole cycle needs a public URL, because GitHub's image
// proxy has to reach it: put a tunnel in front and point a scratch repo at it.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8787);
const play = (await import("./api/play.mjs")).default;
const scene = (await import("./api/scene.mjs")).default;

createServer(async (req, res) => {
  const p = new URL(req.url, "http://localhost").pathname;
  const ua = (req.headers["user-agent"] || "-").slice(0, 40);
  console.log(`${new Date().toISOString().slice(11, 23)}  ${p.padEnd(8)} ${ua}`);
  try {
    if (p === "/play") return await play(req, res);
    if (p === "/scene") return await scene(req, res);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    return res.end(String(err && err.message) + "\n");
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("try /play or /scene\n");
}).listen(PORT, () => console.log(`eyes on :${PORT}`));

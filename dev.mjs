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
    if (p === "/" || p === "/index.html") {
      const html = (await import("node:fs")).readFileSync("./index.html");
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(html);
    }
    if (p === "/play" || p === "/scene") {
      const fullUrl = `http://${req.headers.host || "localhost"}${req.url}`;
      const reqHeaders = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string" && !k.startsWith(":")) reqHeaders.set(k, v);
      }
      const webReq = new Request(fullUrl, { method: req.method, headers: reqHeaders });
      const response = await eyes(webReq);

      const headersObj = {};
      response.headers.forEach((v, k) => { headersObj[k] = v; });
      res.writeHead(response.status, headersObj);

      if (req.method !== "HEAD" && response.body) {
        const buf = Buffer.from(await response.arrayBuffer());
        res.end(buf);
      } else {
        res.end();
      }
      return;
    }
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    return res.end(String(err && err.stack || err) + "\n");
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("try /play or /scene\n");
}).listen(PORT, () => console.log(`eyes on :${PORT}`));

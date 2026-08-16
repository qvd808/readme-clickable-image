// Both routes in one function, on purpose.
//
// Vercel compiles each file in api/ into its own lambda with its own memory, so
// a flag written by a separate /play function is never visible to /scene. One
// file means one lambda means one module scope, which makes the flag work with
// no database behind it.
//
// The catch is honest: Vercel may still run more than one instance, and nothing
// guarantees the click and the reload land on the same one. For a personal
// profile - low traffic, one warm instance, two requests a second apart - that
// is almost always true. Attach Redis (see DEPLOY.md) and it becomes always.
import { BLACK_CANVAS, config, fetchRemoteAsset, isPlaying, markPlaying, uncached } from "./_shared.mjs";

export default async function handler(req, res) {
  const url = new URL(req.url || "/", "http://localhost");

  let cfg;
  try {
    cfg = config(url);
  } catch (err) {
    // a misconfigured template should fail loudly at setup, not quietly forever
    res.writeHead(400, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    return res.end(err.message + "\n");
  }

  if (url.pathname.endsWith("/play") || url.searchParams.get("do") === "play") {
    if (cfg.play) {
      await markPlaying(cfg.key);
    }
    uncached(res);
    res.writeHead(302, { Location: cfg.back });
    return res.end();
  }

  // Only play if 'play' URL is present and active
  const playing = Boolean(cfg.play) && (url.searchParams.get("play") === "1" || await isPlaying(cfg.key));
  const targetUrl = playing ? cfg.play : cfg.still;

  if (targetUrl) {
    try {
      const { data, contentType } = await fetchRemoteAsset(targetUrl);
      uncached(res, { "Content-Type": contentType });
      return res.end(req.method === "HEAD" ? undefined : data);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      return res.end(`Failed to fetch remote asset: ${err.message}\n`);
    }
  }

  // Fallback: missing static image -> serve black canvas
  uncached(res, { "Content-Type": "image/svg+xml" });
  res.end(req.method === "HEAD" ? undefined : BLACK_CANVAS);
}

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
import { bundled, config, fetchRemoteAsset, isPlaying, markPlaying, uncached } from "./_shared.mjs";

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
    await markPlaying(cfg.key);
    uncached(res);
    res.writeHead(302, { Location: cfg.back });
    return res.end();
  }

  // ?play=1 forces the animation, for checking an asset without the state.
  // The README's URL carries no query, so visitors cannot land on this.
  const playing = url.searchParams.get("play") === "1" || await isPlaying(cfg.key);

  // Direct Proxy Mode: if still & play remote URLs are provided, fetch the bytes
  // directly and return them with no-store headers. This saves an HTTP round-trip
  // for GitHub's Camo proxy compared to 302 redirecting.
  if (cfg.redirecting) {
    const targetUrl = playing ? cfg.play : cfg.still;
    try {
      const { data, contentType } = await fetchRemoteAsset(targetUrl);
      uncached(res, { "Content-Type": contentType });
      return res.end(req.method === "HEAD" ? undefined : data);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      return res.end(`Failed to fetch remote asset: ${err.message}\n`);
    }
  }

  const { poster, scene } = bundled();
  uncached(res, { "Content-Type": playing ? "image/svg+xml" : "image/jpeg" });
  res.end(req.method === "HEAD" ? undefined : (playing ? scene : poster));
}

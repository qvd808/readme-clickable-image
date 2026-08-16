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
export const config = { runtime: "edge" };

import { BLACK_CANVAS, config as getConfig, fetchRemoteAsset, isPlaying, markPlaying, uncached } from "./_shared.mjs";

export default async function handler(req) {
  const rawUrl = req.url || "/";
  const url = new URL(rawUrl, "http://localhost");

  let cfg;
  try {
    cfg = await getConfig(url);
  } catch (err) {
    const headers = new Headers();
    uncached(headers, { "Content-Type": "text/plain" });
    return new Response(err.message + "\n", { status: 400, headers });
  }

  if (url.pathname.endsWith("/play") || url.searchParams.get("do") === "play") {
    if (cfg.play) {
      await markPlaying(cfg.key);
    }
    const headers = new Headers();
    uncached(headers);
    headers.set("Location", cfg.back);
    return new Response(null, { status: 302, headers });
  }

  // Only play if 'play' URL is present and active
  const playing = Boolean(cfg.play) && (url.searchParams.get("play") === "1" || await isPlaying(cfg.key));
  const targetUrl = playing ? cfg.play : cfg.still;

  if (targetUrl) {
    try {
      const { data, contentType } = await fetchRemoteAsset(targetUrl);
      const headers = new Headers();
      uncached(headers, { "Content-Type": contentType });
      return new Response(req.method === "HEAD" ? null : data, { status: 200, headers });
    } catch (err) {
      const headers = new Headers();
      uncached(headers, { "Content-Type": "text/plain" });
      return new Response(`Failed to fetch remote asset: ${err.message}\n`, { status: 502, headers });
    }
  }

  // Fallback: missing static image -> serve black canvas
  const headers = new Headers();
  uncached(headers, { "Content-Type": "image/svg+xml" });
  return new Response(req.method === "HEAD" ? null : BLACK_CANVAS, { status: 200, headers });
}

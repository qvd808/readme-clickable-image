export const config = { runtime: "edge" };

import { BLACK_CANVAS, backFromReferer, config as getConfig, fetchRemoteAsset, isPlaying, markPlaying, uncached } from "./_shared.mjs";

/**
 * Handles incoming HTTP requests for /play and /scene endpoints in Vercel Edge Runtime.
 *
 * @param {Request} req - Web Standard Request object containing 'still', 'play', and 'back' query parameters.
 * @returns {Promise<Response>} Web Standard Response:
 *   - /play: 302 Found redirect to the 'back' URL after setting click state, or in
 *     auto mode to the referring page when the Referer carried a path.
 *   - /scene: 200 OK returning image bytes with no-store headers.
 */
export default async function handler(req) {
  const rawUrl = req.url || "/";
  const url = new URL(rawUrl, "http://localhost");

  let cfg;
  try {
    cfg = await getConfig(url);
  } catch (err) {
    const headers = new Headers();
    uncached(headers, { "Content-Type": "text/plain" });

    // Safely extract the message whether it's an Error object or something else
    const errorMessage = err instanceof Error ? err.message : String(err);

    return new Response(errorMessage + "\n", { status: 400, headers });
  }

  if (url.pathname.endsWith("/play") || url.searchParams.get("do") === "play") {
    if (cfg.play) {
      await markPlaying(cfg.key);
      // Pre-warm the animation asset into Edge memory during the redirect!
      fetchRemoteAsset(cfg.play).catch(() => {});
    }

    const fromReferer = cfg.isAutoMode ? backFromReferer(req.headers.get("referer") || "") : "";
    const headers = new Headers();
    uncached(headers, cfg.isAutoMode ? { "Vary": "Referer" } : {});

    headers.set("Location", fromReferer || cfg.back);
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
      const body = req.method === "HEAD" ? null : new Uint8Array(data);

      return new Response(body, { status: 200, headers });

    } catch (err) {

      const headers = new Headers();
      uncached(headers, { "Content-Type": "text/plain" });

      // Safely extract the message whether it's an Error object or something else
      const errorMessage = err instanceof Error ? err.message : String(err);

      return new Response(`Failed to fetch remote asset: ${errorMessage}\n`, { status: 502, headers });
    }
  }

  // Fallback: missing static image -> serve black canvas
  const headers = new Headers();
  uncached(headers, { "Content-Type": "image/svg+xml" });
  return new Response(req.method === "HEAD" ? null : BLACK_CANVAS, { status: 200, headers });
}

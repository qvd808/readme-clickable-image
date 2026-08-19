export const config = {runtime: "edge"};

import {
  uncached,
  readParams,
  backFromReferer,
  BACK_HOSTS,
  ASSET_HOSTS,
  assetKey,
  isPlaying,
  BLACK_CANVAS,
  fetchRemoteAsset,
  markPlaying,
} from "./_shared.mjs";

/**
 * Response template building for cache-invalidation headers.
 * 
 * @param {string} body - Response body
 * @param {number} status - HTTP status code
 * @returns {Response} Response object
 */
function buildResponse(body, status) {
  const headers = new Headers();
  uncached(headers);
  return new Response(body, { status, headers });
}
/**
 * Builds a 200 image response, omitting the body for HEAD requests.
 *
 * @param {Request} req - Incoming request, used to detect HEAD.
 * @param {Uint8Array} data - Raw image bytes.
 * @param {string} contentType - MIME type to advertise.
 * @returns {Response} Response object
 */
function buildImage(req, data, contentType) {
  const headers = new Headers();
  uncached(headers, { "Content-Type": contentType });
  return new Response(req.method === "HEAD" ? null : new Uint8Array(data), { status: 200, headers });
}

/**
 * Handles /play: records the click, pre-warms the animation and redirects.
 *
 * @param {Request} req - Incoming request.
 * @param {URL} url - Parsed request URL.
 * @returns {Promise<Response>} 302 to the resolved destination.
 */
async function handlePlay(req, url) {
  const params = readParams(url);

  if (!params.back) {
    return buildResponse("Params back is required", 400);
  }

  let back;
  try {
    back = new URL(params.back);
  } catch {
    return buildResponse("Params back is not a valid URL", 400);
  }

  if (back.protocol !== "https:" || !BACK_HOSTS.has(back.hostname)) {
    return buildResponse("Params back is not an allowed destination", 400);
  }

  let still = "";
  try {
    const u = new URL(params.still);
    if (u.protocol === "https:" && ASSET_HOSTS.has(u.hostname)) still = u.toString();
  } catch {}

  let play = "";
  try {
    const u = new URL(params.play);
    if (u.protocol === "https:" && ASSET_HOSTS.has(u.hostname)) play = u.toString();
  } catch {}


  if (play) {
    await markPlaying(await assetKey(still, play));
  }

  const fromReferer = params.isAutoMode ? backFromReferer(req.headers.get("referer") || "") : "";

  const headers = new Headers();
  uncached(headers, params.isAutoMode ? { "Vary": "Referer" } : {});
  headers.set("Location", fromReferer || back.toString());
  return new Response(null, { status: 302, headers });
}

/**
 * Handles /scene: show the still image and the animation scene, response when flag is flipped
 *
 * @param {Request} req - Incoming request.
 * @param {URL} url - Parsed request URL.
 * @returns {Promise<Response>} 200 with images bytes or 502 when magical things happesn
 */
async function handleScene(req, url) {
  const params = readParams(url);

  let still = "";
  try {
    const u = new URL(params.still);
    if (u.protocol === "https:" && ASSET_HOSTS.has(u.hostname)) still = u.toString();
  } catch {}

  let play = "";
  try {
    const u = new URL(params.play);
    if (u.protocol === "https:" && ASSET_HOSTS.has(u.hostname)) play = u.toString();
  } catch {}

  const key = await assetKey(still, play);
  const playing = Boolean(play) && await isPlaying(key);
  const assetUrl = playing ? play : still;

  if (!assetUrl) {
    return buildImage(req, BLACK_CANVAS, "image/svg+xml")
  }

  try {
    const asset = await fetchRemoteAsset(assetUrl);
    return buildImage(req, asset.data, asset.contentType);
  } catch (err) {
    return buildResponse(`Failed to fetch remote asset: ${err instanceof Error ? err.message : String(err)}`, 502);
  }

}

/**
 * Registered routes, mapping a path suffix to its handler function.
 * 
 * @type {Record<string, (req: Request, url: URL) => Promise<Response>>}
 */
const routes = {
  "/play": handlePlay,
  "/scene": handleScene,
}

/**
 * Dispatches a request to a registered route.
 *
 * @param {Request} req - Incoming request.
 * @param {URL} url - Parsed request URL.
 * @returns {Promise<Response|null>} Route response, or null when no route matches.
 */
async function route(req, url) {
  for (const [path, handle] of Object.entries(routes)) {
    if (url.pathname.endsWith(path)) return handle(req, url);
  }
  return null;
}

/**
 * Entry point for the Vercel Edge Runtime, guaranteeing a Response for every request.
 *
 * @param {Request} req - Web Standard Request object.
 * @returns {Promise<Response>} Route response, 404 when unregistered, 502 when a route throws.
 */
export default async function handler(req) {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const res = await route(req, url);
    return res ?? buildResponse("Not Found", 404);
  } catch (err) {
    return buildResponse(`Route failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
}
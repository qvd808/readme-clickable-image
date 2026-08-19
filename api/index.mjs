export const config = {runtime: "edge"};

import {
  uncached,
  readParams,
  assetKey,
  isPlaying,
  BLACK_CANVAS,
  fetchRemoteAsset,
  markPlaying,
} from "./_shared.mjs";

import {
  ASSET_HOSTS,
  BACK_HOSTS,
} from "./constants.mjs";

/**
 * Extracts and validates the path from a referer URL.
 * 
 * @param {string | null} [referer] - Incoming referer header string.
 * @returns {string}
 */
function backFromReferer(referer) {
  if (!referer) return "";
  let u;
  try { u = new URL(referer); } catch { return ""; }
  if (u.protocol !== "https:") return "";
  if (!BACK_HOSTS.has(u.hostname)) return "";
  if (u.pathname === "" || u.pathname === "/") return "";
  u.hash = "";
  return u.toString();
}

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
 * Builds a 200 image response
 *
 * @param {BodyInit | null} body - Image bytes or an upstream body stream.
 * @param {string} contentType - MIME type to advertise.
 * @returns {Response} Response object
 */
function buildImage(body, contentType) {
  const headers = new Headers();
  uncached(headers, { "Content-Type": contentType });

  return new Response(body, { status: 200, headers });
}

/**
 * Handles /play: records the click, redirect the URL
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

  if (back.protocol !== "https:") {
    return buildResponse("Not an HTTPS request - REJECT", 400);
  }

  if (!BACK_HOSTS.has(back.hostname)) {
    return buildResponse("back parameters contains URL not from ALLOWED_HOSTS", 400);
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
    try {
      await markPlaying(await assetKey(still, play));
    } catch (err) {
      console.error(`[redis] flag write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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
  let playing = false;
  if (play) {
    try {
      playing = await isPlaying(key);
    } catch (err) {
      console.error(`[redis] flag lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const assetUrl = playing ? play : still;

  if (!assetUrl) {
    return buildImage(BLACK_CANVAS, "image/svg+xml")
  }

  try {
    const asset = await fetchRemoteAsset(assetUrl);
    return buildImage(asset.body, asset.contentType);
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
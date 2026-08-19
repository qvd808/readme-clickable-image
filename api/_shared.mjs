import { WINDOW_MS } from "./constants.mjs";

const REDIS_TIMEOUT_MS = 1000;
const ASSETS_TIMEOUT_MS = 10000;
const MAX_ASSET_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Fetches remote image assets from allowed GitHub URLs and caches them in memory.
 *
 * @param {string} urlStr - The remote image URL to fetch.
 * @returns {Promise<{data: Buffer, contentType: string}>} Object with raw image Buffer and MIME Content-Type.
 */
/**
 * Opens a remote image asset for streaming, without buffering it.
 *
 * @param {string} urlStr - The remote image URL to fetch.
 * @returns {Promise<{body: ReadableStream<Uint8Array> | null, contentType: string}>} Body stream and MIME type.
 */
export async function fetchRemoteAsset(urlStr) {
  const res = await fetch(urlStr, {
    headers: { "User-Agent": "readme-onclick-animation/1.0" },
    signal: AbortSignal.timeout(ASSETS_TIMEOUT_MS)
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when fetching ${urlStr}`);
  }

  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_ASSET_BYTES) {
    await res.body?.cancel();
    throw new Error(`asset too large: ${declared} bytes`);
  }

  let contentType = res.headers.get("content-type") || "";
  if (!contentType || contentType.includes("text/plain") || contentType.includes("octet-stream")) {
    const uPath = new URL(urlStr).pathname.toLowerCase();
    if (uPath.endsWith(".svg")) contentType = "image/svg+xml";
    else if (uPath.endsWith(".jpg") || uPath.endsWith(".jpeg")) contentType = "image/jpeg";
    else if (uPath.endsWith(".png")) contentType = "image/png";
    else if (uPath.endsWith(".gif")) contentType = "image/gif";
    else if (uPath.endsWith(".webp")) contentType = "image/webp";
    else if (uPath.endsWith(".avif")) contentType = "image/avif";
    else contentType = "image/jpeg";
  }

  return { body: res.body, contentType };
}

/**
 * @typedef {Object} RawParams
 * @property {string} back
 * @property {string} still
 * @property {string} play
 * @property {boolean} isAutoMode
 */

/**
 * Reads query parameters without validating them.
 * @param {URL} url - Incoming Request URL object.
 * @returns {RawParams} Raw query parameters.
 */
export function readParams(url) {
  const q = url.searchParams;
  return {
    back: (q.get("back") || "").trim(),
    still: (q.get("still") || "").trim(),
    play: (q.get("play") || "").trim(),
    isAutoMode: q.get("mode") === "auto"
  };
}

/**
 * Generate the shared state key
 * 
 * @param {string} still - Still image URL
 * @param {string} play - Play image URL
 * @returns {Promise<string>} Redis key
 */
export async function assetKey(still, play) {
  const data = new TextEncoder().encode(`${still}|${play}`);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  return "eyes:" + hex.slice(0, 12);
}

export const BLACK_CANVAS = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="520" viewBox="0 0 1100 520"><rect width="100%" height="100%" fill="#000000"/></svg>'
);


const KV = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

/**
 * Stores click state in Redis
 *
 * @param {string} key - Hashed asset key.
 * @returns {Promise<void>}
 */
export async function markPlaying(key) {
  if (!KV) return;
  await fetch(`${KV}/set/${key}/1?EX=${Math.ceil(WINDOW_MS / 1000)}`,
    { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store", signal: AbortSignal.timeout(REDIS_TIMEOUT_MS) })
    .catch(() => {});
}

/**
 * Checks if the click state is active in Redis
 *
 * @param {string} key - Hashed asset key.
 * @returns {Promise<boolean>} True if active; false otherwise.
 */
export async function isPlaying(key) {
  if (!KV ) return false;
  try {
    const r = await fetch(`${KV}/getdel/${key}`,
      { 
        headers: { Authorization: `Bearer ${TOKEN}` }, 
        cache: "no-store", 
        signal: AbortSignal.timeout(REDIS_TIMEOUT_MS) 
      }
    );
    return (await r.json()).result === "1";
  } catch {
    return false;
  }
}

/**
 * Appends HTTP cache-invalidation headers to a Headers object.
 *
 * @param {Headers} headers - Web Headers instance.
 * @param {Record<string, string>} [extra] - Additional header key-value pairs.
 * @returns {void}
 */
export function uncached(headers, extra = {}) {
  const headersObj = {
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    ...extra
  };

  for (const [k, v] of Object.entries(headersObj)) headers.set(k, v);
}
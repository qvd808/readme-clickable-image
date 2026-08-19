export const WINDOW_MS = Number(process.env.WINDOW_MS || 12000);

export const ASSET_HOSTS = new Set([
  "raw.githubusercontent.com", "objects.githubusercontent.com",
  "gist.githubusercontent.com", "user-images.githubusercontent.com",
  "github.com",
]);
export const BACK_HOSTS = new Set(["github.com", "www.github.com"]);

/**
 * In-memory cache for fetched remote images.
 * @type {Map<string, {time: number, asset: {data: Buffer, contentType: string}}>}
 */
const remoteAssetCache = new Map();
const ASSET_CACHE_TTL = 60000;

/**
 * Fetches remote image assets from allowed GitHub URLs and caches them in memory.
 *
 * @param {string} urlStr - The remote image URL to fetch.
 * @returns {Promise<{data: Buffer, contentType: string}>} Object with raw image Buffer and MIME Content-Type.
 */
export async function fetchRemoteAsset(urlStr) {
  const cached = remoteAssetCache.get(urlStr);
  if (cached && (Date.now() - cached.time < ASSET_CACHE_TTL)) {
    return cached.asset;
  }

  const res = await fetch(urlStr, {
    headers: { "User-Agent": "readme-onclick-animation/1.0" }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when fetching ${urlStr}`);
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

  const buffer = Buffer.from(await res.arrayBuffer());
  const asset = { data: buffer, contentType };

  remoteAssetCache.set(urlStr, { time: Date.now(), asset });
  return asset;
}

/**
 * Extracts and validates the path from a referer URL.
 * 
 * @param {string | null} [referer] - Incoming referer header string.
 * @returns {string}
 */
export function backFromReferer(referer) {
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

export const BLACK_CANVAS = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="520" viewBox="0 0 1100 520"><rect width="100%" height="100%" fill="#000000"/></svg>'
);

const KV = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
/**
 * In-memory local cache tracking recently clicked asset keys.
 * @type {Map<string, number>}
 */
const warm = new Map();

/**
 * Stores active click state for 12 seconds in Upstash Redis and local memory.
 *
 * @param {string} key - Hashed asset key.
 * @returns {Promise<void>}
 */
export async function markPlaying(key) {
  warm.set(key, Date.now());
  if (warm.size > 500) {
    for (const [k, t] of warm) if (Date.now() - t > WINDOW_MS) warm.delete(k);
  }
  if (!KV) return;
  await fetch(`${KV}/set/${key}/1?EX=${Math.ceil(WINDOW_MS / 1000)}`,
    { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" })
    .catch(() => {});
}

/**
 * Checks if the click state is active in Redis or local memory.
 *
 * @param {string} key - Hashed asset key.
 * @returns {Promise<boolean>} True if active; false otherwise.
 */
export async function isPlaying(key) {
  const local = Date.now() - (warm.get(key) || 0) < WINDOW_MS;
  if (!KV || local) return local;
  try {
    const r = await fetch(`${KV}/getdel/${key}`,
      { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" });
    return (await r.json()).result === "1";
  } catch {
    return local;
  }
}

/**
 * @typedef {Object} ResponseWithHeaders
 * @property {(name: string, value: string) => void} [setHeader]
 * @property {(name: string, value: string) => void} [set]
 */

/**
 * Appends HTTP cache-invalidation headers (no-store, no-cache, max-age=0) to response headers.
 *
 * @param {Headers | ResponseWithHeaders} resOrHeaders - Web Headers instance or Node response object.
 * @param {Record<string, string>} [extra] - Additional header key-value pairs.
 * @returns {void}
 */
export function uncached(resOrHeaders, extra = {}) {
  const headersObj = {
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    ...extra
  };

  if (resOrHeaders && 'setHeader' in resOrHeaders && typeof resOrHeaders.setHeader === "function") {
    for (const [k, v] of Object.entries(headersObj)) resOrHeaders.setHeader(k, v);
  } else if (resOrHeaders && 'set' in resOrHeaders && typeof resOrHeaders.set === "function") {
    for (const [k, v] of Object.entries(headersObj)) resOrHeaders.set(k, v);
  }
}
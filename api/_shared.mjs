export const WINDOW_MS = Number(process.env.WINDOW_MS || 12000);

const DEFAULT_BACK = process.env.PROFILE_URL || "https://github.com/qvd808";
const DEFAULT_STILL = process.env.STILL_URL || "";
const DEFAULT_PLAY = process.env.PLAY_URL || "";

const ASSET_HOSTS = new Set([
  "raw.githubusercontent.com", "objects.githubusercontent.com",
  "gist.githubusercontent.com", "user-images.githubusercontent.com",
  "github.com",
]);
const BACK_HOSTS = new Set(["github.com", "www.github.com"]);

/**
 * Validates HTTPS URLs and normalizes GitHub blob URLs into raw asset URLs.
 *
 * @param {string} value - The input URL string to validate.
 * @param {Set<string>} hosts - Allowed domain hostnames.
 * @param {string} what - Parameter name for error reporting.
 * @returns {string} Normalized HTTPS URL string.
 */
const checked = (value, hosts, what) => {
  if (!value) return "";
  let u;
  try { u = new URL(value); } catch { throw new Error(`${what} is not a URL`); }
  if (u.protocol !== "https:") throw new Error(`${what} must be https`);
  if (!hosts.has(u.hostname)) {
    throw new Error(`${what} host not allowed: ${u.hostname}`);
  }
  if (u.hostname === "github.com" && u.pathname.includes("/blob/")) {
    u.hostname = "raw.githubusercontent.com";
    u.pathname = u.pathname.replace("/blob/", "/");
  }
  return u.toString();
};

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

const AUTO_BACK = new Set(["auto", "referer", "referrer", "history"]);

/**
 * Derives the page a /play click came from out of its Referer header.
 *
 * @param {string} referer - Raw Referer header value; may be empty or absent.
 * @returns {string} Absolute allowed-host URL, or "" if absent, disallowed, or
 *   stripped to a bare origin by the referrer policy of a GitHub profile page.
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
 * Parses query parameters and computes a unique SHA-1 hash key for the asset pair.
 *
 * @param {URL} url - Incoming Request URL object.
 * @returns {Promise<{back: string, still: string, play: string, key: string, redirecting: boolean, isAutoBack: boolean, backFallback: string}>} Config object.
 */
export async function config(url) {
  const q = url.searchParams;
  const rawBack = (q.get("back") || "").trim();
  const rawMode = (q.get("mode") || "").trim();

  const isAutoBack = AUTO_BACK.has(rawBack) || AUTO_BACK.has(rawMode);

  let back = "";
  let backFallback;

  if (isAutoBack) {
    const fallback = q.get("fallback") || (AUTO_BACK.has(rawBack) ? "" : rawBack);
    backFallback = checked(fallback || DEFAULT_BACK, BACK_HOSTS, "fallback");
  } else {
    back = checked(rawBack || DEFAULT_BACK, BACK_HOSTS, "back");
    backFallback = back;
  }

  const still = checked(q.get("still") || DEFAULT_STILL, ASSET_HOSTS, "still");
  const play = checked(q.get("play") || DEFAULT_PLAY, ASSET_HOSTS, "play");

  const data = new TextEncoder().encode(`${still}|${play}`);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  const key = "eyes:" + hex.slice(0, 12);
  return { back, still, play, key, redirecting: Boolean(still && play), isAutoBack, backFallback };
}

export const BLACK_CANVAS = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="520" viewBox="0 0 1100 520"><rect width="100%" height="100%" fill="#000000"/></svg>'
);

const KV = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
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
    const r = await fetch(`${KV}/get/${key}`,
      { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" });
    return (await r.json()).result === "1";
  } catch {
    return local;
  }
}

/**
 * Appends HTTP cache-invalidation headers (no-store, no-cache, max-age=0) to response headers.
 *
 * @param {Headers|object} resOrHeaders - Web Headers instance or Node response object.
 * @param {object} extra - Additional header key-value pairs.
 * @returns {void}
 */
export function uncached(resOrHeaders, extra = {}) {
  const headersObj = {
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    ...extra
  };

  if (resOrHeaders && typeof resOrHeaders.setHeader === "function") {
    for (const [k, v] of Object.entries(headersObj)) resOrHeaders.setHeader(k, v);
  } else if (resOrHeaders && typeof resOrHeaders.set === "function") {
    for (const [k, v] of Object.entries(headersObj)) resOrHeaders.set(k, v);
  }
}


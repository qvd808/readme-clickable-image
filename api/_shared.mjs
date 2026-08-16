// Shared bits for the function.
//
// Two ways to answer /scene:
//
//   bundled   the images ship with the deployment and are served as bytes
//   redirect  the images live in a GitHub repo and we 302 to them
//
// Redirect mode is the interesting one: the bytes come off GitHub's own CDN, so
// the origin serves a few hundred bytes per view instead of 142 KB, changing the
// animation is a push rather than a redeploy, and the service stops being about
// one person's scene - hand it two URLs and it works for anybody.
//
// What it does not change: /scene must still answer no-store, or the proxy stops
// asking and a click can never change anything. The open question is whether the
// proxy honours that on a redirect or adopts the headers of whatever it lands on
// (raw.githubusercontent sends max-age=300). If it adopts them, the README gets
// stuck on a spent animation for five minutes. Nothing local can answer that.
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
const ASSET_CACHE_TTL = 60000; // 60s memory cache for fast proxying

export async function fetchRemoteAsset(urlStr) {
  const cached = remoteAssetCache.get(urlStr);
  if (cached && (Date.now() - cached.time < ASSET_CACHE_TTL)) {
    return cached.asset;
  }

  const res = await fetch(urlStr, {
    headers: { "User-Agent": "readme-clickable-image/1.0" }
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

export async function config(url) {
  const q = url.searchParams;
  const back = checked(q.get("back") || DEFAULT_BACK, BACK_HOSTS, "back");
  const still = checked(q.get("still") || DEFAULT_STILL, ASSET_HOSTS, "still");
  const play = checked(q.get("play") || DEFAULT_PLAY, ASSET_HOSTS, "play");

  const data = new TextEncoder().encode(`${still}|${play}`);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  const key = "eyes:" + hex.slice(0, 12);
  return { back, still, play, key, redirecting: Boolean(still && play) };
}

export const BLACK_CANVAS = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="520" viewBox="0 0 1100 520"><rect width="100%" height="100%" fill="#000000"/></svg>'
);

const KV = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const warm = new Map();

export async function markPlaying(key) {
  warm.set(key, Date.now());
  if (warm.size > 500) {
    for (const [k, t] of warm) if (Date.now() - t > WINDOW_MS) warm.delete(k);
  }
  if (!KV) return;
  await fetch(`${KV}/set/${key}/1?EX=${Math.ceil(WINDOW_MS / 1000)}`,
    { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" })
    .catch(() => { /* a lost click beats a 500 on the hero image */ });
}

export async function isPlaying(key) {
  const local = Date.now() - (warm.get(key) || 0) < WINDOW_MS;
  if (!KV) return local;
  try {
    const r = await fetch(`${KV}/get/${key}`,
      { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" });
    return (await r.json()).result === "1";
  } catch {
    return local;
  }
}

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


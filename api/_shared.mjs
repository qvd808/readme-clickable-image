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
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export const WINDOW_MS = Number(process.env.WINDOW_MS || 12000);

// Where a click sends the visitor, and where the two images live. Query
// parameters beat the environment, which is what makes this a template.
const DEFAULT_BACK = process.env.PROFILE_URL || "https://github.com/qvd808";
const DEFAULT_STILL = process.env.STILL_URL || "";
const DEFAULT_PLAY = process.env.PLAY_URL || "";

// Without these the service is an open redirect and an open image proxy: anyone
// could hand out a link that looks like yours and lands wherever they like.
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
  return u.toString();
};

export function config(url) {
  const q = url.searchParams;
  const back = checked(q.get("back") || DEFAULT_BACK, BACK_HOSTS, "back");
  const still = checked(q.get("still") || DEFAULT_STILL, ASSET_HOSTS, "still");
  const play = checked(q.get("play") || DEFAULT_PLAY, ASSET_HOSTS, "play");
  // One flag per pair of images, so one person's click cannot fire another's.
  // Deliberately NOT keyed on `back`: /scene has no reason to carry it, and if
  // it contributed to the key then /play and /scene would disagree and no click
  // would ever register.
  const key = "eyes:" + createHash("sha1")
    .update(`${still}|${play}`).digest("hex").slice(0, 12);
  return { back, still, play, key, redirecting: Boolean(still && play) };
}

// Loaded on demand: a deployment in redirect mode need not carry them at all.
let cache = null;
export function bundled() {
  if (cache) return cache;
  const load = (name) => {
    const tries = [process.cwd(), path.join(process.cwd(), ".."), "/var/task"];
    for (const dir of tries) {
      try { return readFileSync(path.join(dir, name)); } catch { /* next */ }
    }
    throw new Error(`asset not found: ${name} (looked in ${tries.join(", ")})`);
  };
  cache = { poster: load("poster.jpg"), scene: load("eyes-once.svg") };
  return cache;
}

// ---- the flag ---------------------------------------------------------------
// Redis when configured. Otherwise memory, which works only because both routes
// live in one function and therefore one module scope - see DEPLOY.md.
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

export function uncached(res, extra = {}) {
  // the entire mechanism: the proxy only returns if told not to keep this
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
}

// Shared bits for the two Vercel functions.
//
// The whole design is one flag: /play sets it, /scene reads it. On a long-lived
// server that flag is a variable. On Vercel it cannot be, because /play and
// /scene are separate invocations that may land on different instances - so the
// flag lives in Redis when one is configured, and falls back to memory when it
// is not. The fallback is not a lie you can ship: it works only while a single
// instance stays warm, which for a quiet profile is most of the time and for a
// busy one is never.
import { readFileSync } from "node:fs";
import path from "node:path";

export const WINDOW_MS = Number(process.env.WINDOW_MS || 12000);
export const BACK_TO = process.env.PROFILE_URL || "https://github.com/qvd808";

// Vercel's working directory differs between local dev and deployment, so try
// the handful of places includeFiles could have put the assets.
const load = (name) => {
  const tries = [process.cwd(), path.join(process.cwd(), "eyes"),
                 path.join(process.cwd(), ".."), "/var/task", "/var/task/eyes"];
  for (const dir of tries) {
    try { return readFileSync(path.join(dir, name)); } catch { /* next */ }
  }
  throw new Error(`asset not found: ${name} (looked in ${tries.join(", ")})`);
};

export const POSTER = load("poster.jpg");
export const SCENE = load("eyes-once.svg");

const KV = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = "eyes:playing";

let warmMemory = 0;

export async function markPlaying() {
  warmMemory = Date.now();
  if (!KV) return;
  // the TTL is the window: no expiry logic, the key simply stops existing
  await fetch(`${KV}/set/${KEY}/1?EX=${Math.ceil(WINDOW_MS / 1000)}`,
    { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" })
    .catch(() => { /* a lost click is better than a 500 on the hero image */ });
}

export async function isPlaying() {
  if (!KV) return Date.now() - warmMemory < WINDOW_MS;
  try {
    const r = await fetch(`${KV}/get/${KEY}`,
      { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" });
    return (await r.json()).result === "1";
  } catch {
    return Date.now() - warmMemory < WINDOW_MS;
  }
}

export function uncached(res, type) {
  res.setHeader("Content-Type", type);
  // the entire mechanism: camo only comes back if it is told not to keep this
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

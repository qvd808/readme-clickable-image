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
import { POSTER, SCENE, BACK_TO, isPlaying, markPlaying, uncached } from "./_shared.mjs";

export default async function handler(req, res) {
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname.endsWith("/play") || url.searchParams.get("do") === "play") {
    await markPlaying();
    res.setHeader("Cache-Control", "no-store");
    res.writeHead(302, { Location: BACK_TO });
    return res.end();
  }

  // ?play=1 forces the animation, for checking the asset without the state.
  // The README's URL carries no query, so visitors cannot land on this.
  const playing = url.searchParams.get("play") === "1" || await isPlaying();
  uncached(res, playing ? "image/svg+xml" : "image/jpeg");
  res.end(req.method === "HEAD" ? undefined : (playing ? SCENE : POSTER));
}

// The image the README points at: the poster, or the animation if someone
// clicked in the last few seconds. Content-Length and compression are left to
// the platform, which negotiates both.
import { POSTER, SCENE, isPlaying, uncached } from "./_shared.mjs";

export default async function handler(req, res) {
  const playing = await isPlaying();
  uncached(res, playing ? "image/svg+xml" : "image/jpeg");
  res.end(req.method === "HEAD" ? undefined : (playing ? SCENE : POSTER));
}

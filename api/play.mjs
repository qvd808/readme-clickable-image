// The click. Marks the scene as playing, then hands the visitor back to GitHub;
// the reload is what makes the proxy refetch the image.
import { markPlaying, BACK_TO } from "./_shared.mjs";

export default async function handler(req, res) {
  await markPlaying();
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(302, { Location: BACK_TO });
  res.end();
}

# Eyes

Glowing eyes that follow the cursor, on a sketched canyon at night. Click the
figure and a piano finds it.

`index.html` is the real thing - one file, no dependencies. Everything else
exists to get a version of it into a GitHub profile README, where no code of
yours is ever allowed to run.

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

## In a README

GitHub strips `<script>` and `<iframe>` from rendered Markdown. Only `<img>`
survives, and an `<img>` gets no pointer events, so the page cannot be embedded
and nothing inside the image can hear a click. What GitHub does allow is a
link - and a link can reload the page.

So: the README shows `poster.jpg` wrapped in a link to `/play`. Clicking it
marks the scene as playing and redirects straight back; the page reloads,
GitHub's proxy refetches the image, and this time the server answers with
`eyes-once.svg`, which plays the whole sequence once and settles back to the
resting scene.

```html
<a href="https://YOUR-APP.vercel.app/play"><img src="https://YOUR-APP.vercel.app/scene" width="100%" alt="..."></a>
```

The animation is not a redrawing. `tools/capture.mjs` renders `index.html` in
headless Chromium and pulls out the layers - the idle plate, the wreck stamped
on impact, the piano and debris sprites, the face, and the geometry that places
them. `tools/build_svg.py` composites those into a single self-contained SVG
with CSS keyframes whose timings are copied from `startCalamity()`, so it plays
the same beats. Only the cursor is gone; the gaze wanders on a timer instead.

## What was measured, 2026-08-15

Four things that are easy to assume wrongly, all checked against a real repo:

- **README images load eagerly.** Everything is fetched at page load, including
  images inside a collapsed `<details>` and images five screens below the fold.
  A `<details>` can reveal an animation but cannot start one - open it and you
  land wherever the loop had got to.
- **`loading="lazy"` does not survive the sanitizer**, so deferral cannot be
  asked for either.
- **GitHub's proxy honours `no-store`.** It refetched URLs it had pulled minutes
  earlier, on every page load. That revalidation is the entire mechanism.
- **Click to animation is about 1.4s**, of which ~550ms is GitHub rebuilding its
  own page and ~640ms was the image. The image half is worth optimising; the
  rest is not yours.

## Building

```bash
node tools/capture.mjs [width] [height]        # -> tools/layers/ (needs chromium)
python3 tools/build_svg.py tools/layers eyes-once.svg --once --light
python3 tools/build_poster.py tools/layers
node dev.mjs                                   # the functions, on :8787
```

Deploying, and why GitHub Pages cannot host this: [DEPLOY.md](DEPLOY.md).

## Credit

The character revealed at the end is **Wonder of U**, from *JoJo's Bizarre
Adventure* (Part 8: JoJolion), copyright (c) Hirohiko Araki / Shueisha. Used as
a non-commercial personal easter egg; all rights remain with the creator and
rights holders, and no affiliation or endorsement is implied. Full credit to
Hirohiko Araki. The same notice is in the header of `index.html` and in the
generated SVG.

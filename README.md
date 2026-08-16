# ⚡ readme-onclick-animation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Deployment Status](https://img.shields.io/badge/Vercel-Active-brightgreen?logo=vercel)](https://readme-clickable-image.vercel.app/scene)
[![Runtime](https://img.shields.io/badge/Runtime-Vercel%20Edge-blue?logo=v8)](https://vercel.com)
[![Storage](https://img.shields.io/badge/Storage-Upstash%20Redis-red?logo=redis)](https://upstash.com)
[![Health](https://img.shields.io/badge/Health-100%25%20Passing-success)](#-performance--architecture)

> **Create interactive animations from clicks through Markdown files on GitHub.**

---

## 💡 The Problem & The Solution

### ❌ The Problem
GitHub strictly strips all `<script>`, `<iframe>`, and inline event attributes from Markdown files for security. As a result, standard READMEs remain completely static—it is impossible to run JavaScript to trigger animations or change media when a visitor clicks an image.

### ✅ The Solution
`readme-onclick-animation` **bypasses GitHub's script restriction** without needing any client-side JavaScript! 

It uses a stateful Edge Proxy that intercepts link clicks (`/play`), updates a temporary state flag in Redis, and dynamically streams the requested animation asset (`/scene`) straight to GitHub's Camo proxy with `no-store` headers.

```
[ Visitor Clicks Image in README ]
              │
              ├──> 1. Hits /play (Sets Redis state flag = true & pre-warms SVG into Edge RAM)
              │
              └──> 2. Redirects back to GitHub -> Camo requests /scene
                   └── /scene streams SVG animation from Edge RAM (no origin round-trip)
```

---

## 🎬 Interactive Live Demo

**Click the image below to test the click-triggered animation in real-time:**

<p align="center">
  <a href="https://readme-clickable-image.vercel.app/play?back=https://github.com/qvd808/readme-onclick-animation&still=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/poster.webp&play=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/eyes-once.svg">
    <img src="https://readme-clickable-image.vercel.app/scene?still=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/poster.webp&play=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/eyes-once.svg" width="100%" alt="Clickable README Animation Demo">
  </a>
</p>

* **What happens:** Clicking the image above triggers the action animation (`eyes-once.svg`) for 12 seconds, then automatically resets back to `poster.webp` when idle.

---

## 🚀 Quick Start Guide

You can use the shared server at `https://readme-clickable-image.vercel.app` out of the box for your own GitHub README!

### Step 1: Upload Your Assets
Upload your image files directly to your GitHub repository:
* **Idle Asset (`still`):** Static `.webp`, `.png`, `.jpg`, or looping animated `.webp` / `.gif`.
* **Triggered Asset (`play`):** Animated `.svg`, `.webp`, or `.gif`.

### Step 2: Add HTML to Your README.md

Copy and paste this HTML snippet into your `README.md`:

```html
<a href="https://readme-clickable-image.vercel.app/play?back=https://github.com/YOUR_USER/YOUR_REPO&still=https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/still.webp&play=https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/animation.svg">
  <img src="https://readme-clickable-image.vercel.app/scene?still=https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/still.webp&play=https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/animation.svg" width="100%" alt="Clickable README Image">
</a>
```

> **Tip:** Standard GitHub web URLs (containing `/blob/`) are automatically normalized to raw GitHub asset URLs by the server!

---

## ⚙️ URL Parameter Reference

| Parameter | Required? | Description |
| --- | --- | --- |
| `still` | Optional | URL of the idle image (static image or looping animated WebP/GIF). **If missing:** Displays a black canvas (`#000000`). |
| `play` | Optional | URL of the triggered animation image (`.svg`, `.gif`, `.webp`). **If missing:** Clicks remain static without playing an animation. |
| `back` | Recommended | Destination GitHub repository or profile URL to redirect the visitor after clicking. |
| `mode` | Optional | Set to `auto` to return the visitor to the page they clicked from instead of a fixed URL. `back` then acts as the fallback. |
| `fallback` | Optional | Explicit fallback destination for `mode=auto`. Defaults to `back`. |

---

## 🔁 Returning to the Right Page (`mode=auto`)

For a normal project README there is only one place to go back to, so a plain `back` URL is correct and nothing here is needed.

The exception is a **profile README**, which GitHub renders in **two** places from one file:

* `github.com/YOUR_USER` — your profile page
* `github.com/YOUR_USER/YOUR_USER` — the repo that holds it

A fixed `back` sends everyone to the same one, so clicking from inside the repo kicks the visitor out to your profile. Add `mode=auto`:

```html
<a href="https://readme-clickable-image.vercel.app/play?mode=auto&back=https://github.com/YOUR_USER&still=...&play=...">
```

**`Referer` carries a path** → redirect straight there. GitHub serves repo pages with `Referrer-Policy: no-referrer-when-downgrade`, so a hard-loaded repo page (refresh, address bar, new tab, external link, search result) hands over its full URL and the visitor returns to that exact page.

**`Referer` is stripped to a bare `https://github.com/`** → redirect to `back`.

Every destination is validated against the same `github.com` allowlist as `back`, so a missing, foreign, or downgraded `Referer` falls back instead of redirecting off-site. Links without `mode=auto` behave exactly as before.

### Browser support

`mode=auto` depends on the browser passing the `Referer` along. Measured by clicking the real link on a real GitHub repo page:

| Browser | `Referer` received | Result |
| --- | --- | --- |
| Chrome / Edge | `https://github.com/USER/REPO` | returns to the repo |
| Firefox | `https://github.com/USER/REPO` | returns to the repo |
| Brave | `https://github.com/` (origin only) | falls back to `back` |

Brave caps every cross-site `Referer` at the origin and never sends the path ([brave-browser#13464](https://github.com/brave/brave-browser/issues/13464), shipped in 1.19). That is identical to what GitHub sends from a profile page, so the server cannot tell the two apart and takes the fallback. The cap applies universally and a site cannot opt out of it, so this is not workaroundable.

Those visitors land on your `back` URL and **the animation still plays** — only the destination is less precise, which is why this degrades quietly rather than breaking.

### Why not use browser history instead

`history.back()` would return the visitor to the exact page regardless of referrer policy, and would work in Brave. It is not used because a history navigation reuses the cached page **and its subresources**, so the image is never re-requested and the animation never replays. Measured in Chrome: a 302 refetches the image, `history.back()` refetches nothing — even when the image is served `no-store`. Since the animation is the point of this project, `mode=auto` always redirects and never steps back through history.

---

## 🛠️ Template Rules & Fallback Handling

1. **Both `still` & `play` provided:** Displays `still` when idle; switches to `play` for 12 seconds upon click.
2. **Missing `play`:** Renders `still` continuously. Clicks do not trigger an animation.
3. **Missing `still`:** Displays a black canvas fallback.
4. **Missing both `still` & `play`:** Displays a black canvas fallback.

---

## ⚡ Performance & Architecture

* **Vercel Edge Runtime:** Executes in V8 isolates at 300+ Edge locations globally (sub-30ms TTFB).
* **Asynchronous Asset Pre-Warming:** During the 302 redirect phase, `/play` pre-fetches the animation asset into Edge memory asynchronously, so `/scene` serves it from RAM instead of re-fetching from `raw.githubusercontent.com`. That removes the origin round-trip; end-to-end `/scene` latency measured from a home connection is **~130–400 ms**, dominated by network, not by the handler.
* **Upstash Redis State Sync:** Distributed state tracking registers a click on one edge isolate and reads it from another, with zero database growth (bounded key space, 12s automatic TTL expiration).
* **Camo passes `no-store` through:** measured against the live deployment, GitHub's image proxy returns `age=0` and `x-cache: MISS` on every request and re-fetches `/scene` each time. No cache-busting query parameter is needed, and the click→animation→reset cycle measured 6/6 through the real Camo URL. (Camo *does* cache when allowed — a `shields.io` badge on the same page returns `x-cache: HIT` on the second request — it simply honours `no-store`.)

> **Do not add a cache TTL to `/scene`.** The `no-store` headers are load-bearing. Measured in Chrome: with `max-age=5` or `max-age=30`, the click's 302 reload serves the image from browser cache and the animation never plays; only `no-store` refetches. A TTL also cannot *trigger* a refresh — a browser never re-requests an already-painted `<img>` when its TTL expires (verified: 2s TTL, page open 9s, still one request). Without JavaScript, a navigation is the only thing that can change the image, which is exactly why `/play` redirects.

> **Shared state, by design:** the Redis key is derived from the `still|play` pair only, so a click activates the animation for *everyone* viewing that image during the 12-second window. Per-visitor state is not possible here: `/scene` is requested by GitHub's Camo servers, not by the visitor's browser, so the visitor is never visible to this server — and the `<img src>` in an already-rendered README cannot be given a per-click token.

---

## 💻 Local Development

To test the template server locally on port 8787:

```bash
npm run dev     # starts local server on http://localhost:8787
```

* Test `/scene`: `http://localhost:8787/scene?still=STILL_URL&play=PLAY_URL`
* Test `/play`: `http://localhost:8787/play?back=BACK_URL&still=STILL_URL&play=PLAY_URL`

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

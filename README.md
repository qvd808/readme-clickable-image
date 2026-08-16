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
                   └── /scene streams SVG animation from Edge RAM (< 2ms)!
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

A profile README is rendered in **two** places — `github.com/YOUR_USER` and the repo `github.com/YOUR_USER/YOUR_USER`. A fixed `back` URL sends everyone to the same one, so clicking from inside the repo kicks the visitor out to the profile page.

Add `mode=auto` to send them back to wherever they actually were:

```html
<a href="https://readme-clickable-image.vercel.app/play?mode=auto&back=https://github.com/YOUR_USER&still=...&play=...">
```

**How it works:** GitHub serves repo pages with `Referrer-Policy: no-referrer-when-downgrade`, so the full URL reaches `/play` in the `Referer` header and the visitor is returned to that exact page. Profile pages use `strict-origin-when-cross-origin`, which strips the path to a bare `https://github.com/` — that's the signal to use `back` (your profile) instead.

The redirect target is always validated against the same `github.com` allowlist as `back`, so a missing, foreign, or downgraded `Referer` falls back rather than redirecting off-site. Links without `mode=auto` behave exactly as before.

---

## 🛠️ Template Rules & Fallback Handling

1. **Both `still` & `play` provided:** Displays `still` when idle; switches to `play` for 12 seconds upon click.
2. **Missing `play`:** Renders `still` continuously. Clicks do not trigger an animation.
3. **Missing `still`:** Displays a black canvas fallback.
4. **Missing both `still` & `play`:** Displays a black canvas fallback.

---

## ⚡ Performance & Architecture

* **Vercel Edge Runtime:** Executes in V8 isolates at 300+ Edge locations globally (sub-30ms TTFB).
* **Asynchronous Asset Pre-Warming:** During the 302 redirect phase, `/play` pre-fetches the animation asset into Edge memory asynchronously, allowing `/scene` to stream from RAM in **< 2ms**.
* **Upstash Redis State Sync:** Distributed state tracking ensures 100% reliable click registration across multi-region edge instances with zero database growth (O(1) memory with 12s automatic TTL expiration).

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

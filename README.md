# ⚡ readme-onclick-animation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Deployment Status](https://img.shields.io/badge/Vercel-Active-brightgreen?logo=vercel)](https://readme-clickable-image.vercel.app/scene)
[![Runtime](https://img.shields.io/badge/Runtime-Vercel%20Edge-blue?logo=v8)](https://vercel.com)
[![Storage](https://img.shields.io/badge/Storage-Upstash%20Redis-red?logo=redis)](https://upstash.com)

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
              ├──> 1. Hits /play (Sets Redis state flag = true)
              │
              └──> 2. Redirects back to GitHub -> Camo requests /scene
                   └── /scene streams SVG animation
```

---

## 🎬 Interactive Live Demo

**Click the image below to test the click-triggered animation in real-time:**

<p align="center">
  <a href="https://readme-clickable-image.vercel.app/play?back=https://github.com/qvd808/readme-onclick-animation&still=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/poster.webp&play=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/eyes-once.svg">
    <img src="https://readme-clickable-image.vercel.app/scene?back=https://github.com/qvd808/readme-onclick-animation&still=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/poster.webp&play=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/eyes-once.svg" width="100%" alt="Clickable README Animation Demo">
  </a>
</p>

* **What happens:** Clicking the image above triggers the action animation (`eyes-once.svg`) for 12 seconds, then automatically resets back to `poster.webp` when idle.

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
## ⚙️ URL Parameter Reference

The two endpoints read different parameters. Keep `still` and `play` **identical in both URLs** — the play state is keyed on that pair, so any difference means the click flips a flag `/scene` never reads.

### `/play` — the `<a href>`

| Parameter | Required? | Description |
| --- | --- | --- |
| `back` | **Required** | Where to send the visitor after the click. Must be HTTPS on `github.com` or `www.github.com`; anything else returns 400. |
| `play` | Optional | Animation asset.If not present, well some other assets going to be change not your assets
| `still` | Optional | Idle asset. Never served by this endpoint — it only contributes to the state key. |
| `mode` | Optional | Set to `auto` to return the visitor to the page they clicked from, read from the `Referer`. Falls back to `back`. |

### `/scene` — the `<img src>`

| Parameter | Required? | Description |
| --- | --- | --- |
| `still` | Optional | Idle image. **If missing, malformed, or on a disallowed host:** displays a black canvas (`#000000`). |
| `play` | Optional | Animation, served while the play flag is set. **If missing:** always serves `still`. |
| `back` | Ignored | Not read by this endpoint. |
| `mode` | Ignored | Not read by this endpoint. |

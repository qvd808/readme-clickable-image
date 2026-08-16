# 🖱️ Readme Clickable Image

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Deployment Status](https://img.shields.io/badge/Vercel-Deployed%20%26%20Active-brightgreen?logo=vercel)](https://readme-clickable-image.vercel.app/scene)
[![Runtime](https://img.shields.io/badge/Runtime-Vercel%20Edge-blue?logo=v8)](https://vercel.com)
[![Storage](https://img.shields.io/badge/Storage-Upstash%20Redis-red?logo=redis)](https://upstash.com)
[![Build Health](https://img.shields.io/badge/Health-100%25%20Passing-success)](#-performance--architecture)

> A high-performance, generic template engine that enables **interactive, click-triggered animations** inside GitHub READMEs without needing custom server code.

---

## 🎬 Interactive Live Demo

**Click on the image below to test the animation workflow in real-time:**

<p align="center">
  <a href="https://readme-clickable-image.vercel.app/play?back=https://github.com/qvd808/readme-clickable-image&still=https://raw.githubusercontent.com/qvd808/readme-clickable-image/main/poster.webp&play=https://raw.githubusercontent.com/qvd808/readme-clickable-image/main/eyes-once.svg">
    <img src="https://readme-clickable-image.vercel.app/scene?still=https://raw.githubusercontent.com/qvd808/readme-clickable-image/main/poster.webp&play=https://raw.githubusercontent.com/qvd808/readme-clickable-image/main/eyes-once.svg" width="100%" alt="Clickable README Animation Demo">
  </a>
</p>

* **How it works:** Clicking the image above redirects to `/play`, triggers the calamity animation (`eyes-once.svg`) for 12 seconds, and automatically resets back to `poster.webp` when idle.

---

## 🚀 Quick Start Guide

You can use the shared server hosted at `https://readme-clickable-image.vercel.app` out of the box for your own GitHub README!

### Step 1: Upload Your Assets
Upload your image files directly to your GitHub repository:
* **Still / Idle Asset (`still`):** Static `.webp`, `.png`, `.jpg`, or looping animated `.webp` / `.gif`.
* **Play / Triggered Asset (`play`):** Animated `.svg`, `.webp`, or `.gif`.

### Step 2: Add HTML to Your README.md

Copy and paste this HTML snippet into your `README.md`:

```html
<a href="https://readme-clickable-image.vercel.app/play?back=https://github.com/YOUR_USER/YOUR_REPO&still=https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/still.webp&play=https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/animation.svg">
  <img src="https://readme-clickable-image.vercel.app/scene?still=https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/still.webp&play=https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/animation.svg" width="100%" alt="Clickable README Image">
</a>
```

> **Note:** Standard GitHub web URLs (containing `/blob/`) are automatically converted to raw GitHub asset URLs by the server!

---

## ⚙️ URL Parameter Reference

| Parameter | Required? | Description |
| --- | --- | --- |
| `still` | Optional | URL of the idle image (static image or looping animated WebP/GIF). **If missing:** Displays a black canvas (`#000000`). |
| `play` | Optional | URL of the triggered animation image (`.svg`, `.gif`, `.webp`). **If missing:** Clicks will remain static without playing any animation. |
| `back` | Recommended | Destination GitHub repository or profile URL to redirect the visitor after clicking. |

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
* **Upstash Redis Sync:** Distributed state tracking ensures 100% reliable click registration across multi-region edge instances with zero database growth (O(1) memory with 12s automatic TTL expiration).

---

## 💻 Local Development

To test the template server locally on port 8787:

```bash
node dev.mjs     # starts local server on http://localhost:8787
```

* Test `/scene`: `http://localhost:8787/scene?still=STILL_URL&play=PLAY_URL`
* Test `/play`: `http://localhost:8787/play?back=BACK_URL&still=STILL_URL&play=PLAY_URL`

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

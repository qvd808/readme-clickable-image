# readme-onclick-animation

**Make an image in your GitHub README swap to an animation when someone clicks it** — no JavaScript, no iframes (GitHub strips both). Just an `<a>` wrapping an `<img>`.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Runtime: Vercel Edge](https://img.shields.io/badge/Runtime-Vercel%20Edge-blue?logo=v8)
![Storage: Upstash Redis](https://img.shields.io/badge/Storage-Upstash%20Redis-red?logo=redis)

<p align="center">
  <a href="https://readme-clickable-image.vercel.app/play?back=https://github.com/qvd808/readme-onclick-animation&still=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/poster.webp&play=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/eyes-once.svg">
    <img src="https://readme-clickable-image.vercel.app/scene?still=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/poster.webp&play=https://raw.githubusercontent.com/qvd808/readme-onclick-animation/main/eyes-once.svg" width="100%" alt="Click me">
  </a>
</p>

<p align="center"><em>↑ Click it. (Then read <a href="#limitations">Limitations</a> — the trigger is best-effort by design.)</em></p>

Paste this into your own README, swapping in your repo and asset URLs:

```html
<a href="https://readme-clickable-image.vercel.app/play?back=https://github.com/USER/REPO&still=STILL_URL&play=PLAY_URL">
  <img src="https://readme-clickable-image.vercel.app/scene?still=STILL_URL&play=PLAY_URL" alt="Click me">
</a>
```

- `STILL_URL` and `PLAY_URL` must be **byte-identical in both the `<a href>` and the `<img src>`** — the state key is `sha1(still|play)`, so any difference means your click flips a flag `/scene` never reads.
- Both must be hosted on GitHub (see [Allowed asset hosts](#allowed-asset-hosts)). Other domains are silently ignored.

---

## How it works

An `<a href>` in a README is a real navigation; an `<img src>` is a real HTTP request. That's the whole budget GitHub gives you — and it's exactly enough for one bit of state.

```
1. Visitor clicks the image
        │
        ▼
2. GET /play  ──►  SET key = 1   (Redis, 12s TTL)      key = sha1(still|play)
        │
        ▼
3. 302 back to the GitHub page
        │
        ▼
4. GitHub's Camo proxy re-requests the <img>
        │
        ▼
5. GET /scene ──►  GETDEL key
        │            set?   → stream PLAY_URL (the animation)
        │            unset  → stream STILL_URL (the idle image)
        ▼
6. Visitor sees the animation
```

## Parameters

### `GET /play` — the `<a href>`

| Parameter | Required | Behavior |
| --- | --- | --- |
| `back` | **Yes** | Redirect target after the click. Must be HTTPS on `github.com` / `www.github.com`; anything else → `400`. |
| `play` | **In practice, yes** | Animation asset URL. **If omitted, no flag is written and the click does nothing.** |
| `still` | **In practice, yes** | Idle asset URL. Marked optional in code, but it's half the state key — omit it and the key won't match your `/scene`. |
| `mode` | No | `auto` returns the visitor to the exact page they clicked from, via the `Referer` header, falling back to `back`. See [browser support](#modeauto-browser-support). |

Sets `sha1(still\|play)` in Redis for **12 seconds**, then issues a `302`.

### `GET /scene` — the `<img src>`

| Parameter | Required | Behavior |
| --- | --- | --- |
| `still` | No | Idle image. Missing, malformed, or on a disallowed host → a solid black `1100×520` SVG. |
| `play` | No | Animation, served **once** while the flag is set. Missing → always serves `still`. |

Reads the flag with `GETDEL` — it's consumed by the first request that sees it. Returns `502` if the upstream asset can't be fetched. Assets are capped at **10 MB** and a **10 s** fetch timeout. Responses are `no-store` so Camo re-fetches on each render.

### Allowed asset hosts

`still` and `play` must be on one of:

`raw.githubusercontent.com` · `user-images.githubusercontent.com` · `objects.githubusercontent.com` · `gist.githubusercontent.com` · `github.com`

Any other domain (your own CDN, jsDelivr, etc.) is silently dropped: `still` falls back to the black canvas, `play` never fires. Supported formats: `.svg` `.webp` `.gif` `.png` `.jpg` `.avif`.

---

## Limitations

Read these before filing a bug — each is a property of the medium, not a missing feature.

- **State is global, not per-visitor.** There is no visitor to key on (Camo fetches `/scene`, not the browser). For 12s after any click, whichever Camo request arrives first gets the animation — often not the person who clicked. On a busy README the clicker will sometimes miss their own animation. This is inherent, not fixable.
- **Anyone can trigger it.** Both asset URLs are public in your README, so anyone can build your `/play` URL and fire the animation. There's no ownership check.
- **The click may not reach `/scene` at all.** The browser image cache, Camo's cache, and GitHub's Turbo page cache can each serve the old image without hitting the server. `no-store` reduces this; it doesn't eliminate it. If nothing happens, try a hard reload.
- **The public server has no rate limit or uptime promise.** `readme-clickable-image.vercel.app` is offered as-is. If you depend on it, self-host.

### `mode=auto` browser support

Requires the browser to send a full `Referer` path.

| Browser | `Referer` sent | Result |
| --- | --- | --- |
| Chrome / Edge / Firefox | `https://github.com/USER/REPO` | returns to the repo |
| Brave | `https://github.com/` (origin only) | falls back to `back` |

Brave caps every cross-site `Referer` at the origin ([brave-browser#13464](https://github.com/brave/brave-browser/issues/13464), 1.19+) — byte-identical to what GitHub sends from a profile page, so the server can't tell them apart. Not workaroundable; always set `back`.

---

## Self-host

Runs on Vercel Edge + Upstash Redis.

1. Fork this repo and import it into [Vercel](https://vercel.com/new).
2. Create a free [Upstash Redis](https://upstash.com) database.
3. Add its REST URL and token as env vars: `UPSTASH_REDIS_REST_URL` / `KV_REST_API_URL` and `UPSTASH_REDIS_REST_TOKEN` / `KV_REST_API_TOKEN`.
4. Deploy. Your endpoints are `https://YOUR-APP.vercel.app/play` and `/scene`.

> **Without Redis configured, the server still starts and still serves images — clicks just silently do nothing.** If the animation never fires on your own deploy, check those two env vars first.

Tests: `npm test`

---

## Disclaimers

Not affiliated with, endorsed by, or sponsored by GitHub.

The `/play` endpoint sees a visitor's IP address and referring URL, as any web request does. Nothing is stored beyond an ephemeral 12-second flag.

AI was involved throughout the making of this project — including research, writing code, editing, and testing.

---

## License

MIT — see [LICENSE](LICENSE).

The demo assets (`eyes-once.svg`, `index.html`) depict **Wonder of U** from *JoJo's Bizarre Adventure*, © Hirohiko Araki / Shueisha. **That artwork is not covered by the MIT license** — it's a non-commercial personal easter egg. Replace it with your own assets before reusing.
// Render index.html headlessly and dump the layers eyes.svg is built from:
// the idle scene, the post-impact scene, the piano and debris sprites, the
// face art, and the geometry that positions all of it.
//
//   node tools/capture.mjs [width] [height]        -> tools/layers/
//
// Needs a Chromium; it looks for the one Playwright caches, or $CHROME.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const EYES = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(EYES, "tools", "layers");
const W = Number(process.argv[2] || 1100);
const H = Number(process.argv[3] || 520);
const DSF = 2;
const PORT = 9333;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const roots = [path.join(process.env.HOME || "", ".cache/ms-playwright")];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root)) {
      for (const bin of ["chrome-headless-shell-linux64/chrome-headless-shell",
                         "chrome-linux/chrome", "chrome-linux64/chrome"]) {
        const p = path.join(root, d, bin);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  for (const p of ["/usr/bin/chromium", "/usr/bin/chromium-browser",
                   "/usr/bin/google-chrome"]) if (fs.existsSync(p)) return p;
  throw new Error("no chromium found - set $CHROME");
}

// --- the page, with the scene instance hoisted so we can drive it ---
fs.mkdirSync(OUT, { recursive: true });
const page = path.join(OUT, "capture.html");
const src = fs.readFileSync(path.join(EYES, "index.html"), "utf8");
if (!src.includes("new Scene().mount();")) throw new Error("index.html: bootstrap moved");
fs.writeFileSync(page, src.replace("new Scene().mount();",
  "window.scene = new Scene(); window.scene.mount();"));

// --- minimal CDP client ---
const proc = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, "--no-sandbox", "--disable-dev-shm-usage",
  "--hide-scrollbars", `--force-device-scale-factor=${DSF}`,
  `--window-size=${W},${H}`, "about:blank",
], { stdio: "ignore" });

let list = null;
for (let i = 0; i < 100 && !list; i++) {
  try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
  catch { await sleep(100); }
}
if (!list) { proc.kill(); throw new Error("chromium did not start"); }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const run = async (expr) => {
  const r = await send("Runtime.evaluate",
    { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, "base64"));
};
const write = (url, name) =>
  fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(",")[1], "base64"));

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
await send("Page.navigate", { url: "file://" + page });

// paint() is sliced across frames; the eye sockets land on the last slice
await run(`
  await new Promise((res, rej) => {
    const t0 = Date.now();
    const t = setInterval(() => {
      const s = window.scene;
      if (s && s.sockets.length && s.figMark) { clearInterval(t); res(); }
      else if (Date.now() - t0 > 60000) { clearInterval(t); rej(new Error("paint timeout")); }
    }, 50);
  });
  await new Promise((r) => setTimeout(r, 500));
`);

const geo = await run(`
  const s = window.scene, m = s.figMark;
  s.buildFace();
  return {
    W: s.W, H: s.H, inkRGB: s.inkRGB,
    eyes: s.eyeSpots.map((e) => ({ x: e.x, y: e.y, r: e.r })),
    fig: { fx: m.fx, fy: m.fy, hf: m.hf },
    // the click target on the live page, verbatim from paint()
    figBox: { x: m.fx - m.hf * 0.22, y: m.fy - m.hf * 1.04,
              w: m.hf * 0.52, h: m.hf * 1.1 },
    impact: { x: m.fx + m.hf * 0.12, y: m.fy - m.hf * 0.92 },
    pw: Math.max(s.W * 0.15, m.hf * 1.3),
    faceBox: s._faceBox
  };
`);

// the poster the README rests on: the idle scene exactly as the page shows it
await shot("poster.png");

// the plate the animation is built from must not contain the glows - those are
// rebuilt as SVG gradients so they can drift and fade
await run(`window.scene.fadeEyes(0);`);
await shot("base.png");

const assets = await run(`
  const s = window.scene, m = s.figMark;
  const pw = Math.max(s.W * 0.15, m.hf * 1.3);
  const impact = { x: m.fx + m.hf * 0.12, y: m.fy - m.hf * 0.92 };
  const sp = s.bakePiano(pw);
  s.bakeDebris(impact, pw);
  const D = s._debris;
  const f = s._faceImg, fc = document.createElement("canvas");
  fc.width = f.naturalWidth; fc.height = f.naturalHeight;
  fc.getContext("2d").drawImage(f, 0, 0);
  return {
    piano: { url: sp.c.toDataURL(), w: sp.w, h: sp.h },
    debris: { urls: D.sprites.map((c) => c.toDataURL()),
              padX: D.padX, padT: D.padT, w: D.w, h: D.h },
    face: fc.toDataURL()
  };
`);
write(assets.piano.url, "piano.png");
assets.debris.urls.forEach((u, i) => write(u, `debris${i}.png`));
write(assets.face, "face.png");

await run(`window.scene.stampCrush();`);          // the wreck, stamped in place
await shot("crushed.png");

fs.writeFileSync(path.join(OUT, "geo.json"), JSON.stringify({
  ...geo, dsf: DSF,
  piano: { w: assets.piano.w, h: assets.piano.h },
  debris: { padX: assets.debris.padX, padT: assets.debris.padT,
            w: assets.debris.w, h: assets.debris.h },
}, null, 2));

ws.close();
proc.kill();
console.log(`layers for ${W}x${H} written to ${path.relative(EYES, OUT)}/`);

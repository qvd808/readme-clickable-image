"""Assemble eyes.svg - the README version of the index.html easter egg.

Reads the layers captured by tools/capture.mjs (base scene, post-impact scene,
piano + debris sprites, scene geometry) and writes a single self-contained
animated SVG. Every timing constant below is copied from startCalamity() in
index.html, so the loop plays the same beats as a click on the live page:
the piano falls (820ms), lands (300ms: flash, shake, debris) and the presence
resolves out of the dark (1600ms). Only the cursor tracking is replaced - the
gaze wanders on a timer instead, since an <img> gets no pointer events.

  python3 tools/build_svg.py [layer_dir] [out.svg] [--once]

--once builds the triggered variant: one pass instead of a loop, and almost no
lead-in, since the visitor has already spent a page reload waiting for it.
"""
import base64, io, json, math, pathlib, sys
from PIL import Image, ImageChops, ImageFilter

ARGV = [a for a in sys.argv[1:] if not a.startswith("--")]
ONCE = "--once" in sys.argv
# --light trades plate resolution for wire time. It matches the poster's own
# encoding, so the swap from poster to animation is seamless rather than a
# visible drop in sharpness.
LIGHT = "--light" in sys.argv

SRC = pathlib.Path(ARGV[0] if len(ARGV) > 0 else "tools/layers")
OUT = pathlib.Path(ARGV[1] if len(ARGV) > 1 else "eyes.svg")

G = json.loads((SRC / "geo.json").read_text())
W, H, DSF = G["W"], G["H"], G["dsf"]
PW, IMP = G["pw"], G["impact"]
FB = G["faceBox"]
INK = G["inkRGB"]

# ---------------------------------------------------------------- timeline --
# seconds; the three middle phases are the durations from startCalamity()
T_IDLE, D_FALL, D_HIT, D_REVEAL, T_HOLD = 1.6, .82, .30, 1.60, 2.68
D_DIP, D_IN, T_TAIL = .45, .55, 1.6           # loop reset: dip to black, come back
if ONCE:
    T_IDLE, T_TAIL = .35, .20                 # triggered: get on with it
T_FALL0 = T_IDLE
T_HIT0 = T_FALL0 + D_FALL
T_REV0 = T_HIT0 + D_HIT
T_REV1 = T_REV0 + D_REVEAL
T_OUT0 = T_REV1 + T_HOLD                       # the presence holds, then lets go
T_BLACK = T_OUT0 + D_DIP
T_OUT1 = T_BLACK + D_IN
TOTAL = T_OUT1 + T_TAIL


def pct(t):
    return round(t / TOTAL * 100, 4)


def phase(t0, dur, p):
    """percentage position of progress p within a phase"""
    return pct(t0 + dur * p)


# ------------------------------------------------------------------ assets --
def uri(im, fmt, **kw):
    b = io.BytesIO()
    im.save(b, fmt, **kw)
    mime = {"JPEG": "jpeg", "PNG": "png"}[fmt]
    return "data:image/%s;base64,%s" % (mime, base64.b64encode(b.getvalue()).decode())


def sprite(name, css_w, css_h, colors=64):
    """crop a captured sprite to its ink and hand back a placeable data URI.
    Offsets come back in the sprite's own CSS units, whatever it was baked at."""
    im = Image.open(SRC / name)
    s = im.width / css_w                   # the sprite's own backing-store scale
    bb = im.getbbox()
    c = im.crop(bb).quantize(colors=colors, method=Image.FASTOCTREE)
    return {"uri": uri(c, "PNG", optimize=True),
            "dx": bb[0] / s, "dy": bb[1] / s,
            "w": (bb[2] - bb[0]) / s, "h": (bb[3] - bb[1]) / s}


base = Image.open(SRC / "base.png").convert("RGB")
crushed = Image.open(SRC / "crushed.png").convert("RGB")

# the impact only repaints around the figure: ship that patch, not a 2nd frame
mask = ImageChops.difference(base, crushed).convert("L").point(lambda v: 255 if v > 2 else 0)
mask = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4))
pb = mask.getbbox()
patch = crushed.crop(pb).convert("RGBA")
patch.putalpha(mask.crop(pb))

plate = base.resize((round(base.width * .75), round(base.height * .75)), Image.LANCZOS) \
    if LIGHT else base
BASE_URI = uri(plate, "JPEG", quality=82 if LIGHT else 80, optimize=True, progressive=True)
PATCH_URI = uri(patch.quantize(colors=96 if LIGHT else 128, method=Image.FASTOCTREE),
                "PNG", optimize=True)
FACE_URI = uri(Image.open(SRC / "face.png"), "PNG", optimize=True)
PIANO = sprite("piano.png", G["piano"]["w"], G["piano"]["h"])
DEBRIS = [sprite("debris%d.png" % i, G["debris"]["w"], G["debris"]["h"],
                 colors=32 if LIGHT else 64) for i in range(4)]

# ------------------------------------------------------------------- glows --
# The live page builds the eyes as two blurred divs per socket, filled with a
# CSS radial-gradient. A CSS `circle` gradient in a square box runs to the
# farthest corner (0.7071 * size) while border-radius clips it at 0.5 * size,
# so a stop at f sits at SVG offset f * sqrt(2), and the stop list is cut where
# that passes 1.
def css_stops(stops):
    out, prev = [], None
    for f, rgb, a in stops:
        o = f * math.sqrt(2)
        if o > 1:
            k = (1 / math.sqrt(2) - prev[0]) / (f - prev[0])
            rgb = tuple(prev[1][i] + (rgb[i] - prev[1][i]) * k for i in range(3))
            a = prev[2] + (a - prev[2]) * k
            out.append((1.0, rgb, a))
            break
        out.append((round(o, 4), rgb, a))
        prev = (f, rgb, a)
    return "".join(
        '<stop offset="%s" stop-color="rgb(%d,%d,%d)" stop-opacity="%.4f"/>'
        % (o, round(c[0]), round(c[1]), round(c[2]), a) for o, c, a in out)


HALO_STOPS = css_stops([(0, (207, 232, 255), 1), (.22, (125, 180, 245), 1),
                        (.45, (58, 111, 184), 1), (.62, (32, 74, 140), .42),
                        (.80, (24, 56, 110), 0)])
IRIS_STOPS = css_stops([(0, (255, 255, 255), 1), (.30, (234, 246, 255), 1),
                        (.55, (200, 230, 255), .5), (.75, (170, 210, 255), 0)])

EYES = G["eyes"]
D = EYES[0]["r"] * 2                       # socket diameter drives every size
R_HALO, R_IRIS = D * .92 / 2, D * .52 / 2
B_HALO, B_IRIS = D * .086, D * .114        # css blur(px) == feGaussianBlur std
K_HALO, K_IRIS = D * .35, D * .65          # gaze parallax: the iris outruns it

# where the presence resolves from: the midpoint of the two glows
CX = sum(e["x"] for e in EYES) / len(EYES)
CY = sum(e["y"] for e in EYES) / len(EYES)
R_MAX = max(W, H) * 1.4

# ------------------------------------------------------------- keyframes ----
def kf(name, frames):
    body = "".join("%s{%s}" % (k, v) for k, v in frames)
    return "@keyframes %s{%s}" % (name, body)


def ease_out3(p):
    return 1 - (1 - p) ** 3


N = 12                                     # samples per sampled phase
fall = [i / N for i in range(N + 1)]

# --- the piano: y = -H*.3 + (impact.y + H*.3) * p^2, rotating as it drops ---
fall_frames = [("0%%,%s%%" % pct(T_FALL0 - .001), "opacity:0;transform:translate(%.2fpx,%.2fpx)" % (IMP["x"], -H * .3))]
for p in fall:
    y = -H * .3 + (IMP["y"] + H * .3) * p * p
    fall_frames.append(("%s%%" % phase(T_FALL0, D_FALL, p),
                        "opacity:1;transform:translate(%.2fpx,%.2fpx)" % (IMP["x"], y)))
fall_frames.append(("%s%%,100%%" % pct(T_HIT0 + .001), "opacity:0;transform:translate(%.2fpx,%.2fpx)" % (IMP["x"], IMP["y"])))

rot_frames = [("0%%,%s%%" % pct(T_FALL0), "transform:rotate(%.3fdeg)" % math.degrees(-0.32))]
for p in fall:
    rot_frames.append(("%s%%" % phase(T_FALL0, D_FALL, p),
                       "transform:rotate(%.3fdeg)" % math.degrees(-0.32 + 0.4 * p * p)))
rot_frames.append(("100%", "transform:rotate(%.3fdeg)" % math.degrees(0.08)))

# --- the speed lines above it stretch as it accelerates ---
speed_frames = [("0%%,%s%%" % pct(T_FALL0), "transform:scaleY(%.4f)" % (0.3 / 1.3))]
for p in fall:
    speed_frames.append(("%s%%" % phase(T_FALL0, D_FALL, p),
                         "transform:scaleY(%.4f)" % ((0.3 + p) / 1.3)))
speed_frames.append(("100%", "transform:scaleY(1)"))

# --- impact: the whole stage kicks, then settles ---
shake_frames = [("0%%,%s%%" % pct(T_HIT0 - .001), "transform:none")]
for i in range(N + 1):
    p = i / N
    k = (1 - p) * 9
    shake_frames.append(("%s%%" % phase(T_HIT0, D_HIT, p),
                         "transform:translate(%.2fpx,%.2fpx) scale(%.4f)"
                         % (math.sin(p * 46) * k, math.cos(p * 37) * k * .7, 1 + .004 * k)))
shake_frames.append(("%s%%,100%%" % pct(T_REV0), "transform:none"))

# --- flash + debris, both only alive during those 300ms ---
flash_frames = [("0%%,%s%%" % pct(T_HIT0 - .001), "opacity:0")]
for i in range(N + 1):
    p = i / N
    flash_frames.append(("%s%%" % phase(T_HIT0, D_HIT, p), "opacity:%.4f" % (.55 * (1 - p) ** 1.6)))
flash_frames.append(("%s%%,100%%" % pct(T_REV0), "opacity:0"))

deb_frames = [("0%%,%s%%" % pct(T_HIT0 - .001),
               "opacity:0;transform:translate(%.2fpx,%.2fpx) scale(%.4f)" % (IMP["x"], IMP["y"], .4 / 1.4))]
for i in range(N + 1):
    p = i / N
    deb_frames.append(("%s%%" % phase(T_HIT0, D_HIT, p),
                       "opacity:%.4f;transform:translate(%.2fpx,%.2fpx) scale(%.4f)"
                       % (1 - p, IMP["x"], IMP["y"], (.4 + p) / 1.4)))
deb_frames.append(("%s%%,100%%" % pct(T_REV0), "opacity:0"))

# each of the four debris drawings holds for a quarter of the impact
deb_step = []
for i in range(4):
    a, b = i / 4, (i + 1) / 4
    f = [("0%%,%s%%" % phase(T_HIT0, D_HIT, a), "opacity:0"),
         ("%s%%" % phase(T_HIT0, D_HIT, min(a + .001, b)), "opacity:1"),
         ("%s%%" % phase(T_HIT0, D_HIT, b), "opacity:1"),
         ("%s%%,100%%" % phase(T_HIT0, D_HIT, min(b + .001, 1)), "opacity:%d" % (1 if i == 3 else 0))]
    deb_step.append(kf("deb%d" % i, f))

# --- the wreck is stamped on the frame the piano lands, and stays ---
crush_frames = [("0%%,%s%%" % pct(T_HIT0 - .001), "opacity:0"),
                ("%s%%,%s%%" % (pct(T_HIT0), pct(T_BLACK)), "opacity:1"),
                ("%s%%,100%%" % pct(T_BLACK + .001), "opacity:0")]

# --- the reveal: the dark closes in, the presence irises open over it ---
dark_frames = [("0%%,%s%%" % pct(T_REV0), "opacity:0")]
face_frames = [("0%%,%s%%" % pct(T_REV0), "opacity:0")]
clip_frames = [("0%%,%s%%" % pct(T_REV0), "transform:scale(0.0006)")]
eye_frames = [("0%%,%s%%" % pct(T_REV0), "opacity:1")]
for i in range(N + 1):
    p = i / N
    at = "%s%%" % phase(T_REV0, D_REVEAL, p)
    dark_frames.append((at, "opacity:%.4f" % (.5 * ease_out3(p))))
    face_frames.append((at, "opacity:%.4f" % min(1, p * 1.4)))
    clip_frames.append((at, "transform:scale(%.5f)" % max(.0006, ease_out3(p))))
    eye_frames.append((at, "opacity:%.4f" % max(0, 1 - min(1, p * 1.7))))
# the loop resets by dipping the whole frame to black rather than dissolving
# the wreck and the standing figure through each other
for frames, held, black, back in (
        (dark_frames, "opacity:0.5", "opacity:1", "opacity:0"),
        (face_frames, "opacity:1", "opacity:0", "opacity:0"),
        (clip_frames, "transform:scale(1)", "transform:scale(1)", "transform:scale(0.0006)"),
        (eye_frames, "opacity:0", "opacity:0", "opacity:1")):
    frames.append(("%s%%" % pct(T_OUT0), held))
    frames.append(("%s%%" % pct(T_BLACK), black))
    frames.append(("%s%%,100%%" % pct(T_OUT1), back))
# the clip must snap back behind the black, not shrink in view
clip_frames.insert(-1, ("%s%%" % pct(T_BLACK + .001), "transform:scale(0.0006)"))

# --- the gaze: no cursor to follow, so it wanders and keeps the parallax ---
GAZE = [(0.00, .10, .05), (0.14, -.26, -.10), (0.30, .22, .16), (0.46, -.10, .22),
        (0.62, .28, -.14), (0.78, -.22, .04), (0.90, .06, .18), (1.00, .10, .05)]


def gaze_frames(k):
    return [("%s%%" % round(t * 100, 3),
             "transform:translate(%.2fpx,%.2fpx)" % (k * dx, k * dy)) for t, dx, dy in GAZE]


CSS = "".join([
    ".s{transform-box:view-box;animation:%ss linear %s}"
    % (TOTAL, "1 forwards" if ONCE else "infinite"),
    "#shake{transform-origin:%.1fpx %.1fpx;animation-name:shake}" % (W / 2, H / 2),
    "#fall{opacity:0;transform-origin:0 0;animation-name:fall}",
    "#pianoRot{transform-origin:0 0;animation-name:pianoRot}",
    "#speed{transform-origin:0 %.2fpx;animation-name:speed}" % (-PW * .5),
    "#crush{opacity:0;animation-name:crush}",
    "#flash{opacity:0;animation-name:flash}",
    "#debris{opacity:0;transform-origin:0 0;animation-name:debris}",
    "".join("#deb%d{opacity:0;animation-name:deb%d}" % (i, i) for i in range(4)),
    "#dark{opacity:0;animation-name:dark}",
    "#face{opacity:0;animation-name:face}",
    "#revC{transform-origin:%.2fpx %.2fpx;transform:scale(0.0006);animation-name:clip}" % (CX, CY),
    ".eye{animation-name:eye}",
    ".halo{animation-name:gazeH}.iris{animation-name:gazeI}",
    kf("shake", shake_frames), kf("fall", fall_frames), kf("pianoRot", rot_frames),
    kf("speed", speed_frames), kf("crush", crush_frames), kf("flash", flash_frames),
    kf("debris", deb_frames), "".join(deb_step),
    kf("dark", dark_frames), kf("face", face_frames), kf("clip", clip_frames),
    kf("eye", eye_frames),
    kf("gazeH", gaze_frames(K_HALO)), kf("gazeI", gaze_frames(K_IRIS)),
    # ids beat .s on specificity, so the opt-out has to be !important:
    # with no animation every layer falls back to its idle base style
    "@media(prefers-reduced-motion:reduce){.s{animation:none!important}}",
])

# --------------------------------------------------------------- the file ---
speed_rects = []
for i in range(6):
    sx = (i / 5 - .5) * PW * .9
    L = PW * (.35 + .5 * ((i * 37) % 7) / 7) * 1.3
    top = -PW * .55 - L
    speed_rects.append('<rect x="%.2f" y="%.2f" width="1.1" height="%.2f"/>'
                       % (sx - .55, top, -PW * .5 - top))

eyes_svg = "".join(
    '<g class="eye s" transform="translate(%.3f,%.3f)">'
    '<circle class="halo s" r="%.2f" fill="url(#gh)" filter="url(#bh)"/>'
    '<circle class="iris s" r="%.2f" fill="url(#gi)" filter="url(#bi)"/></g>'
    % (e["x"], e["y"], R_HALO, R_IRIS) for e in EYES)

debris_svg = "".join(
    '<image id="deb%d" class="s" href="%s" x="%.2f" y="%.2f" width="%.2f" height="%.2f"/>'
    % (i, d["uri"], -G["debris"]["padX"] + d["dx"], -G["debris"]["padT"] + d["dy"], d["w"], d["h"])
    for i, d in enumerate(DEBRIS))

SVG = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="A sketched figure at the rim of a canyon under two glowing eyes; a piano falls on it and something looks back">
<!--
  ==========================================================================
  README build of eyes/index.html - same scene, same beats, no cursor.
  Regenerate with: node tools/capture.mjs && python3 tools/build_svg.py

  CREDIT / ATTRIBUTION - hidden easter egg

  The character revealed at the end is WONDER OF U, from
  "JoJo's Bizarre Adventure" (Part 8: JoJolion).

  JoJo's Bizarre Adventure and all of its characters are
  copyright (c) Hirohiko Araki / Shueisha.

  Reference image source:
    https://jojo.fandom.com/wiki/Wonder_of_U

  Used here as a non-commercial personal easter egg on a personal profile
  page. All rights in the character and its depiction remain with the
  original creator and rights holders. No affiliation with, sponsorship by,
  or endorsement from the rights holders is implied.

  Full respect and credit to Hirohiko Araki as the creator.
  ==========================================================================
-->
<defs>
<radialGradient id="gh" r="0.5">{HALO_STOPS}</radialGradient>
<radialGradient id="gi" r="0.5">{IRIS_STOPS}</radialGradient>
<filter id="bh" x="-150%" y="-150%" width="400%" height="400%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="{B_HALO:.2f}"/></filter>
<filter id="bi" x="-150%" y="-150%" width="400%" height="400%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="{B_IRIS:.2f}"/></filter>
<clipPath id="rev" clipPathUnits="userSpaceOnUse"><circle id="revC" class="s" cx="{CX:.2f}" cy="{CY:.2f}" r="{R_MAX:.1f}"/></clipPath>
<style>{CSS}</style>
</defs>
<rect width="{W}" height="{H}" fill="#0b0c0e"/>
<g id="shake" class="s">
  <image href="{BASE_URI}" x="0" y="0" width="{W}" height="{H}"/>
  <image id="crush" class="s" href="{PATCH_URI}" x="{pb[0] / DSF:.2f}" y="{pb[1] / DSF:.2f}" width="{(pb[2] - pb[0]) / DSF:.2f}" height="{(pb[3] - pb[1]) / DSF:.2f}"/>
  <g id="fall" class="s">
    <g id="speed" class="s" fill="rgba({INK},0.24)">{"".join(speed_rects)}</g>
    <g id="pianoRot" class="s"><image href="{PIANO['uri']}" x="{PIANO['dx'] - G['piano']['w'] / 2:.2f}" y="{PIANO['dy'] - G['piano']['h'] / 2:.2f}" width="{PIANO['w']:.2f}" height="{PIANO['h']:.2f}"/></g>
  </g>
  <g id="debris" class="s">{debris_svg}</g>
  <rect id="flash" class="s" width="{W}" height="{H}" fill="rgb(200,224,255)"/>
  <rect id="dark" class="s" width="{W}" height="{H}" fill="rgb(6,8,12)"/>
  <g clip-path="url(#rev)"><image id="face" class="s" href="{FACE_URI}" x="{FB['x']:.2f}" y="{FB['y']:.2f}" width="{FB['w']:.2f}" height="{FB['h']:.2f}" preserveAspectRatio="none"/></g>
  {eyes_svg}
</g>
</svg>
'''

OUT.write_text(SVG)
print("wrote %s: %.0f KB  (%.1fs loop, %dx%d)" % (OUT, len(SVG) / 1024, TOTAL, W, H))

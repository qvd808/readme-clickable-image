"""Write poster.jpg - the resting frame the README shows until someone clicks.

It goes out uncached on every profile view, so its size is the running cost of
the whole thing; see the table in DEPLOY.md before changing the scale.

  python3 tools/build_poster.py [layer_dir] [scale] [quality]
"""
import pathlib, sys
from PIL import Image

SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "tools/layers")
SCALE = float(sys.argv[2]) if len(sys.argv) > 2 else 0.75
QUALITY = int(sys.argv[3]) if len(sys.argv) > 3 else 82

src = Image.open(SRC / "poster.png").convert("RGB")
out = src.resize((round(src.width * SCALE), round(src.height * SCALE)), Image.LANCZOS)
out.save("poster.jpg", "JPEG", quality=QUALITY, optimize=True, progressive=True)

kb = pathlib.Path("poster.jpg").stat().st_size / 1024
print("poster.jpg  %dpx wide  %.0f KB  (%.2fx at a 890px README column)"
      % (out.width, kb, out.width / 890))

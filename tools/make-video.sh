#!/usr/bin/env bash
# Turns the timestamped frames from record-demo.mjs into an MP4 (H.264) and a README GIF.
#   tools/make-video.sh <frames-dir> <output-basename>   →  <basename>.mp4, <basename>.gif
set -euo pipefail
frames="$1"; outbase="$2"
list="$frames/concat.txt"

# Variable frame timing → ffmpeg concat list with per-frame durations.
python3 - "$frames" > "$list" <<'PY'
import json, sys, os
d = sys.argv[1]
fr = json.load(open(os.path.join(d, "frames.json")))
for a, b in zip(fr, fr[1:] + [None]):
    dur = (b["t"] - a["t"]) if b else 0.5
    print(f"file '{os.path.abspath(a['file'])}'\nduration {max(dur, 1/60):.4f}")
print(f"file '{os.path.abspath(fr[-1]['file'])}'")
PY

ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" \
  -vf "fps=30,scale=1440:-2:flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset slow -crf 20 -movflags +faststart "$outbase.mp4"

ffmpeg -y -loglevel error -i "$outbase.mp4" \
  -vf "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
  "$outbase.gif"

ls -lh "$outbase.mp4" "$outbase.gif"

#!/usr/bin/env bash
# Render master frames [A,B) to PNG (resume-safe), encode a video-only segment, then delete the PNGs.
# Segments are joined losslessly and the audio is muxed once by master_assemble.sh.
set -euo pipefail
A=$1; B=$2
cd "$(dirname "$0")"
export CHROME_ARGS="--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader" FRAME_TIMEOUT_MS=600000
OUT=../renders/master; SEG=$OUT/segments; mkdir -p "$SEG"
S=$(printf '%06d' "$A")
[ -f "$SEG/seg_$S.mkv" ] && { echo "[chunk] $A-$B already done"; exit 0; }
node labyrinth_renderer.js --root .. --range "$A" "$B" --no-debug --no-encode --workers 2 --res 1920x1080 --out renders/master
FR=$(ls -d $OUT/*_Range_${A}_${B}_*_frames)
N=$(ls "$FR" | grep -c '\.png$'); [ "$N" -eq $((B-A)) ] || { echo "[chunk] only $N/$((B-A)) frames"; exit 3; }
ffmpeg -y -hide_banner -loglevel error -framerate 30 -start_number "$A" -i "$FR/frame_%06d.png" -frames:v $((B-A)) \
  -c:v libx264 -preset slow -crf 17 -g 60 \
  -vf 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p' -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -r 30 "$SEG/seg_$S.part.mkv"
mv "$SEG/seg_$S.part.mkv" "$SEG/seg_$S.mkv"
rm -rf "$FR"
echo "[chunk] $A-$B encoded and frames removed"

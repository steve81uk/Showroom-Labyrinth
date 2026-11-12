#!/usr/bin/env bash
# Join the video-only segments losslessly and mux audio_master.wav once (AAC 320k, 48 kHz) into the final .mkv.
set -euo pipefail
cd "$(dirname "$0")"
SEG=../renders/master/segments
ls $SEG/seg_*.mkv | sort | sed "s#^#file '$PWD/#; s#\$#'#" > $SEG/list.txt
N=$(wc -l < $SEG/list.txt); [ "$N" -eq 16 ] || { echo "expected 16 segments, have $N"; exit 3; }
OUT=../renders/master/The_Showroom_Labyrinth_Master_1920x1080_30fps.mkv
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i $SEG/list.txt -i ../audio_master.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 320k -ar 48000 -shortest \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv "$OUT"
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames,width,height,color_space -of compact "$OUT"
ffprobe -v error -show_entries format=duration -of compact "$OUT"

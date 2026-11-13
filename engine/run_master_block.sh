#!/usr/bin/env bash
# One unattended block: render remaining master chunks in order until done or killed. Resume-safe.
# A chunk that crashes (browser target closed) is retried up to 3 times; saved frames are reused.
cd "$(dirname "$0")"
for a in $(seq 0 400 6000); do b=$((a+400)); [ $b -gt 6396 ] && b=6396
  ok=0; for t in 1 2 3; do if ./master_chunk.sh $a $b; then ok=1; break; fi; echo "[runner] chunk $a-$b failed (try $t), retrying"; pkill -f chrome-linux64; sleep 5; done
  [ $ok -eq 1 ] || { echo "[runner] chunk $a-$b failed 3 times, stopping"; exit 4; }
done
echo ALL_CHUNKS_DONE

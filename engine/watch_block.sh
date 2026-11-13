#!/usr/bin/env bash
# Wait up to ~590 s, returning early if the block runner dies. Prints the last progress line and state.
for i in $(seq 1 59); do
  pgrep -f run_master_block >/dev/null || { echo STOPPED; grep "\[render\]\|\[chunk\]\|fatal\|runner\|ALL_CHUNKS" /tmp/master_block.log | tail -2; exit 0; }
  sleep 10
done
echo RUNNING; grep "\[render\]\|\[chunk\]\|fatal\|runner" /tmp/master_block.log | tail -1

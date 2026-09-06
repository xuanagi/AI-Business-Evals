#!/bin/bash
set -u

LOG_DIR=/logs/verifier
mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR/reward.json" "$LOG_DIR/reward.txt" "$LOG_DIR/score.json"

/usr/local/bin/python /tests/grading/score.py > "$LOG_DIR/test_output.txt" 2>&1
status=$?

if [ ! -s "$LOG_DIR/reward.json" ]; then
  printf '{"reward": 0.0}\n' > "$LOG_DIR/reward.json"
  printf 'Native evaluator failed before writing reward.json (exit=%s).\n' "$status" >> "$LOG_DIR/test_output.txt"
fi
if [ ! -s "$LOG_DIR/reward.txt" ]; then
  printf '0.0000000000\n' > "$LOG_DIR/reward.txt"
  printf 'Native evaluator failed before writing reward.txt (exit=%s).\n' "$status" >> "$LOG_DIR/test_output.txt"
fi

exit 0

#!/usr/bin/env bash
set -euo pipefail

TRACE_FILE="${1:-.trace/trace.jsonl}"

if [[ ! -f "$TRACE_FILE" ]]; then
  echo "trace file not found: $TRACE_FILE"
  echo "start zhgu-code first, then rerun this script."
  exit 1
fi

echo "tailing trace file: $TRACE_FILE"
tail -f "$TRACE_FILE"

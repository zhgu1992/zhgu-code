#!/usr/bin/env bash
set -euo pipefail

TRANSCRIPT_FILE="${1:-${ZHGU_TRANSCRIPT_FILE:-.trace/transcript.jsonl}}"

if [[ ! -f "$TRANSCRIPT_FILE" ]]; then
  echo "transcript file not found: $TRANSCRIPT_FILE"
  echo "run zhgu-code first, then rerun this command."
  exit 1
fi

echo "tailing transcript file: $TRANSCRIPT_FILE"
tail -f "$TRANSCRIPT_FILE"

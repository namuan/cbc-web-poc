#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="${1:-equipment-dev}"

if ! command -v tmux >/dev/null 2>&1; then
  printf 'tmux is required but was not found.\n' >&2
  exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  exec tmux attach-session -t "$SESSION"
fi

cd "$ROOT"

if ! podman info >/dev/null 2>&1; then
  podman machine start
fi

podman compose up --build -d

tmux new-session -d -s "$SESSION" -n services -c "$ROOT" 'podman compose logs --tail=40 -f db'
tmux split-window -h -t "$SESSION":0 -c "$ROOT" 'podman compose logs --tail=40 -f setup api'
tmux split-window -v -t "$SESSION":0.0 -c "$ROOT" 'podman compose logs --tail=40 -f web'
tmux select-layout -t "$SESSION":0 tiled
tmux select-pane -t "$SESSION":0.1
exec tmux attach-session -t "$SESSION"

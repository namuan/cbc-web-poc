#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="${1:-equipment-dev}"

if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
fi

cd "$ROOT"

if podman info >/dev/null 2>&1; then
  test_containers="$(podman ps -aq --filter name=cbc-web-poc_test-)"
  if [[ -n "$test_containers" ]]; then
    while IFS= read -r container; do
      podman rm -f "$container"
    done <<< "$test_containers"
  fi
  if podman ps -a --format '{{.Names}}' | grep -Eq '^cbc-web-poc_(web|api|setup|db)_1$'; then
    podman compose down
  fi
else
  printf 'Podman machine is not running; no containers can be stopped.\n'
fi

#!/usr/bin/env bash
set -euo pipefail

words=(
  amber
  atlas
  breeze
  cedar
  comet
  delta
  ember
  falcon
  fern
  glacier
  harbor
  ion
  juniper
  lagoon
  maple
  meadow
  nova
  orbit
  pine
  prism
  quarry
  raven
  sierra
  sparrow
  thistle
  timber
  topo
  vector
  willow
  zephyr
)

if command -v shuf >/dev/null 2>&1; then
  word="$(printf '%s\n' "${words[@]}" | shuf -n 1)"
else
  word="${words[$(( RANDOM % ${#words[@]} ))]}"
fi

filename="agent-message-${word}.md"
project_path="./${filename}"
shared_dir="$HOME/.claude/agent-msg"
shared_path="${shared_dir}/${filename}"

mkdir -p "$shared_dir"

printf 'Code: %s\n' "$word"
printf 'Filename: %s\n' "$filename"
printf 'Project path: %s\n' "$project_path"
printf 'Shared path: %s\n' "$shared_path"

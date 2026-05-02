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

digits="$(printf '%03d' $(( RANDOM % 1000 )))"
word="${word}${digits}"

filename="agent-message-${word}.md"
shared_dir="$HOME/.agent-messages"
shared_path="${shared_dir}/${filename}"

mkdir -p "$shared_dir"

printf 'Code: %s\n' "$word"
printf 'Filename: %s\n' "$filename"
printf 'Shared path: %s\n' "$shared_path"

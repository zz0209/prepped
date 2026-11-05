#!/bin/sh
# A thesis defense in Prepped from the command line. Each command prints JSON; the meeting's id is in .meeting.id.
set -e

meeting=$(prepped meetings create --title "Thesis defense" --type presentation --start 2026-11-20T10:00 \
  --setup '{"title":"Adaptive retrieval for meeting answers","audience":"Thesis committee","durationMinutes":25}' \
  | node -e 'process.stdin.on("data", d => console.log(JSON.parse(d).meeting.id))')

prepped talk slides --meeting "$meeting" --file ./defense.pptx      # .pptx or .pdf, up to 80 MB
prepped talk script --meeting "$meeting" --file ./script.md         # what you plan to say; a reference, not read word for word
prepped projects add --meeting "$meeting" --github owner/thesis-code
prepped material add --meeting "$meeting" --files ./paper.pdf

# Drafting the outline uses a model and spends a little credit. Or write it yourself with `prepped talk outline`.
prepped talk draft "$meeting"
prepped talk get "$meeting"

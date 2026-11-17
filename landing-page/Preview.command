#!/bin/bash
# Double-click this in Finder to preview the landing page locally.
#
# Why this exists instead of just opening index.html: the page uses ES
# modules and fetches the toy model from the server root (/models/...),
# neither of which works when opened directly as a file:// URL, or when
# served with anything other than THIS folder as the web server's root
# (e.g. running a server from the repo root instead — the model 404s and
# none of the 3D toy icons or the embedded machine load). This always cds
# into this script's own folder first so that mistake isn't possible.

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

PORT=8787
URL="http://localhost:$PORT/index.html"

echo "=== DAWchapon landing page preview ==="
echo "Serving: $PROJECT_DIR"
echo "URL:     $URL"
echo

open "$URL" &

python3 -m http.server "$PORT"

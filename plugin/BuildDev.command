#!/bin/bash
# Double-click this in Finder to build DAWchapon in dev mode:
#   - WebView points at the local Vite dev server (http://localhost:5173)
#     instead of embedded assets, so WebUI edits hot-reload without a
#     plugin rebuild.
#   - Test mode overlay (Prev/Next buttons to cycle every toy+variant
#     combo) is enabled.
#   - Debug build, for faster rebuilds and usable debug symbols.
#
# Reuses the existing "build" directory (shared with earlier dev builds)
# so JUCE isn't re-fetched/rebuilt from scratch every time.

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$PROJECT_DIR/build"
WEBUI_DIR="$PROJECT_DIR/WebUI"

cd "$PROJECT_DIR"

echo "=== DAWchapon: Dev build ==="
echo "Build dir:  $BUILD_DIR"
echo "Dev server: WebView -> http://localhost:5173"
echo "Test mode:  ON (Prev/Next overlay)"
echo

if ! lsof -i :5173 >/dev/null 2>&1; then
    echo "NOTE: nothing is listening on :5173 yet — the plugin's WebView will"
    echo "show a blank/error page until you run 'npm run dev' inside WebUI/"
    echo "(in another terminal, or it may already be running elsewhere)."
    echo
fi

echo "--- Configuring (Debug, dev server ON, test mode ON) ---"
cmake -S "$PROJECT_DIR" -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE=Debug \
    -DDAWCHAPON_USE_DEV_SERVER=ON \
    -DDAWCHAPON_TEST_MODE=ON
CONFIGURE_STATUS=$?

if [ $CONFIGURE_STATUS -ne 0 ]; then
    echo
    echo "!!! CMake configure failed (exit $CONFIGURE_STATUS). See above for details."
    read -r -p "Press Enter to close this window..." _
    exit $CONFIGURE_STATUS
fi

JOBS="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"

echo
echo "--- Building (using $JOBS parallel jobs) ---"
cmake --build "$BUILD_DIR" --target DAWchapon_VST3 --target DAWchapon_AU -j"$JOBS"
BUILD_STATUS=$?

echo
if [ $BUILD_STATUS -eq 0 ]; then
    echo "=== Build succeeded ==="
    echo "VST3 installed to: ~/Library/Audio/Plug-Ins/VST3/DAWchapon.vst3"
    echo "AU installed to:   ~/Library/Audio/Plug-Ins/Components/DAWchapon.component"
    echo
    echo "Reminder: run 'npm run dev' inside WebUI/ if it isn't already running,"
    echo "then (re)load the plugin in your DAW."
else
    echo "!!! Build failed (exit $BUILD_STATUS). See the output above for details."
fi

read -r -p "Press Enter to close this window..." _
exit $BUILD_STATUS

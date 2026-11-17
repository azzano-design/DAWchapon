#!/bin/bash
# Double-click this in Finder to build DAWchapon in production mode:
#   - Builds the WebUI with Vite and embeds the output in the plugin
#     binary, so the WebView needs no dev server/network access at all.
#   - Test mode overlay (Prev/Next buttons) is disabled.
#   - Release build, optimized.
#
# Uses a separate "build-release" directory so it never shares object
# files/cache with the dev build.

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$PROJECT_DIR/build-release"
WEBUI_DIR="$PROJECT_DIR/WebUI"

cd "$PROJECT_DIR"

echo "=== DAWchapon: Production build ==="
echo "Build dir: $BUILD_DIR"
echo "Embeds the built WebUI; test mode overlay disabled."
echo

if [ ! -d "$WEBUI_DIR/node_modules" ]; then
    echo "--- Installing WebUI dependencies (first run) ---"
    (cd "$WEBUI_DIR" && npm install)
    NPM_INSTALL_STATUS=$?
    if [ $NPM_INSTALL_STATUS -ne 0 ]; then
        echo "!!! npm install failed (exit $NPM_INSTALL_STATUS)."
        read -r -p "Press Enter to close this window..." _
        exit $NPM_INSTALL_STATUS
    fi
    echo
fi

echo "--- Building WebUI production assets ---"
(cd "$WEBUI_DIR" && npm run build)
WEBUI_BUILD_STATUS=$?

if [ $WEBUI_BUILD_STATUS -ne 0 ]; then
    echo
    echo "!!! WebUI build failed (exit $WEBUI_BUILD_STATUS). See above for details."
    read -r -p "Press Enter to close this window..." _
    exit $WEBUI_BUILD_STATUS
fi

echo
echo "--- Configuring (Release, dev server OFF, test mode OFF) ---"
cmake -S "$PROJECT_DIR" -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DDAWCHAPON_USE_DEV_SERVER=OFF \
    -DDAWCHAPON_TEST_MODE=OFF
CONFIGURE_STATUS=$?

if [ $CONFIGURE_STATUS -ne 0 ]; then
    echo
    echo "!!! CMake configure failed (exit $CONFIGURE_STATUS). See above for details."
    read -r -p "Press Enter to close this window..." _
    exit $CONFIGURE_STATUS
fi

JOBS="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"

echo
echo "--- Building (using $JOBS parallel jobs; first run also builds JUCE, so it's slow) ---"
cmake --build "$BUILD_DIR" --target DAWchapon_VST3 --target DAWchapon_AU -j"$JOBS"
BUILD_STATUS=$?

echo
if [ $BUILD_STATUS -eq 0 ]; then
    echo "=== Build succeeded ==="
    echo "VST3 installed to: ~/Library/Audio/Plug-Ins/VST3/DAWchapon.vst3"
    echo "AU installed to:   ~/Library/Audio/Plug-Ins/Components/DAWchapon.component"
else
    echo "!!! Build failed (exit $BUILD_STATUS). See the output above for details."
fi

read -r -p "Press Enter to close this window..." _
exit $BUILD_STATUS

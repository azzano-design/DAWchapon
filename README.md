# DAWtchapon

A macOS audio-effect plugin (VST3 and AU): spin an animated gachapon machine
to get a random "toy," and that toy secretly sets which audio effect is
applied to the track. The effect stays active until you spin again.

See `/Users/brendanazzano/.claude/plans/i-want-to-create-cheerful-hummingbird.md`
for the full MVP design (toy roster, state machine, bridge design, scope).

## Project layout

- `Source/` — the JUCE C++ plugin (processor, editor, per-toy DSP chains).
- `WebUI/` — the Three.js gachapon-machine GUI, loaded into the plugin's
  embedded WebView.
- `Tests/` — JUCE `UnitTest`-based checks for the toy registry and
  processor state.

## Building the C++ plugin

Requires CMake 3.22+ and a C++20 compiler. JUCE is fetched automatically via
`FetchContent` on first configure (pinned to 9.0.5).

```sh
cmake -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build
```

Build with no `--target` (or `--target DAWtchapon_VST3` / `--target DAWtchapon_AU`
specifically) — `--target DAWtchapon` alone only builds JUCE's shared-code
static library, not an actual plugin binary.

The build defaults to `DAWTCHAPON_USE_DEV_SERVER=ON`, which points the
plugin's WebView at `http://localhost:5173` (see below) instead of embedding
built web assets — the fastest loop while iterating on the GUI. The built
VST3 and AU are copied into `~/Library/Audio/Plug-Ins/VST3/` and
`~/Library/Audio/Plug-Ins/Components/` automatically
(`COPY_PLUGIN_AFTER_BUILD`), so they show up next time Lynx/REAPER/GarageBand
rescans plugins. GarageBand only loads Audio Units, not VST3 — that's what
the AU target is for.

Run the unit tests with:

```sh
cmake --build build --target DAWtchaponTests
./build/Tests/DAWtchaponTests_artefacts/Debug/DAWtchaponTests
```

### Release (self-contained) build

Build the WebUI first, then reconfigure with the dev-server option off so
the plugin embeds the built assets instead of pointing at `localhost`:

```sh
cd WebUI && npm install && npm run build && cd ..
cmake -B build -DCMAKE_BUILD_TYPE=Release -DDAWTCHAPON_USE_DEV_SERVER=OFF
cmake --build build
```

## Sharing the plugin with someone else (GarageBand)

GarageBand only loads Audio Units, so this is all about the AU build —
ignore the VST3 target here.

### 1. Build a self-contained Release AU

A dev-server build only works on this machine (its WebView points at
`localhost:5173`, which won't exist on anyone else's). Build the embedded
version instead, into a separate directory so it doesn't disturb your normal
dev-server `build/` setup:

```sh
cd WebUI && npm install && npm run build && cd ..
cmake -B build-release -DCMAKE_BUILD_TYPE=Release -DDAWTCHAPON_USE_DEV_SERVER=OFF
cmake --build build-release --target DAWtchapon_AU
```

This produces `build-release/DAWtchapon_artefacts/Release/AU/DAWtchapon.component`.

### 2. Build for both Apple Silicon and Intel, if it matters

The default build only targets whatever chip you're building on — confirmed
arm64-only as of this writing (`file .../DAWtchapon.component/Contents/MacOS/DAWtchapon`).
If the other person might be on an Intel Mac, build universal instead:

```sh
cmake -B build-release -DCMAKE_BUILD_TYPE=Release -DDAWTCHAPON_USE_DEV_SERVER=OFF \
  -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64"
cmake --build build-release --target DAWtchapon_AU
```

### 3. Code signing — the actual blocker

As built, the AU is only **ad-hoc signed**, which Gatekeeper rejects on
another Mac — confirmed as of this writing:
`spctl -a -t exec -vv DAWtchapon.component` → `rejected`. Two ways to deal
with that:

- **Informal (what makes sense for sharing with one person):** zip and send
  it as-is, and have the recipient clear the quarantine flag themselves
  after downloading, before GarageBand will load it:
  ```sh
  xattr -cr ~/Library/Audio/Plug-Ins/Components/DAWtchapon.component
  ```
  (equivalent to right-clicking the `.component` in Finder → Open → approving
  the warning.)
- **Proper distribution:** enroll in the Apple Developer Program ($99/yr),
  get a "Developer ID Application" certificate, then sign and notarize so it
  opens with no warning at all:
  ```sh
  codesign --deep --force --options runtime \
    --sign "Developer ID Application: Your Name (TEAMID)" \
    build-release/DAWtchapon_artefacts/Release/AU/DAWtchapon.component

  ditto -c -k --keepParent \
    build-release/DAWtchapon_artefacts/Release/AU/DAWtchapon.component \
    DAWtchapon.zip
  xcrun notarytool submit DAWtchapon.zip \
    --apple-id <your-apple-id> --team-id <TEAMID> --password <app-specific-password> --wait
  xcrun stapler staple build-release/DAWtchapon_artefacts/Release/AU/DAWtchapon.component
  ```
  Overkill for sending to one friend, but it's the only way to avoid asking
  the recipient to run a terminal command first.

### 4. Package and send it

```sh
cd build-release/DAWtchapon_artefacts/Release/AU
zip -r DAWtchapon.component.zip DAWtchapon.component
```

Send `DAWtchapon.component.zip` however's convenient (AirDrop, cloud link,
etc).

### 5. What the recipient does

1. Unzip it.
2. Move `DAWtchapon.component` into `~/Library/Audio/Plug-Ins/Components/`.
3. If it wasn't notarized, clear the quarantine flag (step 3's `xattr`
   command above, run on their machine against their own copy).
4. Quit and reopen GarageBand (or run `killall -9 AudioComponentRegistrar`
   first) so it rescans for new Audio Units.
5. It should now show up under GarageBand's AU effects list, under
   manufacturer "Bazz" (`PLUGIN_MANUFACTURER_CODE` in `CMakeLists.txt`).

## WebUI dev loop

```sh
cd WebUI
npm install
npm run dev
```

This serves the Three.js GUI at `http://localhost:5173`. With the plugin
built in dev-server mode, reopening the plugin's editor window in your host
(close/reopen the floating window) picks up JS/Three.js changes without
recompiling the C++ side. The page also runs standalone in a plain browser
(no plugin backend) for quick visual iteration — it falls back to a local
random pick instead of calling into C++.

## Validating the plugin

1. `pluginval` (installed via `brew install --cask pluginval`):
   ```sh
   /Applications/pluginval.app/Contents/MacOS/pluginval \
     --validate-in-process --strictness-level 10 \
     build/DAWtchapon_artefacts/Debug/VST3/DAWtchapon.vst3
   ```
   Passes clean at strictness level 10 as of this writing.
2. `auval` (ships with macOS) for the AU build — GarageBand silently hides
   any AU plugin that fails this, so it matters more than `pluginval` does
   for VST3:
   ```sh
   auval -v aufx Dwt1 Bazz
   ```
   Passes clean (`AU VALIDATION SUCCEEDED`) as of this writing.
3. Load it on a track in REAPER or Lynx (VST3) / GarageBand (AU): automate
   the `Active Toy` parameter to audition each DSP chain in isolation,
   confirm the spin gesture updates sound + visuals together, save/reload
   the project to confirm state recall.

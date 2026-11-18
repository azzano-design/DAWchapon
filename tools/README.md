# Stem rendering (build tool — not shipped with the site)

The live page (`../index.html`) switches between 6 plain audio files instead
of processing audio live in the browser: `../assets/dawchapon-test.mp3`
(dry/Original Sound) plus 5 pre-rendered effect versions in
`../assets/stems/`, one per toy. Switching preserves the current playhead
and play/pause state (see `swapTrack()` in `../js/main.js`).

Re-run this whenever `dawchapon-test.mp3` is replaced, to regenerate the 5
stems from the new track:

```sh
npm install playwright   # one-time, if not already available
node run-render-stems.mjs
```

Needs `ffmpeg` on PATH (`brew install ffmpeg`).

## How it works

`render-stems.html`/`render-stems.js` is a tiny page that decodes the dry
track and re-renders it through each toy's DSP graph using an
`OfflineAudioContext` — the exact same graph-building logic that was
originally tuned live in the browser (see the git history of
`../js/audio-engine.js`, since retired from the shipped page once this
pre-rendered approach replaced it). `run-render-stems.mjs` drives that page
with Playwright, pulls out each rendered buffer as a WAV, and converts it
to MP3 with ffmpeg.

If a toy's DSP ever changes, update the `TOY_BUILDERS` array in
`render-stems.js` to match (there's no single shared source for it now that
the live engine is gone), then re-run this.

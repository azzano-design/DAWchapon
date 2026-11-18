// Build tool, not shipped with the site. Run this (see README.md in this
// folder) whenever assets/dawchapon-test.mp3 is replaced, to regenerate
// the 5 pre-rendered effect stems in assets/stems/ that js/main.js switches
// between. Needs Playwright installed (not a project dependency — see
// README.md for how this repo already has it available) and ffmpeg on PATH.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const landingPageDir = path.resolve(__dirname, "..");
const stemsDir = path.join(landingPageDir, "assets", "stems");

const TOY_NAMES = ["brobot", "zyxar", "distortron", "howler", "nostolgon"];

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mp3": "audio/mpeg",
  ".json": "application/json",
};

function serveLandingPage(port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split("?")[0]);
      const filePath = path.join(landingPageDir, urlPath);
      if (!filePath.startsWith(landingPageDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const ext = path.extname(filePath);
      res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
      const stream = createReadStream(filePath);
      stream.on("error", () => {
        res.writeHead(404);
        res.end();
      });
      stream.pipe(res);
    });
    server.listen(port, () => resolve(server));
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit" });
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

async function main() {
  await mkdir(stemsDir, { recursive: true });

  const port = 8799;
  const server = await serveLandingPage(port);
  console.log(`Serving ${landingPageDir} on :${port}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console]", msg.text());
  });

  await page.goto(`http://localhost:${port}/tools/render-stems.html`, { waitUntil: "networkidle" });

  for (let toyIndex = 0; toyIndex < TOY_NAMES.length; toyIndex++) {
    const name = TOY_NAMES[toyIndex];
    console.log(`Rendering ${name}...`);
    const base64Wav = await page.evaluate((idx) => window.renderStemToBase64Wav(idx), toyIndex);
    const wavBuffer = Buffer.from(base64Wav, "base64");
    const wavPath = path.join(stemsDir, `${name}.wav`);
    await writeFile(wavPath, wavBuffer);

    const mp3Path = path.join(stemsDir, `${name}.mp3`);
    await run("ffmpeg", ["-y", "-i", wavPath, "-codec:a", "libmp3lame", "-q:a", "2", mp3Path]);
    await run("rm", [wavPath]);
    console.log(`  -> ${mp3Path}`);
  }

  await browser.close();
  server.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

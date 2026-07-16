const { cp, mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_ENTRIES = [
  "auth",
  "background",
  "config",
  "content",
  "icons",
  "options",
  "playback",
  "popup",
  "providers",
  "services",
  "shared",
  "trakt",
  "LICENSE",
];
const TARGETS = new Set(["firefox", "chrome"]);

function targetManifest(baseManifest, target) {
  const manifest = structuredClone(baseManifest);
  if (target === "firefox") return manifest;

  delete manifest.browser_specific_settings;
  manifest.minimum_chrome_version = "106";
  manifest.background = { service_worker: "service-worker.js" };
  manifest.icons = { 512: "icons/mireki.png" };
  manifest.action.default_icon = "icons/mireki.png";
  return manifest;
}

function serviceWorker(scripts) {
  return `importScripts(\n${scripts.map((script) => `  ${JSON.stringify(script)}`).join(",\n")}\n);\n`;
}

async function buildTarget(target, outputRoot = path.join(ROOT, "build")) {
  if (!TARGETS.has(target)) throw new Error(`Unsupported target: ${target}`);

  const destination = path.join(outputRoot, target);
  const baseManifest = JSON.parse(await readFile(path.join(ROOT, "manifest.json"), "utf8"));
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await Promise.all(SOURCE_ENTRIES.map((entry) => cp(path.join(ROOT, entry), path.join(destination, entry), { recursive: true })));
  await writeFile(path.join(destination, "manifest.json"), `${JSON.stringify(targetManifest(baseManifest, target), null, 2)}\n`);
  if (target === "chrome") {
    await writeFile(path.join(destination, "service-worker.js"), serviceWorker(baseManifest.background.scripts));
  }
  return destination;
}

async function main() {
  const targets = process.argv.slice(2);
  const selected = targets.length ? targets : [...TARGETS];
  for (const target of selected) console.log(await buildTarget(target));
}

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { buildTarget, serviceWorker, targetManifest };

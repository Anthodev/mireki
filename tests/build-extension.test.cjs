const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { buildTarget, serviceWorker, targetManifest } = require("../tools/build-extension.cjs");

const baseManifest = require("../manifest.json");
const firefoxManifest = targetManifest(baseManifest, "firefox");
const chromeManifest = targetManifest(baseManifest, "chrome");

assert.deepEqual(firefoxManifest, baseManifest, "Firefox output preserves the canonical manifest");
assert.equal(chromeManifest.browser_specific_settings, undefined);
assert.deepEqual(chromeManifest.background, { service_worker: "service-worker.js" });
assert.equal(chromeManifest.minimum_chrome_version, "106");
assert.deepEqual(chromeManifest.icons, { 512: "icons/mireki.png" });
assert.equal(chromeManifest.action.default_icon, "icons/mireki.png");

const worker = serviceWorker(baseManifest.background.scripts);
let previous = -1;
for (const script of baseManifest.background.scripts) {
  const position = worker.indexOf(JSON.stringify(script));
  assert.ok(position > previous, `${script} keeps its background load order`);
  previous = position;
}

(async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mireki-build-"));
  try {
    const firefox = await buildTarget("firefox", outputRoot);
    const chrome = await buildTarget("chrome", outputRoot);
    assert.notEqual(firefox, chrome);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(firefox, "manifest.json"))), baseManifest);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(chrome, "manifest.json"))).background,
      { service_worker: "service-worker.js" });
    await fs.access(path.join(chrome, "service-worker.js"));
    await fs.access(path.join(chrome, "shared", "webextension-api.js"));
    await fs.access(path.join(firefox, "shared", "webextension-api.js"));
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
  console.log("dual-target build checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });

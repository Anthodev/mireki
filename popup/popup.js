const elements = {
  message: document.querySelector("#message"),
  details: document.querySelector("#details"),
  artwork: document.querySelector("#media-artwork"),
  title: document.querySelector("#media-title"),
  source: document.querySelector("#media-source"),
  status: document.querySelector("#media-status"),
  time: document.querySelector("#media-time"),
  progress: document.querySelector("#media-progress"),
  bar: document.querySelector("#progress-bar"),
};

elements.artwork.addEventListener("error", () => {
  elements.artwork.hidden = true;
  elements.artwork.removeAttribute("src");
});

async function refresh() {
  try {
    const state = await browser.runtime.sendMessage({ type: "status:get" });
    MirekiPopup.renderState(state?.kind ? state : { kind: "error" }, elements);
  } catch {
    MirekiPopup.renderState({ kind: "error" }, elements);
  }
}

let stopped = false;
async function refreshLoop() {
  await refresh();
  if (!stopped) setTimeout(refreshLoop, 1_000);
}
refreshLoop();
window.addEventListener("pagehide", () => { stopped = true; }, { once: true });

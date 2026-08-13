const elements = {
  message: document.querySelector("#message"),
  optionsButton: document.querySelector("#open-options"),
  details: document.querySelector("#details"),
  artwork: document.querySelector("#media-artwork"),
  title: document.querySelector("#media-title"),
  source: document.querySelector("#media-source"),
  status: document.querySelector("#media-status"),
  time: document.querySelector("#media-time"),
  progress: document.querySelector("#media-progress"),
  sync: document.querySelector("#sync-status"),
  syncLabel: document.querySelector("#sync-label"),
  bar: document.querySelector("#progress-bar"),
  nowPanel: document.querySelector("#now-panel"),
  correctPanel: document.querySelector("#correct-panel"),
  correctionButton: document.querySelector("#open-correction"),
  correctionAction: document.querySelector("#correction-action"),
  closeCorrection: document.querySelector("#close-correction"),
  manualCurrent: document.querySelector("#manual-current"),
  manualCurrentLabel: document.querySelector("#manual-current-label"),
  removeMatch: document.querySelector("#remove-match"),
  matchForm: document.querySelector("#match-form"),
  matchQuery: document.querySelector("#match-query"),
  searchButton: document.querySelector("#search-match"),
  feedback: document.querySelector("#match-feedback"),
  results: document.querySelector("#match-results"),
  episodeForm: document.querySelector("#episode-form"),
  selectedShow: document.querySelector("#selected-show"),
  seasonNumber: document.querySelector("#season-number"),
  episodeNumber: document.querySelector("#episode-number"),
  saveEpisode: document.querySelector("#save-episode"),
  cancelEpisode: document.querySelector("#cancel-episode"),
};

let currentState = { kind: "error" };
let currentMediaSignature = null;
let searchMediaKey = null;
let selectedShow = null;
let correctionOpen = false;
let stopped = false;

function mediaSignature(state) {
  if (state?.kind !== "media") return null;
  return JSON.stringify([
    state.source?.hostname,
    state.source?.pageTitle,
    state.media?.title,
    state.media?.artist,
    state.media?.album,
    state.media?.language,
    state.media?.episodeNumber,
  ]);
}

function correctionLabel(display) {
  if (!display) return "";
  const year = display.year ? ` (${display.year})` : "";
  if (display.type === "episode") {
    return `${display.showTitle} — S${display.season}E${display.episode} · ${display.title}${year}`;
  }
  return `${display.title}${year}`;
}

function setFeedback(message, error = false) {
  elements.feedback.textContent = message;
  elements.feedback.dataset.error = String(error);
}

function clearSelection() {
  selectedShow = null;
  elements.episodeForm.hidden = true;
  elements.selectedShow.textContent = "";
  elements.seasonNumber.value = "";
  elements.episodeNumber.value = "";
}

function clearResults() {
  elements.results.replaceChildren();
  clearSelection();
}

function setBusy(busy) {
  elements.searchButton.disabled = busy;
  elements.matchQuery.disabled = busy || currentState.kind !== "media";
  elements.removeMatch.disabled = busy;
  elements.saveEpisode.disabled = busy;
  elements.cancelEpisode.disabled = busy;
}

function updateCorrectionState(state) {
  const signature = mediaSignature(state);
  if (signature !== currentMediaSignature) {
    currentMediaSignature = signature;
    searchMediaKey = state.manualMatch?.mediaKey || null;
    clearResults();
    setFeedback(signature ? "" : "No current media to correct.");
    if (signature) elements.matchQuery.value = state.media.artist || state.media.title || "";
  } else if (state.manualMatch?.mediaKey) {
    searchMediaKey = state.manualMatch.mediaKey;
  }
  const correction = state.kind === "media" ? state.manualMatch?.display : null;
  elements.manualCurrent.hidden = !correction;
  elements.manualCurrentLabel.textContent = correctionLabel(correction);
  elements.matchQuery.disabled = state.kind !== "media";
  elements.searchButton.disabled = state.kind !== "media";
  if (state.kind !== "media") setFeedback("No current media to correct.");
}

function showCorrection() {
  correctionOpen = true;
  elements.nowPanel.hidden = true;
  elements.correctPanel.hidden = false;
  updateCorrectionState(currentState);
  if (currentState.kind === "media") elements.matchQuery.focus();
  else elements.closeCorrection.focus();
}

function showNowPlaying() {
  correctionOpen = false;
  elements.correctPanel.hidden = true;
  elements.nowPanel.hidden = false;
  elements.correctionButton.focus();
}

function resultButton(result) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  const identity = document.createElement("span");
  const title = document.createElement("span");
  const meta = document.createElement("span");
  const action = document.createElement("span");
  button.type = "button";
  button.className = "result-button";
  identity.className = "result-identity";
  title.className = "result-title";
  meta.className = "result-meta";
  action.className = "result-action";
  title.textContent = result.title;
  meta.textContent = `${result.type === "movie" ? "Movie" : "Series"}${result.year ? ` · ${result.year}` : ""}`;
  action.textContent = result.type === "movie" ? "Use" : "Choose episode";
  identity.append(title, meta);
  button.append(identity, action);
  button.addEventListener("click", () => {
    if (result.type === "movie") {
      saveSelection({ type: "movie", traktId: result.traktId });
      return;
    }
    selectedShow = result;
    elements.selectedShow.textContent = `${result.title}${result.year ? ` (${result.year})` : ""}`;
    elements.episodeNumber.value = Number.isInteger(currentState.media?.episodeNumber)
      ? String(currentState.media.episodeNumber)
      : "";
    elements.episodeForm.hidden = false;
    elements.seasonNumber.focus();
  });
  item.append(button);
  return item;
}

function errorMessage(code) {
  if (code === "notConnected") return "Connect Trakt in settings before choosing a match.";
  if (code === "staleMedia") return "Playback changed. Search again for the current media.";
  if (code === "noMedia") return "No current media to correct.";
  return "Trakt could not complete this request. Try again.";
}

async function saveSelection(selection) {
  if (!searchMediaKey) {
    setFeedback("Search again before choosing a match.", true);
    return;
  }
  setBusy(true);
  setFeedback("Validating this match…");
  try {
    const response = await browser.runtime.sendMessage({
      type: "manual-match:set",
      mediaKey: searchMediaKey,
      selection,
    });
    if (!response?.ok) {
      setFeedback(errorMessage(response?.error), true);
      return;
    }
    currentState.manualMatch = { ...response.correction, mediaKey: searchMediaKey };
    clearResults();
    updateCorrectionState(currentState);
    setFeedback("Manual match saved. Mireki will use it for this media.");
  } catch {
    setFeedback("Trakt could not complete this request. Try again.", true);
  } finally {
    setBusy(false);
  }
}

elements.artwork.addEventListener("error", () => {
  elements.artwork.hidden = true;
  elements.artwork.removeAttribute("src");
});
elements.optionsButton.addEventListener("click", () => {
  browser.runtime.openOptionsPage().catch(() => {});
});
elements.correctionButton.addEventListener("click", showCorrection);
elements.closeCorrection.addEventListener("click", showNowPlaying);
elements.cancelEpisode.addEventListener("click", () => {
  clearSelection();
  elements.matchQuery.focus();
});
elements.matchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearResults();
  setBusy(true);
  setFeedback("Searching Trakt…");
  try {
    const response = await browser.runtime.sendMessage({
      type: "manual-match:search",
      query: elements.matchQuery.value,
    });
    if (!response?.ok) {
      searchMediaKey = null;
      setFeedback(errorMessage(response?.error), true);
      return;
    }
    searchMediaKey = response.mediaKey;
    const results = Array.isArray(response.results) ? response.results : [];
    elements.results.replaceChildren(...results.map(resultButton));
    setFeedback(results.length ? `${results.length} result${results.length === 1 ? "" : "s"}.` : "No Trakt results found.");
  } catch {
    searchMediaKey = null;
    setFeedback("Trakt could not complete this request. Try again.", true);
  } finally {
    setBusy(false);
  }
});
elements.episodeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!selectedShow) return;
  saveSelection({
    type: "episode",
    showId: selectedShow.traktId,
    season: Number(elements.seasonNumber.value),
    episode: Number(elements.episodeNumber.value),
  });
});
elements.removeMatch.addEventListener("click", async () => {
  const mediaKey = currentState.manualMatch?.mediaKey || searchMediaKey;
  if (!mediaKey) return;
  setBusy(true);
  setFeedback("Removing manual match…");
  try {
    const response = await browser.runtime.sendMessage({ type: "manual-match:remove", mediaKey });
    if (!response?.ok) {
      setFeedback(errorMessage(response?.error), true);
      return;
    }
    currentState.manualMatch = null;
    searchMediaKey = null;
    updateCorrectionState(currentState);
    setFeedback("Manual match removed. Automatic matching is active again.");
  } catch {
    setFeedback("The manual match could not be removed. Try again.", true);
  } finally {
    setBusy(false);
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && correctionOpen) showNowPlaying();
});

async function refresh() {
  try {
    const state = await browser.runtime.sendMessage({ type: "status:get" });
    currentState = state?.kind ? state : { kind: "error" };
  } catch {
    currentState = { kind: "error" };
  }
  MirekiPopup.renderState(currentState, elements);
  updateCorrectionState(currentState);
}

async function refreshLoop() {
  await refresh();
  if (!stopped) setTimeout(refreshLoop, 1_000);
}
refreshLoop();
window.addEventListener("pagehide", () => { stopped = true; }, { once: true });

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}
const stateLabels = { playing: "Playing", paused: "Paused", ended: "Ended" };
const syncLabels = {
  idle: "Idle", notConnected: "Not connected", matching: "Matching", unmatched: "Unmatched",
  ambiguous: "Ambiguous", needsEpisode: "Episode unknown", unsupported: "Unsupported",
  syncing: "Syncing", scrobbling: "Scrobbling", paused: "Paused", synced: "Synced", error: "Sync error",
};
const sameText = (left, right) => left?.trim().toLocaleLowerCase() === right?.trim().toLocaleLowerCase();
function sourceLabel(media, source, displayedTitle = media.title) {
  if (media.artist && !sameText(media.artist, displayedTitle)) return media.artist;
  return source?.hostname && !sameText(source.hostname, displayedTitle) ? source.hostname : "";
}
function setArtwork(element, artwork) {
  if (!element) return;
  if (!artwork) { element.hidden = true; element.removeAttribute?.("src"); return; }
  if (element.getAttribute?.("src") !== artwork) element.setAttribute?.("src", artwork);
  element.hidden = false;
}
function renderState(state, elements) {
  elements.details.hidden = state.kind !== "media";
  elements.message.hidden = state.kind === "media";
  if (state.kind !== "media") {
    setArtwork(elements.artwork, null);
    elements.message.textContent = state.kind === "empty" ? "No media detected in open web tabs." : "Playback status unavailable.";
    return;
  }
  const media = state.media;
  const displayedTitle = media.title || (media.kind === "audio" ? "Untitled audio" : "Untitled video");
  elements.title.textContent = displayedTitle;
  elements.source.textContent = sourceLabel(media, state.source, displayedTitle);
  elements.status.textContent = stateLabels[media.state] || "Unknown state";
  if (elements.sync) elements.sync.textContent = syncLabels[state.sync?.state] || syncLabels.idle;
  elements.time.textContent = `${formatTime(media.currentTime)} / ${formatTime(media.duration)}`;
  elements.progress.textContent = media.progress === null ? "Unknown progress" : `${media.progress.toFixed(1)} %`;
  elements.bar.hidden = media.progress === null;
  if (media.progress !== null) elements.bar.value = media.progress;
  setArtwork(elements.artwork, media.artwork);
}
const popupApi = { formatTime, renderState, setArtwork, sourceLabel };
if (typeof module === "object" && module.exports) module.exports = popupApi;
else globalThis.MirekiPopup = popupApi;

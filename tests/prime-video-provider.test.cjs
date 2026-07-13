const assert = require("node:assert/strict");
const { extractMetadata, isMetadataMutation } = require("../providers/prime-video.js");

const metadataNode = (value, className) => ({
  nodeType: 1,
  textContent: value,
  parentElement: null,
  matches: (selector) => selector.split(",").some((part) => part.trim() === `.${className}`),
  closest(selector) { return this.matches(selector) ? this : null; },
  querySelector: () => null,
});

const ARTWORK_SELECTOR = 'main [data-automation-id="hero-background"] img';

function artwork(url, alt) {
  return {
    nodeType: 1,
    currentSrc: url,
    getAttribute: (name) => name === "alt" ? alt : name === "src" ? url : null,
    matches: (selector) => selector.split(",").some((part) => part.trim() === ARTWORK_SELECTOR),
    closest(selector) { return this.matches(selector) ? this : null; },
    querySelector: () => null,
  };
}

function player(show, subtitle, subtitleClass = "atvwebplayersdk-subtitle-text") {
  const title = metadataNode(show, "atvwebplayersdk-title-text");
  const episode = metadataNode(subtitle, subtitleClass);
  return {
    title,
    episode,
    querySelector(selector) {
      if (selector === ".atvwebplayersdk-title-text") return title;
      if (selector.includes(".atvwebplayersdk-subtitle-text")) return episode;
      return null;
    },
  };
}

const video = (scope) => ({
  closest: (selector) => selector === '[id^="dv-web-player"]' ? scope : null,
});
const page = (url = "https://www.primevideo.com/detail/example", images = []) => ({
  URL: url,
  querySelectorAll: (selector) => {
    if (selector === ARTWORK_SELECTOR) return images;
    throw new Error("adapter must use bounded semantic artwork selector");
  },
});
const extract = (scope, url, images = [], metadata = {}) => extractMetadata({
  document: page(url, images), mediaElement: video(scope), metadata,
});

assert.deepEqual(extract(player("Spider-Noir", "Saison 1, ép. 1 Passez dans mon bureau")), {
  title: "S1E1 - Passez dans mon bureau",
  artist: "Spider-Noir",
});
const theBoysArtwork = artwork(
  "https://m.media-amazon.com/images/S/pv-target-images/current._SX1920_FMavif_PQ65_.jpg",
  "The Boys",
);
assert.deepEqual(extract(player("The Boys", "Saison 1, ép. 1 Le nom de la règle"), undefined, [theBoysArtwork]), {
  title: "S1E1 - Le nom de la règle",
  artist: "The Boys",
  artwork: "https://m.media-amazon.com/images/S/pv-target-images/current._SX1920_FMavif_PQ65_.jpg",
}, "title-confirmed Prime detail hero supplies artwork");
assert.equal("artwork" in extract(
  player("Fallout", "Saison 1, ép. 1 La Fin"), undefined, [theBoysArtwork],
), false, "hero from another detail page is rejected");
assert.equal("artwork" in extract(
  player("The Boys", "Saison 1, ép. 1 Le nom de la règle"), undefined, [theBoysArtwork],
  { artwork: "https://standard.test/session.jpg" },
), false, "standard Media Session artwork keeps priority");
assert.deepEqual(extract(player("Series", "Season 2, Ep. 4 The Ghouls")), {
  title: "S2E4 - The Ghouls",
  artist: "Series",
});
assert.deepEqual(extract(player("Series", "S3 E12 Finale", "atvwebplayersdk-episode-info")), {
  title: "S3E12 - Finale",
  artist: "Series",
});

const stale = player("Wrong show", "Season 9, Ep. 9 Wrong episode");
const active = player("Spider-Noir", "Saison 1, épisode 2 Sois prudent, tu vivras longtemps");
assert.deepEqual(extractMetadata({
  document: { ...page(), querySelector: () => stale },
  mediaElement: video(active),
}), { title: "S1E2 - Sois prudent, tu vivras longtemps", artist: "Spider-Noir" },
"selected video's player scope prevents stale sibling metadata from winning");

assert.equal(extract(player("Spider-Noir", "Reprendre S. 1 Ép. 1")), null,
  "detail-page resume label is not accepted as current episode metadata");
assert.equal(extract(player("Spider-Noir", "1. Passez dans mon bureau")), null,
  "episode-list title alone is not current playback evidence");
assert.equal(extract(player("Spider-Noir", "Live now")), null);
assert.equal(extract(player("", "Saison 1, ép. 1 Episode")), null);
assert.equal(extract(player("Series", "Saison 1000, ép. 1 Episode")), null);
assert.equal(extract(player("Series", "Saison 1, ép. 10000 Episode")), null);
assert.equal(extract(player("Series", "Saison 1, ép. 1 Episode"), "https://primevideo.com.evil.example/watch"), null);
assert.ok(extract(player("x".repeat(400), `Saison 1, ép. 1 ${"y".repeat(400)}`)).title.length <= 300,
  "untrusted player text stays bounded");
assert.equal(extract(player("x".repeat(400), "Saison 1, ép. 1 Episode")).artist.length, 300);

const mutationPlayer = player("Series", "Saison 1, ép. 1 Episode");
assert.equal(isMetadataMutation({ target: {}, addedNodes: [mutationPlayer.title], removedNodes: [] }), true);
assert.equal(isMetadataMutation({ target: {}, addedNodes: [theBoysArtwork], removedNodes: [] }), true,
  "Prime hero insertion emits updated artwork");
assert.equal(isMetadataMutation({
  target: { matches: () => false, closest: () => null, querySelector: () => mutationPlayer.title },
  addedNodes: [{ nodeType: 1, matches: () => false, closest: () => null, querySelector: () => null }],
  removedNodes: [],
}), false, "unrelated child mutation does not rescan target subtree");
assert.equal(isMetadataMutation({ target: {}, addedNodes: [{
  nodeType: 1, matches: () => false, closest: () => null, querySelector: () => null,
}], removedNodes: [] }), false);
console.log("Prime Video provider checks: OK");

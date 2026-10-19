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

assert.deepEqual(extract(player("Nocturne", "Saison 1, ép. 1 Entrez dans mon bureau")), {
  title: "S1E1 - Entrez dans mon bureau",
  artist: "Nocturne",
});
const vanguardArtwork = artwork(
  "https://m.media-amazon.com/images/S/pv-target-images/current._SX1920_FMavif_PQ65_.jpg",
  "The Vanguard",
);
assert.deepEqual(extract(player("The Vanguard", "Saison 1, ép. 1 Le poids des règles"), undefined, [vanguardArtwork]), {
  title: "S1E1 - Le poids des règles",
  artist: "The Vanguard",
  artwork: "https://m.media-amazon.com/images/S/pv-target-images/current._SX1920_FMavif_PQ65_.jpg",
}, "title-confirmed Prime detail hero supplies artwork");
assert.equal("artwork" in extract(
  player("Ashfall", "Saison 1, ép. 1 Le Signal"), undefined, [vanguardArtwork],
), false, "hero from another detail page is rejected");
assert.equal("artwork" in extract(
  player("The Vanguard", "Saison 1, ép. 1 Le poids des règles"), undefined, [vanguardArtwork],
  { artwork: "https://standard.test/session.jpg" },
), false, "standard Media Session artwork keeps priority");
assert.deepEqual(extract(player("Series", "Season 2, Ep. 4 The Ember Walkers")), {
  title: "S2E4 - The Ember Walkers",
  artist: "Series",
});
assert.deepEqual(extract(player("Series", "S3 E12 Finale", "atvwebplayersdk-episode-info")), {
  title: "S3E12 - Finale",
  artist: "Series",
});

for (const subtitle of ["E3 - Titre", "Episode 3: Titre", "Saison 2, Partie 2, ép. 3 Titre",
  "Season 2: Part 2, E3 - Titre"]) {
  assert.deepEqual(extract(player("Series", subtitle)), { title: "Titre", artist: "Series", episodeNumber: 3 },
    "E-only or qualified prefix preserves only the explicit number hint and real title");
}
for (const subtitle of ["E3", "Episode 3", "Season 2: Part 2, E3", "Reprendre E3 - Titre",
  "Series E3 - Titre", "Part 2, E3 - Titre", "Season 2 Episode 3 / Episode 4 Titre",
  "Season 2: Part 2, E3 / E4 Titre", "Season 2: Part 2, S1E3 / S2E3 Titre"]) {
  assert.equal(extract(player("Series", subtitle)), null, "bare, free-text, resume and conflicting labels stay rejected");
}
assert.equal(extract(player("", "E3 - Titre")), null, "E-only metadata still requires an artist in selected player");
assert.deepEqual(extractMetadata({
  document: { ...page(), querySelector: () => player("Wrong show", "E3 - Wrong title") },
  mediaElement: video(player("Series", "Season 2: Part 2, E3 - Titre")),
}), { title: "Titre", artist: "Series", episodeNumber: 3 }, "qualified E-only parsing stays in selected player");
assert.deepEqual(extract(player("Series", "Season 2: Part 2, E3 - Titre Part 2")), {
  title: "Titre Part 2", artist: "Series", episodeNumber: 3,
}, "title words are not stripped as season decorations");

const stale = player("Wrong show", "Season 9, Ep. 9 Wrong episode");
const active = player("Nocturne", "Saison 1, épisode 2 Reste discret, tu verras demain");
assert.deepEqual(extractMetadata({
  document: { ...page(), querySelector: () => stale },
  mediaElement: video(active),
}), { title: "S1E2 - Reste discret, tu verras demain", artist: "Nocturne" },
"selected video's player scope prevents stale sibling metadata from winning");

assert.equal(extract(player("Nocturne", "Reprendre S. 1 Ép. 1")), null,
  "detail-page resume label is not accepted as current episode metadata");
assert.equal(extract(player("Nocturne", "1. Entrez dans mon bureau")), null,
  "episode-list title alone is not current playback evidence");
assert.equal(extract(player("Series", "S1E3 / S2E3 Conflicting metadata")), null,
  "conflicting player coordinates are rejected");
assert.equal(extract(player("Series", "Season 1 Episode 2nd Place")), null,
  "ordinal text is not accepted as explicit player coordinates");
assert.equal(extract(player("Nocturne", "Live now")), null);
assert.equal(extract(player("", "Saison 1, ép. 1 Episode")), null);
assert.equal(extract(player("Series", "Saison 1000, ép. 1 Episode")), null);
assert.equal(extract(player("Series", "Saison 1, ép. 10000 Episode")), null);
assert.equal(extract(player("Series", "Saison 1, ép. 1 Episode"), "https://primevideo.com.evil.example/watch"), null);
assert.ok(extract(player("x".repeat(400), `Saison 1, ép. 1 ${"y".repeat(400)}`)).title.length <= 300,
  "untrusted player text stays bounded");
assert.equal(extract(player("x".repeat(400), "Saison 1, ép. 1 Episode")).artist.length, 300);

const mutationPlayer = player("Series", "Saison 1, ép. 1 Episode");
assert.equal(isMetadataMutation({ target: {}, addedNodes: [mutationPlayer.title], removedNodes: [] }), true);
assert.equal(isMetadataMutation({ target: {}, addedNodes: [vanguardArtwork], removedNodes: [] }), true,
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

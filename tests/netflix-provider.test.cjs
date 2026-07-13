const assert = require("node:assert/strict");
const { extractMetadata, isMetadataMutation } = require("../providers/netflix.js");

function node(value, tagName = "SPAN", children = []) {
  return { textContent: value, tagName, children };
}
function titleElement(parts) {
  const nodes = parts.map(([value, tagName]) => node(value, tagName));
  return {
    textContent: nodes.map((item) => item.textContent).join(" "),
    getAttribute: (name) => name === "data-uia" ? "video-title" : null,
    querySelector: (selector) => selector.startsWith("h1") ? nodes.find((item) => /^H[1-6]$/.test(item.tagName)) || null : null,
    querySelectorAll: () => nodes,
  };
}
function page(url, title, language = null) {
  return {
    URL: url,
    documentElement: { lang: language },
    querySelector: () => title,
    querySelectorAll: () => title ? [title] : [],
  };
}

function siblingTitleElement(show, coordinate, episode) {
  const title = {
    textContent: show,
    children: [],
    getAttribute: (name) => name === "data-uia" ? "video-title" : null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const nodes = [title, node(coordinate), node(episode)];
  const parent = {
    textContent: nodes.map((item) => item.textContent).join(" "),
    children: nodes,
    parentElement: null,
    querySelector: (selector) => selector.startsWith("h1") ? title : null,
    querySelectorAll: (selector) => selector === "[data-uia]" ? [title] : nodes,
  };
  for (const item of nodes) item.parentElement = parent;
  return { title, parent };
}

const netflixEpisode = siblingTitleElement("Avatar : Le dernier maître de l’air", "E1", "Un endroit sûr");
const netflixEpisodeMetadata = extractMetadata({
  document: page("https://www.netflix.com/watch/81023598", netflixEpisode.title, "fr-FR"),
  metadata: { title: "Netflix", artist: null },
});
assert.deepEqual(netflixEpisodeMetadata, {
  title: "Un endroit sûr",
  artist: "Avatar : Le dernier maître de l’air",
  episodeNumber: 1,
}, "E-only Netflix label separates series and episode for display");
assert.equal([netflixEpisodeMetadata.title, netflixEpisodeMetadata.artist].join(" ").includes("E1"), false,
  "E-only label is not exposed as an absolute or season coordinate");
assert.equal(netflixEpisodeMetadata.episodeNumber, 1,
  "E-only label is retained separately as an within-season number hint");

const siblingEpisode = siblingTitleElement("Golden Kamuy", "S5:E3", "Le favori de Toshizo");
assert.deepEqual(extractMetadata({
  document: page("https://www.netflix.com/watch/81743400", siblingEpisode.title),
  metadata: { title: "Netflix", artist: null },
}), { title: "S5E3 - Le favori de Toshizo", artist: "Golden Kamuy" }, "episode metadata may be siblings of the data-uia title heading");
assert.equal(isMetadataMutation({
  target: siblingEpisode.parent,
  addedNodes: [siblingEpisode.parent.children[2]],
  removedNodes: [],
}), true, "sibling episode changes trigger an observation");

const episode = titleElement([["Golden Kamuy", "H4"], ["S5:E3", "SPAN"], ["Le favori de Toshizo", "SPAN"]]);
assert.deepEqual(extractMetadata({
  document: page("https://www.netflix.com/watch/81743401", episode),
  metadata: { title: "Netflix", artist: "Netflix" },
}), { title: "S5E3 - Le favori de Toshizo", artist: "Golden Kamuy" });

assert.deepEqual(extractMetadata({
  document: page("https://www.netflix.com/watch/81743401", null),
  metadata: { title: "Netflix", artist: null },
}), { title: "S5E3 - Le favori de Toshizo", artist: "Golden Kamuy" }, "hidden controls reuse volatile metadata for same watch ID");

assert.equal(extractMetadata({
  document: page("https://www.netflix.com/watch/81743402", null),
  metadata: { title: "Netflix", artist: null },
}), null, "SPA watch ID change clears cached episode");

const movie = titleElement([["Nimona", "H4"]]);
assert.deepEqual(extractMetadata({
  document: page("https://www.netflix.com/watch/81444554", movie),
  metadata: { title: "Netflix", artist: null },
}), { title: "Nimona" });
assert.equal(extractMetadata({
  document: page("https://www.netflix.com/watch/81444554", movie),
  metadata: { title: "Useful standard title", artist: null },
}), null, "useful standard movie title keeps priority");

const splitCoordinate = titleElement([["Arcane", "H4"], ["S2", "SPAN"], ["E4", "SPAN"], ["Paint the Town Blue", "SPAN"]]);
assert.deepEqual(extractMetadata({
  document: page("https://www.netflix.com/watch/81719603", splitCoordinate),
  metadata: { title: "Paint the Town Blue", artist: null },
}), { title: "S2E4 - Paint the Town Blue", artist: "Arcane" }, "explicit coordinates enrich useful Media Session title");

const conflictingCoordinates = titleElement([
  ["Show", "H4"], ["S1E3", "SPAN"], ["S2E3", "SPAN"], ["Current title", "SPAN"],
]);
assert.equal(extractMetadata({
  document: page("https://www.netflix.com/watch/81719604", conflictingCoordinates),
  metadata: { title: "Netflix", artist: null },
}), null, "conflicting coordinate siblings are rejected across title scope");

const conflictingEpisode = titleElement([
  ["Show", "H4"], ["S1E3", "SPAN"], ["E4", "SPAN"], ["Current title", "SPAN"],
]);
assert.equal(extractMetadata({
  document: page("https://www.netflix.com/watch/81719605", conflictingEpisode),
  metadata: { title: "Netflix", artist: null },
}), null, "coordinate and conflicting E-only sibling are rejected");

const cachedBeforeConflict = titleElement([
  ["Show", "H4"], ["S1E3", "SPAN"], ["Current title", "SPAN"],
]);
assert.deepEqual(extractMetadata({
  document: page("https://www.netflix.com/watch/81719606", cachedBeforeConflict),
  metadata: { title: "Netflix", artist: null },
}), { title: "S1E3 - Current title", artist: "Show" });
assert.equal(extractMetadata({
  document: page("https://www.netflix.com/watch/81719606", conflictingCoordinates),
  metadata: { title: "Netflix", artist: null },
}), null, "conflict invalidates cached coordinates for same watch ID");
assert.equal(extractMetadata({
  document: page("https://www.netflix.com/watch/81719606", null),
  metadata: { title: "Netflix", artist: null },
}), null, "invalidated coordinates are not reused after controls hide");

const ambiguous = titleElement([["Show", "H4"], ["Episode title", "SPAN"]]);
assert.deepEqual(extractMetadata({
  document: page("https://www.netflix.com/watch/900", ambiguous),
  metadata: { title: "Netflix", artist: null },
}), { title: "Show" }, "adapter does not invent episode coordinates");
assert.equal(extractMetadata({
  document: page("https://netflix.com.evil.example/watch/900", episode),
  metadata: { title: "Netflix", artist: null },
}), null, "lookalike domain is rejected");

const longTitle = titleElement([["x".repeat(400), "H4"]]);
assert.equal(extractMetadata({
  document: page("https://www.netflix.com/watch/901", longTitle),
  metadata: { title: "Netflix", artist: null },
}).title.length, 300, "untrusted DOM text stays bounded");

const mutationRoot = titleElement([["Series", "H4"]]);
assert.equal(isMetadataMutation({ target: {}, addedNodes: [mutationRoot], removedNodes: [] }), true);
assert.equal(isMetadataMutation({ target: {}, addedNodes: [{ querySelectorAll: () => [] }], removedNodes: [] }), false);
console.log("Netflix provider checks: OK");

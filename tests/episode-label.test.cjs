const assert = require("node:assert/strict");
const {
  findCoordinates, findEpisodeNumber, parseEpisode, parseAbsoluteEpisode, stripEpisodePrefix, isSeasonOrPartLabel,
} = require("../shared/episode-label.js");

assert.deepEqual(parseEpisode(["S02E07 — Title"]), { season: 2, episode: 7 });
assert.deepEqual(parseEpisode(["Saison 3", "E3 - Un foyer paisible retrouvé"]), { season: 3, episode: 3 });
assert.deepEqual(parseEpisode(["Folge 8 Staffel 2"]), { season: 2, episode: 8 });
assert.equal(parseEpisode(["S2E3", "Season 4 Episode 3"]), null, "conflicting coordinates stay ambiguous");
assert.equal(findCoordinates("S1E3 / S2E3"), null, "provider parser rejects conflicting seasons");
assert.equal(findEpisodeNumber("S1E3 / S2E3"), null, "coordinate conflicts never degrade to E-only hints");
assert.equal(findCoordinates("S1E2foo"), null, "letters cannot continue episode numbers");
assert.equal(findEpisodeNumber("Episode 2nd"), null, "ordinal suffix is not an episode label boundary");
assert.equal(findCoordinates("Season 1 trailer Episode 2"), null,
  "coordinate labels cannot span arbitrary words");
assert.equal(findCoordinates("Cafe\u0301S1E2 Title"), null, "combining mark cannot start a label boundary");
assert.deepEqual(parseEpisode(["S1E2 - Title"]), { season: 1, episode: 2 });
assert.equal(parseEpisode(["E3 - Title"]), null, "episode-only label never implies season");
assert.equal(parseAbsoluteEpisode(["E52 - Title"]), 52);
assert.equal(parseAbsoluteEpisode(["E3 - Title", "Saison 2", "Season 3"]), null,
  "season evidence blocks absolute interpretation even when conflicting");
assert.deepEqual(findCoordinates("Saison 1, ép. 2 Sois discret"), {
  season: 1, episode: 2, index: 0, length: 15,
});
assert.deepEqual(findEpisodeNumber("Series E12 Finale"), { episode: 12, index: 7, length: 3 });
assert.equal(stripEpisodePrefix("Season 2, Episode 4: Finale"), "Finale");
assert.equal(stripEpisodePrefix("E52 - Une promesse"), "Une promesse");

for (const label of ["Season 2: Part 2", "Saison 2, Partie 2", "Temporada 2 - Parte 2", "Staffel 2 Teil 2"]) {
  assert.equal(parseEpisode([label, "E3 - Titre"]), null, "qualified season never supplies ordinary coordinates");
  assert.equal(parseAbsoluteEpisode([label, "E3 - Titre"]), 3, "qualified season preserves explicit E-only hint");
  assert.deepEqual(parseEpisode([label, "S4E3 - Titre"]), { season: 4, episode: 3 },
    "decorative qualified season does not contradict ordinary coordinates");
  assert.equal(stripEpisodePrefix(`${label}, Episode 3 - Titre`), "Titre");
  assert.equal(stripEpisodePrefix(`${label}, Episode 3`), null, "bare compound label is not a title");
  assert.equal(isSeasonOrPartLabel(label), true);
}
assert.deepEqual(findEpisodeNumber("Season 2: Part 2, E3 - Titre"), { episode: 3, index: 18, length: 2 },
  "masking preserves offsets into the original text");
assert.deepEqual(findCoordinates("Season 2: Part 2 | S4E3 - Titre"), {
  season: 4, episode: 3, index: 19, length: 4,
});
assert.equal(parseEpisode(["Season 2: Part 2", "Season 3", "Season 4", "E3"]), null);
assert.equal(parseAbsoluteEpisode(["Season 2: Part 2", "Season 3", "Season 4", "E3"]), null,
  "ordinary season conflicts cannot degrade into an E-only hint");
assert.equal(parseAbsoluteEpisode(["Season 2: Part 2", "E3", "E4"]), null);
assert.deepEqual(parseEpisode(["Season 2 Episode 3 - Part 2"]), { season: 2, episode: 3 },
  "part after episode does not qualify an earlier season");
assert.deepEqual(parseEpisode(["Season 2", "Episode 3 - Title Part 2"]), { season: 2, episode: 3 });
assert.deepEqual(parseEpisode(["Season 2: Part 0", "E3"]), { season: 2, episode: 3 },
  "part must have a positive bounded number");
assert.equal(stripEpisodePrefix("Show Season 2: Part 2, E3 - Titre"), "Show Season 2: Part 2, E3 - Titre",
  "free text before a label is never stripped");
assert.equal(stripEpisodePrefix("Part 2, E3 - Titre"), "Part 2, E3 - Titre",
  "part alone is not a qualified-season prefix");
assert.equal(stripEpisodePrefix("Season 2: Part 2, E3 - Titre Part 2"), "Titre Part 2",
  "part words after episode remain in the title");
for (const label of ["Season 2", "Saison 0", "Part 2", "Partie 2", "Parte 3", "Teil 9999"]) {
  assert.equal(isSeasonOrPartLabel(label), true, label);
}
for (const value of [null, "", "Season 1000", "Part 0", "Part 10000", "Season 2 Part 2 Title",
  "Season 2 Episode 3 Part 2", "Season 2 trailer Part 2", "Cafe\u0301Season 2", "Part 2nd"]) {
  assert.equal(isSeasonOrPartLabel(value), false, String(value));
}
for (const value of ["S1E3", "E3", "Episode 3"]) assert.equal(stripEpisodePrefix(value), null);

console.log("Episode label checks: OK");

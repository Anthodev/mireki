const assert = require("node:assert/strict");
const {
  findCoordinates, findEpisodeNumber, parseEpisode, parseAbsoluteEpisode, stripEpisodePrefix,
} = require("../shared/episode-label.js");

assert.deepEqual(parseEpisode(["S02E07 — Title"]), { season: 2, episode: 7 });
assert.deepEqual(parseEpisode(["Saison 3", "E3 - Paisible quotidien retrouvé"]), { season: 3, episode: 3 });
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
assert.deepEqual(findCoordinates("Saison 1, ép. 2 Sois prudent"), {
  season: 1, episode: 2, index: 0, length: 15,
});
assert.deepEqual(findEpisodeNumber("Series E12 Finale"), { episode: 12, index: 7, length: 3 });
assert.equal(stripEpisodePrefix("Season 2, Episode 4: Finale"), "Finale");
assert.equal(stripEpisodePrefix("E52 - Une promesse"), "Une promesse");

console.log("Episode label checks: OK");

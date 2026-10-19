const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { extractReleaseNotes, releaseBodiesEqual } = require("../tools/release-notes.cjs");

const CLI = path.resolve(__dirname, "../tools/release-notes.cjs");
const NOTES = "Intro with [reference](https://example.org).\n\n### Features\n\n- Keep `code` and  two spaces.\n";
const CHANGELOG = `# Changelog\n\n## [Unreleased]\n\n## [1.20.0]\n\nNot this version.\n\n## [1.2.0] - 2026-10-19\n\n${NOTES}\n## [1.2.0-rc.01]\n\nRC notes.\n\n## [1.1.0]\n\nOlder notes.\n`;

test("extracts the complete exact version and preserves curated content", () => {
  assert.equal(extractReleaseNotes(CHANGELOG, "1.2.0"), NOTES);
  assert.equal(extractReleaseNotes(CHANGELOG, "1.20.0"), "Not this version.\n");
  assert.equal(extractReleaseNotes(CHANGELOG, "1.2.0-rc.01"), "RC notes.\n");
  assert.equal(extractReleaseNotes("## [1.2.0]\nBody\n## [1.1.0]\nOther", "1.2.0"), "Body\n");
});

test("rejects missing, empty, adjacent duplicate and separated duplicate sections", () => {
  for (const text of [
    "## [Unreleased]\nFuture notes\n## [1.20.0]\nOther",
    "## [1.2.0]\n\n \t\n## [1.1.0]\nOther",
    "## [1.2.0]\nBody\n## [1.2.0]\nDuplicate",
    "## [1.2.0]\nBody\n## [1.1.0]\nOther\n## [1.2.0] - 2026-10-19\nDuplicate",
  ]) assert.throws(() => extractReleaseNotes(text, "1.2.0"));
});

test("normalizes line endings and trims only blank edge lines", () => {
  const body = "  Intro  \n\n    indented code\n  final line  \n";
  const text = `## [1.2.0]\n \t\n${body}\n \t\n## [1.1.0]\nOther`;
  assert.equal(extractReleaseNotes(text.replace(/\n/g, "\r\n"), "1.2.0"), body);
  assert.equal(extractReleaseNotes(text.replace(/\n/g, "\r"), "1.2.0"), body);
});

test("ignores headings inside backtick and tilde fences while preserving code blocks", () => {
  const body = [
    "Before.", "", "````markdown", "## [1.2.0]", "## Next release", "```", "still code", "````",
    "", "   ~~~ example", "## [1.2.0]", "## Another release", "   ~~~~", "", "After.",
  ].join("\n");
  const text = `~~~\n## [1.2.0]\n~~~\n## [1.2.0]\n\n${body}\n\n## [1.1.0]\nOther`;
  assert.equal(extractReleaseNotes(text, "1.2.0"), `${body}\n`);
});

test("only matching fences close a block and unclosed fences preserve the remaining body", () => {
  const body = "```js\n~~~\n``` not a closing fence\n## [1.2.0]\n## [1.1.0]\n";
  assert.equal(extractReleaseNotes(`## [1.2.0]\n${body}`, "1.2.0"), body);
  // A backtick in a backtick opener's info string makes it ordinary text.
  assert.throws(() => extractReleaseNotes("``` bad`info\n## [1.2.0]\nBody\n## [1.2.0]\nDuplicate", "1.2.0"));
});

test("body comparison tolerates only line endings and trailing transport newlines", () => {
  assert.equal(releaseBodiesEqual(NOTES, NOTES.replace(/\n/g, "\r\n") + "\r\n"), true);
  assert.equal(releaseBodiesEqual(NOTES, NOTES.replace(/\n+$/, "")), true);
  for (const changed of ["", "\n" + NOTES, NOTES.replace("  two", " two"), NOTES + " ", "Different\n"]) {
    assert.equal(releaseBodiesEqual(NOTES, changed), false);
  }
});

function fixture(t, changelog = CHANGELOG) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mireki-release-notes-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Release fixture");
  git("config", "user.email", "release@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  fs.writeFileSync(path.join(cwd, "fixture.txt"), "fixture\n");
  if (changelog !== null) fs.writeFileSync(path.join(cwd, "CHANGELOG.md"), changelog);
  git("add", ".");
  git("commit", "--quiet", "-m", "Release fixture");
  const commit = git("rev-parse", "HEAD");
  const run = (tag, revision = commit, extra = []) => spawnSync(process.execPath,
    [CLI, "--tag", tag, "--commit", revision, "--output", "notes.md", ...extra],
    { cwd, encoding: "utf8" });
  return { cwd, git, commit, run, output: path.join(cwd, "notes.md") };
}

for (const annotated of [false, true]) {
  test(`CLI reads the ${annotated ? "annotated" : "lightweight"} tag, not working-tree content`, (t) => {
    const f = fixture(t);
    f.git("tag", ...(annotated ? ["-a", "-m", "Release"] : []), "v1.2.0");
    fs.writeFileSync(path.join(f.cwd, "CHANGELOG.md"), "## [1.2.0]\nWrong worktree notes\n");
    const result = f.run("v1.2.0", "HEAD");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(f.output, "utf8"), NOTES);
  });
}

test("CLI preserves the existing stable and alpha/beta/rc tag number grammar", (t) => {
  const versions = ["01.02.003", "1.2.0-alpha.0", "1.2.0-beta.01", "1.2.0-rc.0", "1.2.0-rc.01"];
  const f = fixture(t, versions.map((v) => `## [${v}]\nNotes for ${v}\n`).join("\n"));
  for (const version of versions) {
    f.git("tag", `v${version}`);
    const result = f.run(`v${version}`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(f.output, "utf8"), `Notes for ${version}\n`);
  }
});

test("CLI refuses invalid or missing tags and unsafe revisions without creating output", (t) => {
  const f = fixture(t);
  f.git("tag", "v1.2.0");
  for (const tag of ["v9.9.9", "1.2.0", "v1.2.0\n", "v1.2.0-rc", "v1.2.0-preview.1", "v1.2.0+build", "--help"]) {
    const result = f.run(tag);
    assert.notEqual(result.status, 0, tag);
    assert.equal(fs.existsSync(f.output), false);
  }
  for (const revision of ["missing-revision", "--help"]) {
    assert.notEqual(f.run("v1.2.0", revision).status, 0);
    assert.equal(fs.existsSync(f.output), false);
  }
});

test("CLI rejects a different commit without creating output", (t) => {
  const f = fixture(t);
  f.git("tag", "v1.2.0");
  f.git("commit", "--quiet", "--allow-empty", "-m", "Different commit");
  const result = f.run("v1.2.0", "HEAD");
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(f.output), false);
});

for (const [name, changelog] of [
  ["missing file", null], ["missing section", "## [Unreleased]\nFuture"],
  ["empty section", "## [1.2.0]\n \n"],
  ["duplicate section", "## [1.2.0]\nOne\n## [1.1.0]\nOlder\n## [1.2.0]\nTwo"],
]) {
  test(`CLI rejects ${name} without creating output`, (t) => {
    const f = fixture(t, changelog);
    f.git("tag", "v1.2.0");
    const result = f.run("v1.2.0");
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(f.output), false);
  });
}

test("CLI verifies the stored release body before writing output", (t) => {
  const f = fixture(t);
  f.git("tag", "v1.2.0");
  const body = path.join(f.cwd, "body.md");
  for (const changed of ["", "Altered body\n", NOTES.replace("  two", " two")]) {
    fs.writeFileSync(body, changed);
    assert.notEqual(f.run("v1.2.0", f.commit, ["--verify-body", body]).status, 0);
    assert.equal(fs.existsSync(f.output), false);
  }
  assert.notEqual(f.run("v1.2.0", f.commit, ["--verify-body", "missing.md"]).status, 0);
  assert.equal(fs.existsSync(f.output), false);
  fs.writeFileSync(body, NOTES.replace(/\n/g, "\r\n") + "\r\n");
  const result = f.run("v1.2.0", f.commit, ["--verify-body", body]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(f.output, "utf8"), NOTES);
  fs.writeFileSync(body, "Changed\n");
  assert.notEqual(f.run("v1.2.0", f.commit, ["--verify-body", body]).status, 0);
  assert.equal(fs.readFileSync(f.output, "utf8"), NOTES, "failure leaves existing output untouched");
});

const { execFileSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const { parseArgs } = require("node:util");

// Keep the release workflows' stable, alpha, beta and rc number grammar.
const TAG_PATTERN = /^v[0-9]+\.[0-9]+\.[0-9]+(?:-(?:alpha|beta|rc)\.[0-9]+)?$/;

function normalizeLineEndings(text) {
  return text.replace(/\r\n?/g, "\n");
}

function extractReleaseNotes(text, version) {
  const lines = normalizeLineEndings(text).split("\n");
  const heading = `## [${version}]`;
  const sections = [];
  let fence = null;
  let start = null;
  let end = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = null;
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (opening && (opening[1][0] === "~" || !opening[2].includes("`"))) {
      fence = opening[1];
      continue;
    }
    if (line.startsWith("## ")) {
      if (start !== null && end === lines.length) end = index;
      if (line === heading || line.startsWith(`${heading} - `)) {
        sections.push(index);
        if (start === null) start = index + 1;
      }
    }
  }

  if (sections.length !== 1) {
    throw new Error(`Expected one CHANGELOG.md section for ${version}; found ${sections.length}`);
  }
  const body = lines.slice(start, end);
  while (body.length && !body[0].trim()) body.shift();
  while (body.length && !body[body.length - 1].trim()) body.pop();
  if (!body.length) throw new Error(`CHANGELOG.md section for ${version} is empty`);
  return `${body.join("\n")}\n`;
}

function releaseBodiesEqual(expected, actual) {
  // gh's plaintext output adds a newline; no other whitespace may change.
  return normalizeLineEndings(expected).replace(/\n+$/, "") ===
    normalizeLineEndings(actual).replace(/\n+$/, "");
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function main() {
  const { values } = parseArgs({
    options: {
      tag: { type: "string" },
      commit: { type: "string" },
      output: { type: "string" },
      "verify-body": { type: "string" },
    },
  });
  for (const option of ["tag", "commit", "output"]) {
    if (!values[option]) throw new Error(`--${option} is required`);
  }
  const { tag, commit, output } = values;
  if (TAG_PATTERN.exec(tag)?.[0] !== tag) throw new Error(`Unsupported release tag: ${tag}`);
  const taggedCommit = git("rev-parse", "--verify", "--end-of-options", `refs/tags/${tag}^{commit}`).trim();
  const expectedCommit = git("rev-parse", "--verify", "--end-of-options", `${commit}^{commit}`).trim();
  if (taggedCommit !== expectedCommit) throw new Error(`Tag ${tag} does not target commit ${commit}`);
  const changelog = git("show", `${taggedCommit}:CHANGELOG.md`);
  const notes = extractReleaseNotes(changelog, tag.slice(1));
  if (values["verify-body"] !== undefined) {
    const body = readFileSync(values["verify-body"], "utf8");
    if (!releaseBodiesEqual(notes, body)) throw new Error(`GitHub release body does not match tagged CHANGELOG.md section for ${tag}`);
  }
  writeFileSync(output, notes);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`release notes: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { extractReleaseNotes, releaseBodiesEqual };

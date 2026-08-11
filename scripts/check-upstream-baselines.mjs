#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
export const upstreamBaselinesPath = path.join(
  repositoryRoot,
  "config/upstream-baselines.json",
);

const versionPattern = /^\d+\.\d+\.\d+$/;
const commitPattern = /^[0-9a-f]{40}$/;

function assertRecord(value, label) {
  assert.equal(typeof value, "object", `${label} must be an object`);
  assert.notEqual(value, null, `${label} must be an object`);
  assert.equal(Array.isArray(value), false, `${label} must be an object`);
}

function assertExactKeys(value, expectedKeys, label) {
  assert.deepStrictEqual(
    Object.keys(value).sort(),
    [...expectedKeys].sort(),
    `${label} keys`,
  );
}

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.notEqual(value.length, 0, `${label} must not be empty`);
}

function assertVersion(value, label) {
  assertNonEmptyString(value, label);
  assert.match(value, versionPattern, `${label} must be a stable semantic version`);
}

function assertCommit(value, label) {
  assertNonEmptyString(value, label);
  assert.match(value, commitPattern, `${label} must be a full lowercase commit hash`);
}

function assertWebAddress(value, label) {
  assertNonEmptyString(value, label);
  assert.equal(new URL(value).protocol, "https:", `${label} must use HTTPS`);
}

function assertStringArray(value, expectedValues, label) {
  assert.deepStrictEqual(
    value,
    expectedValues,
    `${label} must use the reviewed values and order`,
  );
}

export function parseUpstreamBaselines(source) {
  const baselines = JSON.parse(source);
  validateUpstreamBaselines(baselines);
  return baselines;
}

export function validateUpstreamBaselines(baselines) {
  assertRecord(baselines, "baselines");
  assertExactKeys(
    baselines,
    ["schemaVersion", "herdr", "ghosttyWeb", "updatePolicy"],
    "baselines",
  );
  assert.equal(baselines.schemaVersion, 1, "schemaVersion");

  const herdr = baselines.herdr;
  assertRecord(herdr, "herdr");
  assertExactKeys(
    herdr,
    ["repository", "reviewedTag", "reviewedCommit", "minimumVersion", "terminalProtocol"],
    "herdr",
  );
  assertWebAddress(herdr.repository, "herdr.repository");
  assertVersion(herdr.minimumVersion, "herdr.minimumVersion");
  assert.equal(herdr.reviewedTag, `v${herdr.minimumVersion}`, "herdr.reviewedTag");
  assertCommit(herdr.reviewedCommit, "herdr.reviewedCommit");
  assert.equal(
    Number.isInteger(herdr.terminalProtocol) && herdr.terminalProtocol > 0,
    true,
    "herdr.terminalProtocol must be a positive integer",
  );

  const ghosttyWeb = baselines.ghosttyWeb;
  assertRecord(ghosttyWeb, "ghosttyWeb");
  assertExactKeys(
    ghosttyWeb,
    ["repository", "package", "supportedRelease", "temporaryPatches"],
    "ghosttyWeb",
  );
  assertWebAddress(ghosttyWeb.repository, "ghosttyWeb.repository");
  assert.equal(ghosttyWeb.package, "ghostty-web", "ghosttyWeb.package");
  assertVersion(ghosttyWeb.supportedRelease, "ghosttyWeb.supportedRelease");
  assert.equal(
    Array.isArray(ghosttyWeb.temporaryPatches),
    true,
    "temporaryPatches must be an array",
  );
  for (const [index, temporaryPatch] of ghosttyWeb.temporaryPatches.entries()) {
    const label = `ghosttyWeb.temporaryPatches[${index}]`;
    assertRecord(temporaryPatch, label);
    assertExactKeys(
      temporaryPatch,
      [
        "id",
        "active",
        "state",
        "appliesToRelease",
        "upstreamPullRequest",
        "upstreamCommit",
        "removalPolicy",
      ],
      label,
    );
    assertNonEmptyString(temporaryPatch.id, `${label}.id`);
    assert.equal(temporaryPatch.active, true, `${label}.active`);
    assert.equal(temporaryPatch.state, "evaluation", `${label}.state`);
    assert.equal(
      temporaryPatch.appliesToRelease,
      ghosttyWeb.supportedRelease,
      `${label}.appliesToRelease`,
    );
    assertWebAddress(temporaryPatch.upstreamPullRequest, `${label}.upstreamPullRequest`);
    assertCommit(temporaryPatch.upstreamCommit, `${label}.upstreamCommit`);
    assert.equal(
      temporaryPatch.removalPolicy,
      "release-contains-upstream-change",
      `${label}.removalPolicy`,
    );
  }

  const updatePolicy = baselines.updatePolicy;
  assertRecord(updatePolicy, "updatePolicy");
  assertExactKeys(
    updatePolicy,
    ["grouping", "manualReviewClasses", "reviewGates", "patchRemoval"],
    "updatePolicy",
  );
  assertRecord(updatePolicy.grouping, "updatePolicy.grouping");
  assertExactKeys(updatePolicy.grouping, ["npm", "cargo"], "updatePolicy.grouping");
  for (const ecosystem of ["npm", "cargo"]) {
    const grouping = updatePolicy.grouping[ecosystem];
    const label = `updatePolicy.grouping.${ecosystem}`;
    assertRecord(grouping, label);
    assertExactKeys(grouping, ["allowedUpdateTypes", "separateMajorUpdates"], label);
    assertStringArray(
      grouping.allowedUpdateTypes,
      ["minor", "patch"],
      `${label}.allowedUpdateTypes`,
    );
    assert.equal(grouping.separateMajorUpdates, true, `${label}.separateMajorUpdates`);
  }
  assertStringArray(
    updatePolicy.manualReviewClasses,
    [
      "major-update",
      "herdr-private-api",
      "herdr-terminal-protocol",
      "ghostty-web",
      "temporary-patch",
    ],
    "updatePolicy.manualReviewClasses",
  );
  assertStringArray(
    updatePolicy.reviewGates,
    [
      "continuous-integration",
      "vendor-drift",
      "runtime-compatibility",
      "browser-smoke",
      "patch-staleness",
    ],
    "updatePolicy.reviewGates",
  );
  assertRecord(updatePolicy.patchRemoval, "updatePolicy.patchRemoval");
  assertExactKeys(
    updatePolicy.patchRemoval,
    ["trigger", "requiredChecks"],
    "updatePolicy.patchRemoval",
  );
  assert.equal(
    updatePolicy.patchRemoval.trigger,
    "published-release-contains-upstream-change",
    "updatePolicy.patchRemoval.trigger",
  );
  assertStringArray(
    updatePolicy.patchRemoval.requiredChecks,
    [
      "verify-upstream-release",
      "remove-local-patch",
      "update-package-and-lockfile",
      "run-continuous-integration",
      "run-browser-smoke",
    ],
    "updatePolicy.patchRemoval.requiredChecks",
  );
}

export function validateRepositoryBaselines(
  baselines,
  { webManifest, webLockfile, bridgeSource, protocolSource },
) {
  const { package: packageName, supportedRelease } = baselines.ghosttyWeb;
  assert.equal(webManifest.dependencies[packageName], supportedRelease, "web package pin");
  assert.equal(
    webLockfile.packages[""].dependencies[packageName],
    supportedRelease,
    "web lockfile pin",
  );
  assert.equal(
    webLockfile.packages[`node_modules/${packageName}`].version,
    supportedRelease,
    "installed Ghostty Web lockfile release",
  );
  assert.match(
    bridgeSource,
    new RegExp(
      `const MIN_HERDR_VERSION_LABEL: &str = "${baselines.herdr.minimumVersion.replaceAll(".", "\\.")}";`,
    ),
    "bridge minimum Herdr version must match the baseline",
  );
  assert.match(
    protocolSource,
    new RegExp(`pub const PROTOCOL_VERSION: u32 = ${baselines.herdr.terminalProtocol};`),
    "vendored terminal protocol must match the baseline",
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function loadAndValidateRepositoryBaselines() {
  const baselines = parseUpstreamBaselines(await readFile(upstreamBaselinesPath, "utf8"));
  validateRepositoryBaselines(baselines, {
    webManifest: await readJson(path.join(repositoryRoot, "web/package.json")),
    webLockfile: await readJson(path.join(repositoryRoot, "web/package-lock.json")),
    bridgeSource: await readFile(path.join(repositoryRoot, "bridge/src/web_bridge.rs"), "utf8"),
    protocolSource: await readFile(
      path.join(repositoryRoot, "vendor/herdr-compat/src/protocol/wire.rs"),
      "utf8",
    ),
  });
  return baselines;
}

async function main() {
  const baselines = await loadAndValidateRepositoryBaselines();
  if (process.argv.length === 3 && process.argv[2] === "--herdr-values") {
    process.stdout.write(
      [
        baselines.herdr.reviewedTag,
        baselines.herdr.reviewedCommit,
        baselines.herdr.minimumVersion,
        baselines.herdr.terminalProtocol,
      ].join("\n") + "\n",
    );
    return;
  }
  assert.equal(process.argv.length, 2, "usage: check-upstream-baselines.mjs [--herdr-values]");
  process.stdout.write("Upstream baselines are valid and match repository compatibility pins\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

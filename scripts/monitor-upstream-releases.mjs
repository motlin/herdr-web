import assert from "node:assert/strict";

export const upstreamReleaseIssueMarker = "<!-- herdr-web-upstream-release-monitor -->";
export const upstreamReleaseIssueTitle = "Upstream stable release drift";

const stableVersionPattern = /^\d+\.\d+\.\d+$/;
const stableTagPattern = /^v\d+\.\d+\.\d+$/;

function assertRecord(value, label) {
  assert.equal(typeof value, "object", `${label} must be an object`);
  assert.notEqual(value, null, `${label} must be an object`);
  assert.equal(Array.isArray(value), false, `${label} must be an object`);
}

function assertExactKeys(value, expectedKeys, label) {
  assert.deepStrictEqual(Object.keys(value).sort(), [...expectedKeys].sort(), `${label} keys`);
}

function assertStableVersion(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.match(value, stableVersionPattern, `${label} must be a stable semantic version`);
}

function assertStableTag(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.match(value, stableTagPattern, `${label} must be a stable v-prefixed semantic version`);
}

function assertWebAddress(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.equal(new URL(value).protocol, "https:", `${label} must use HTTPS`);
}

export function parseGitHubRepositoryAddress(repositoryAddress) {
  const address = new URL(repositoryAddress);
  assert.equal(address.protocol, "https:", "Herdr repository must use HTTPS");
  assert.equal(address.hostname, "github.com", "Herdr repository must be hosted on GitHub");
  assert.equal(address.search, "", "Herdr repository must not include a query");
  assert.equal(address.hash, "", "Herdr repository must not include a fragment");

  const segments = address.pathname.split("/").filter(Boolean);
  assert.equal(segments.length, 2, "Herdr repository must identify an owner and repository");
  return { owner: segments[0], repository: segments[1] };
}

export function selectLatestStableHerdrRelease(releases) {
  assert.equal(Array.isArray(releases), true, "Herdr releases must be an array");
  const release = releases.find(
    (candidate) =>
      candidate.draft === false &&
      candidate.prerelease === false &&
      typeof candidate.tag === "string" &&
      stableTagPattern.test(candidate.tag),
  );
  assert.notEqual(release, undefined, "Herdr must have a stable release");
  assertExactKeys(release, ["tag", "address", "draft", "prerelease"], "Herdr release");
  assertWebAddress(release.address, "Herdr release address");
  return { tag: release.tag, address: release.address };
}

export function compareUpstreamReleases(
  baselines,
  { herdrRelease, ghosttyWebRelease },
) {
  assertRecord(baselines, "baselines");
  assertRecord(baselines.herdr, "baselines.herdr");
  assertRecord(baselines.ghosttyWeb, "baselines.ghosttyWeb");
  assertStableTag(baselines.herdr.reviewedTag, "baselines.herdr.reviewedTag");
  assertWebAddress(baselines.herdr.repository, "baselines.herdr.repository");
  assertStableVersion(
    baselines.ghosttyWeb.supportedRelease,
    "baselines.ghosttyWeb.supportedRelease",
  );
  assert.equal(
    typeof baselines.ghosttyWeb.package,
    "string",
    "baselines.ghosttyWeb.package must be a string",
  );

  assertRecord(herdrRelease, "herdrRelease");
  assertExactKeys(herdrRelease, ["tag", "address"], "herdrRelease");
  assertStableTag(herdrRelease.tag, "herdrRelease.tag");
  assertWebAddress(herdrRelease.address, "herdrRelease.address");

  assertRecord(ghosttyWebRelease, "ghosttyWebRelease");
  assertExactKeys(ghosttyWebRelease, ["version", "address"], "ghosttyWebRelease");
  assertStableVersion(ghosttyWebRelease.version, "ghosttyWebRelease.version");
  assertWebAddress(ghosttyWebRelease.address, "ghosttyWebRelease.address");

  const herdrDrift = baselines.herdr.reviewedTag !== herdrRelease.tag;
  const ghosttyWebDrift =
    baselines.ghosttyWeb.supportedRelease !== ghosttyWebRelease.version;
  const herdrBaselineAddress = `${baselines.herdr.repository}/releases/tag/${baselines.herdr.reviewedTag}`;
  const ghosttyWebBaselineAddress =
    `https://www.npmjs.com/package/${baselines.ghosttyWeb.package}` +
    `/v/${baselines.ghosttyWeb.supportedRelease}`;

  const issueBody = [
    upstreamReleaseIssueMarker,
    "## Upstream stable release monitor",
    "",
    "An automated check found the following upstream release state:",
    "",
    "| Upstream | Reviewed baseline | Latest stable release | Drift |",
    "| --- | --- | --- | --- |",
    `| Herdr | [${baselines.herdr.reviewedTag}](${herdrBaselineAddress}) | [${herdrRelease.tag}](${herdrRelease.address}) | ${herdrDrift ? "Yes" : "No"} |`,
    `| ${baselines.ghosttyWeb.package} | [${baselines.ghosttyWeb.supportedRelease}](${ghosttyWebBaselineAddress}) | [${ghosttyWebRelease.version}](${ghosttyWebRelease.address}) | ${ghosttyWebDrift ? "Yes" : "No"} |`,
    "",
    "Review upstream compatibility before changing repository baselines. This monitor does not modify source, vendor files, branches, releases, or pull requests.",
  ].join("\n");

  return {
    driftDetected: herdrDrift || ghosttyWebDrift,
    issueTitle: upstreamReleaseIssueTitle,
    issueBody,
    upstreams: {
      herdr: {
        baseline: baselines.herdr.reviewedTag,
        latest: herdrRelease.tag,
        drift: herdrDrift,
      },
      ghosttyWeb: {
        baseline: baselines.ghosttyWeb.supportedRelease,
        latest: ghosttyWebRelease.version,
        drift: ghosttyWebDrift,
      },
    },
  };
}

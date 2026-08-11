import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseUpstreamBaselines,
  upstreamBaselinesPath,
  validateRepositoryBaselines,
  validateUpstreamBaselines,
} from "./check-upstream-baselines.mjs";

const baselineSource = await readFile(upstreamBaselinesPath, "utf8");

test("parses the reviewed upstream baseline", () => {
  assert.deepStrictEqual(parseUpstreamBaselines(baselineSource), JSON.parse(baselineSource));
});

test("rejects incomplete commit hashes", () => {
  const baselines = JSON.parse(baselineSource);
  baselines.herdr.reviewedCommit = "abc123";

  assert.throws(
    () => validateUpstreamBaselines(baselines),
    {
      name: "AssertionError",
      message: "herdr.reviewedCommit must be a full lowercase commit hash",
    },
  );
});

test("rejects repository pins that drift from the baseline", () => {
  const baselines = parseUpstreamBaselines(baselineSource);
  const fixture = repositoryFixture(baselines);
  fixture.webManifest.dependencies[baselines.ghosttyWeb.package] = "0.5.0";

  assert.throws(
    () => validateRepositoryBaselines(baselines, fixture),
    {
      name: "AssertionError",
      message: "web package pin\n\n'0.5.0' !== '0.4.0'\n",
    },
  );
});

function repositoryFixture(baselines) {
  const packageName = baselines.ghosttyWeb.package;
  const release = baselines.ghosttyWeb.supportedRelease;
  return {
    webManifest: { dependencies: { [packageName]: release } },
    webLockfile: {
      packages: {
        "": { dependencies: { [packageName]: release } },
        [`node_modules/${packageName}`]: { version: release },
      },
    },
    bridgeSource: `const MIN_HERDR_VERSION_LABEL: &str = "${baselines.herdr.minimumVersion}";`,
    protocolSource: `pub const PROTOCOL_VERSION: u32 = ${baselines.herdr.terminalProtocol};`,
  };
}

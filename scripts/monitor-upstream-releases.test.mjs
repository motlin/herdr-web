import assert from "node:assert/strict";
import test from "node:test";

import {
  compareUpstreamReleases,
  parseGitHubRepositoryAddress,
  selectLatestStableHerdrRelease,
  upstreamReleaseIssueMarker,
} from "./monitor-upstream-releases.mjs";

const baselines = {
  herdr: {
    repository: "https://github.com/example/herdr",
    reviewedTag: "v1.0.0",
  },
  ghosttyWeb: {
    package: "example-terminal",
    supportedRelease: "1.0.0",
  },
};

test("parses a GitHub repository address", () => {
  assert.deepStrictEqual(parseGitHubRepositoryAddress(baselines.herdr.repository), {
    owner: "example",
    repository: "herdr",
  });
});

test("selects the newest stable Herdr release", () => {
  assert.deepStrictEqual(
    selectLatestStableHerdrRelease([
      {
        tag: "v3.0.0",
        address: "https://example.com/herdr/releases/tag/v3.0.0",
        draft: true,
        prerelease: false,
      },
      {
        tag: "v2.0.0-preview.1",
        address: "https://example.com/herdr/releases/tag/v2.0.0-preview.1",
        draft: false,
        prerelease: true,
      },
      {
        tag: "v2.0.0",
        address: "https://example.com/herdr/releases/tag/v2.0.0",
        draft: false,
        prerelease: false,
      },
      {
        tag: "v1.0.0",
        address: "https://example.com/herdr/releases/tag/v1.0.0",
        draft: false,
        prerelease: false,
      },
    ]),
    {
      tag: "v2.0.0",
      address: "https://example.com/herdr/releases/tag/v2.0.0",
    },
  );
});

test("reports stable release drift with direct upstream links", () => {
  assert.deepStrictEqual(
    compareUpstreamReleases(baselines, {
      herdrRelease: {
        tag: "v2.0.0",
        address: "https://example.com/herdr/releases/tag/v2.0.0",
      },
      ghosttyWebRelease: {
        version: "1.0.0",
        address: "https://example.com/example-terminal/1.0.0",
      },
    }),
    {
      driftDetected: true,
      issueTitle: "Upstream stable release drift",
      issueBody: `${upstreamReleaseIssueMarker}
## Upstream stable release monitor

An automated check found the following upstream release state:

| Upstream | Reviewed baseline | Latest stable release | Drift |
| --- | --- | --- | --- |
| Herdr | [v1.0.0](https://github.com/example/herdr/releases/tag/v1.0.0) | [v2.0.0](https://example.com/herdr/releases/tag/v2.0.0) | Yes |
| example-terminal | [1.0.0](https://www.npmjs.com/package/example-terminal/v/1.0.0) | [1.0.0](https://example.com/example-terminal/1.0.0) | No |

Review upstream compatibility before changing repository baselines. This monitor does not modify source, vendor files, branches, releases, or pull requests.`,
      upstreams: {
        herdr: { baseline: "v1.0.0", latest: "v2.0.0", drift: true },
        ghosttyWeb: { baseline: "1.0.0", latest: "1.0.0", drift: false },
      },
    },
  );
});

test("reports matching stable releases without drift", () => {
  assert.deepStrictEqual(
    compareUpstreamReleases(baselines, {
      herdrRelease: {
        tag: "v1.0.0",
        address: "https://example.com/herdr/releases/tag/v1.0.0",
      },
      ghosttyWebRelease: {
        version: "1.0.0",
        address: "https://example.com/example-terminal/1.0.0",
      },
    }),
    {
      driftDetected: false,
      issueTitle: "Upstream stable release drift",
      issueBody: `${upstreamReleaseIssueMarker}
## Upstream stable release monitor

An automated check found the following upstream release state:

| Upstream | Reviewed baseline | Latest stable release | Drift |
| --- | --- | --- | --- |
| Herdr | [v1.0.0](https://github.com/example/herdr/releases/tag/v1.0.0) | [v1.0.0](https://example.com/herdr/releases/tag/v1.0.0) | No |
| example-terminal | [1.0.0](https://www.npmjs.com/package/example-terminal/v/1.0.0) | [1.0.0](https://example.com/example-terminal/1.0.0) | No |

Review upstream compatibility before changing repository baselines. This monitor does not modify source, vendor files, branches, releases, or pull requests.`,
      upstreams: {
        herdr: { baseline: "v1.0.0", latest: "v1.0.0", drift: false },
        ghosttyWeb: { baseline: "1.0.0", latest: "1.0.0", drift: false },
      },
    },
  );
});

test("rejects prerelease versions", () => {
  assert.throws(
    () =>
      compareUpstreamReleases(baselines, {
        herdrRelease: {
          tag: "v2.0.0-preview.1",
          address: "https://example.com/herdr/releases/tag/v2.0.0-preview.1",
        },
        ghosttyWebRelease: {
          version: "2.0.0",
          address: "https://example.com/example-terminal/2.0.0",
        },
      }),
    {
      name: "AssertionError",
      message: "herdrRelease.tag must be a stable v-prefixed semantic version",
    },
  );
});

test("rejects prerelease Ghostty Web versions", () => {
  assert.throws(
    () =>
      compareUpstreamReleases(baselines, {
        herdrRelease: {
          tag: "v2.0.0",
          address: "https://example.com/herdr/releases/tag/v2.0.0",
        },
        ghosttyWebRelease: {
          version: "2.0.0-preview.1",
          address: "https://example.com/example-terminal/2.0.0-preview.1",
        },
      }),
    {
      name: "AssertionError",
      message: "ghosttyWebRelease.version must be a stable semantic version",
    },
  );
});

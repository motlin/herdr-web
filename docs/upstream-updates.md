# Upstream Update Policy

Herdr Web tracks its reviewed upstream versions and update rules in
[`config/upstream-baselines.json`](../config/upstream-baselines.json). Run
`npm run upstream:check` after changing that file, the Ghostty Web dependency, or the Herdr
compatibility surface.

## Baselines

The baseline records the reviewed Herdr repository, tag, commit, minimum runtime version, and exact
terminal protocol. The bridge keeps its minimum version and terminal protocol checks explicit in
Rust; the baseline validator verifies that those runtime constants agree with the policy data.

The Ghostty Web baseline is an exact supported release. Its package manifest and lockfile entries
must match the baseline. Temporary patch records identify the affected release, upstream pull
request and commit, current state, and removal policy. An `evaluation` record describes an active
experiment, not a patch applied by the repository; a later patch implementation must update the
state and add its reproducible patch artifact together.

## Update Grouping

Dependabot checks four dependency roots every week:

| Ecosystem | Directory | Grouped updates |
| --- | --- | --- |
| npm | `/` | Patch and minor |
| npm | `/web` | Patch and minor |
| Cargo | `/bridge` | Patch and minor |
| Cargo | `/vendor/herdr-compat` | Patch and minor |

Each root has its own manifest and lockfile, so groups do not cross those boundaries. Major updates
stay in separate pull requests, and each root is limited to five open Dependabot pull requests.
The exact `ghostty-web` pin is still eligible for a release update pull request.

For every dependency pull request, review the manifest and lockfile diff, confirm that the changes
belong to the named root and update class, and wait for the `Dependency validation` workflow. That
workflow installs the root and web dependencies with `npm ci` under Node.js 22, uses Rust stable,
and runs:

```bash
npm run check
```

This validates the vendor layout, exercises the upstream-policy unit tests, lints and tests the web
app, tests both Rust crates, and produces the web and bridge builds. Reproduce the clean installs
locally when investigating lockfile or installation failures. For a `ghostty-web` update, also run
`npm run upstream:check` so its exact manifest and lockfile versions are checked against the
reviewed baseline:

```bash
npm ci
npm ci --prefix web
npm run upstream:check
npm run check
```

Automatic merging is disabled. The following update classes always require manual review even
after continuous integration passes:

- Major dependency updates.
- Herdr private API or schema changes.
- Herdr terminal protocol or attach-behavior changes.
- Ghostty Web updates, including terminal rendering checks.
- Adding, changing, or removing a temporary dependency patch.

Passing automation is evidence for review, not approval to merge one of these update classes.

## Upstream Release Monitor

The `Upstream release monitor` workflow runs at 09:17 UTC every Monday and can also be started with
GitHub's `workflow_dispatch` control. It compares the reviewed Herdr tag with the latest stable
non-draft GitHub release and the supported `ghostty-web` version with npm's latest published
release.

When either value differs, the workflow creates or updates the single `Upstream stable release
drift` issue with both baselines, both latest releases, and source links. It reopens that issue when
drift returns and closes it when both upstreams match their baselines. The workflow does not modify
source, vendor files, branches, pull requests, or releases. A monitor issue starts a manual review;
it does not approve a dependency update or a Herdr protocol refresh.

## Herdr Compatibility Refresh

Use the detailed file mapping and adaptation list in [`docs/vendoring.md`](vendoring.md). Begin with
a clean Herdr Web worktree and a separate, clean Herdr checkout at the stable tag being evaluated:

```bash
HERDR_SRC=/path/to/herdr
git -C "$HERDR_SRC" status --short
git -C "$HERDR_SRC" switch --detach vX.Y.Z
git -C "$HERDR_SRC" rev-parse HEAD
```

Read the release changes before copying anything. Review `src/protocol/wire.rs`, API schemas under
`src/api/schema/`, terminal attach behavior in `src/server/headless.rs`, the minimum runtime
version, and the terminal protocol number. Only after each review is complete, run the review-only
refresh command:

```bash
npm run vendor:refresh -- \
  --source "$HERDR_SRC" \
  --tag vX.Y.Z \
  --confirm-protocol-review \
  --confirm-schema-review \
  --confirm-headless-attach-review \
  --confirm-version-floor-review \
  --confirm-protocol-number-review
```

The command copies only allow-listed compatibility files, three-way merges documented local
adaptations, stops before changing compatibility files when an adaptation conflicts, and leaves an
uncommitted diff. It does not update the baseline, commit, push, publish, or create a full Herdr
snapshot. Review the resulting diff and reconcile adaptations before changing
`config/upstream-baselines.json` or the bridge's explicit runtime checks.

After the baseline, runtime checks, and reviewed compatibility diff agree, validate them together:

```bash
npm run upstream:check
HERDR_SRC="$HERDR_SRC" npm run vendor:check
npm run check
```

Then complete the browser smoke checklist in [`docs/release.md`](release.md) against the evaluated
Herdr version. Do not accept unreviewed private schema, protocol, or attach-behavior changes even
when the merge and automated checks succeed.

## Review Gates

Run `npm run check` for every update. Use the additional gates named in the baseline when they
apply:

- `vendor-drift`: compare a clean checkout at the reviewed Herdr commit with
  `HERDR_SRC=/path/to/herdr scripts/check-vendor.sh`.
- `runtime-compatibility`: review the Herdr minimum version, exact terminal protocol, private API
  schemas, and headless terminal attach behavior.
- `browser-smoke`: run the browser checklist in [`docs/release.md`](release.md), with terminal
  rendering checks for Ghostty Web changes.
- `patch-staleness`: prove each active patch applies to its recorded release and still contains
  only the intended upstream change.

CI success does not authorize copying or merging Herdr private protocol/schema changes.

## Temporary Ghostty Web Patches

The Powerline vector/clamping change from
[`coder/ghostty-web#185`](https://github.com/coder/ghostty-web/pull/185), commit
`a32d594d158dc3317ce94a3d4be59baf80675d85`, is currently an evaluation. It is not an accepted or
applied repository patch: there is no patch artifact or install hook, and `npm ci --prefix web`
installs the unmodified release pinned in `web/package.json`. The baseline keeps the evaluation
visible, but its `state` is authoritative.

To reproduce the upstream source change for evaluation, use a clean Ghostty Web checkout and
verify the GitHub pull-request ref resolves to the recorded commit:

```bash
GHOSTTY_WEB_SRC=/path/to/ghostty-web
git -C "$GHOSTTY_WEB_SRC" status --short
git -C "$GHOSTTY_WEB_SRC" fetch origin refs/pull/185/head
test "$(git -C "$GHOSTTY_WEB_SRC" rev-parse FETCH_HEAD)" = \
  a32d594d158dc3317ce94a3d4be59baf80675d85
git -C "$GHOSTTY_WEB_SRC" show --stat --oneline FETCH_HEAD
git -C "$GHOSTTY_WEB_SRC" diff FETCH_HEAD^ FETCH_HEAD -- \
  lib/renderer.ts lib/renderer.test.ts
```

This reproduces the source diff for review; it does not patch the published npm package. If the
evaluation is accepted later, the same change must add a repository-owned patch derived from that
commit, a deterministic setup or build hook, and a focused staleness check. The check must prove
that the patch applies to the exact supported release and that both the Powerline vector rendering
and glyph-width clamping are present. A clean setup must reproduce it without committing
`node_modules` or `web/dist`, and a stale patch must fail rather than be skipped. Record the new
artifact and applied state in `config/upstream-baselines.json`, then run:

```bash
npm ci
npm ci --prefix web
npm run upstream:check
npm run check
```

Do not describe or rely on a patch command until that command exists in `package.json`.

### Determine Whether a Release Contains a Patch

Do not remove a local patch because a newer version exists. First identify the source tag for the
published npm release and inspect the release notes and source. When upstream contains the exact
commit, prove ancestry from a clean checkout:

```bash
PATCH_COMMIT=a32d594d158dc3317ce94a3d4be59baf80675d85
RELEASE_TAG=vX.Y.Z
git -C "$GHOSTTY_WEB_SRC" fetch origin --tags
git -C "$GHOSTTY_WEB_SRC" merge-base --is-ancestor \
  "$PATCH_COMMIT" "$RELEASE_TAG"
```

A squash, cherry-pick, or independent implementation will not pass that ancestry test. In that
case, compare the recorded patch diff with the release tag and verify the released package has the
same two behaviors. For PR #185, inspect the Powerline separator vector paths and the `fillText`
cell-width clamp, then run the focused patch check and the Powerline items in the browser smoke
checklist against the candidate release. Release notes alone are not sufficient evidence.

### Remove a Patch Safely

Remove a retained patch in the same pull request that adopts the first verified upstream release:

1. Update the exact `ghostty-web` dependency and lockfile with
   `npm install --prefix web --save-exact ghostty-web@X.Y.Z`.
2. Remove the patch artifact, deterministic hook, and patch-only check. Do not leave an inert patch
   or make failed application optional.
3. Update `ghosttyWeb.supportedRelease` and remove the patch record from
   `config/upstream-baselines.json` so it no longer claims the release needs a local patch.
4. Run `npm ci`, `npm ci --prefix web`, `npm run upstream:check`, and `npm run check`.
5. Complete the browser smoke checklist in [`docs/release.md`](release.md), including the terminal
   font, palette, Powerline separators, wide fallback glyphs, and partial row repaints.

## Changelog And Release Notes

Every accepted upstream change needs a user-facing entry under `## [Unreleased]` in
`CHANGELOG.md`. Name the old and new version or Herdr tag, and call out compatibility, rendering,
or setup effects. Use `Breaking Changes` for a new Herdr runtime floor or incompatible protocol,
`Changed` for dependency or compatibility refreshes, `Fixed` when adopting an upstream correction,
and `Removed` when a temporary patch mechanism is deleted. Add the pull request number or link
before merging.

The release script in [`docs/release.md`](release.md) builds GitHub release notes from that
changelog section. Do not maintain separate, divergent release-note text. Before cutting the
release, make sure the notes say whether a Ghostty fix is still locally patched or is supplied by
the new upstream release, and identify the reviewed Herdr tag and terminal protocol when they
change.

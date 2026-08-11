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

Routine npm and Cargo patch and minor updates may be grouped within their own ecosystem. Major
updates stay separate. Groups must not cross the root/web npm boundary or the bridge/compatibility
Cargo boundary because each directory has an independent manifest and lockfile.

Automatic merging is disabled. The following update classes always require manual review even
after continuous integration passes:

- Major dependency updates.
- Herdr private API or schema changes.
- Herdr terminal protocol or attach-behavior changes.
- Ghostty Web updates, including terminal rendering checks.
- Adding, changing, or removing a temporary dependency patch.

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

## Temporary Patch Removal

Remove a temporary patch once a published upstream release contains the recorded change. Confirm
the release from upstream source or release notes, update the exact package version and lockfile,
remove the patch artifact and install hook in the same change, and update or remove its baseline
record. Then run `npm run check` and the browser smoke checklist. Do not retain an inert patch or
silently ignore a failed application: either the pinned release needs it and setup applies it, or
the repository removes it.

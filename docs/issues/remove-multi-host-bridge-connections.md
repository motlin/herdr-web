# Remove multi-host bridge connections

## Body

Remove the multi-host / bridge-connection feature entirely. Dropping `bridgeLabel` from Space and
Agent sidebar rows was the first step: the Herdr TUI has no host token, so host context remains only
in web-specific multi-bridge UI.

Once multi-host support is removed, collapse the remaining per-bridge surfaces:

- `GroupHeader` bridge grouping in `web/src/App.tsx` (group construction around lines 6978 and
  7012, and rendering around line 8697).
- The `.sidebar-scope` host scope toggle and `.bridge-chip` / `.bridge-chip-dot` styles in
  `web/src/styles.css` (around lines 345-410).
- The `BridgeConnectionView` type and `BridgeConnectionController` in `web/src/App.tsx` (around
  lines 241 and 4437).
- The per-bridge resource plumbing in `refreshBridgeResource` (around lines 3258-3352), including
  clones such as `refreshBridgeAgentPins` (around lines 3378-3402) and
  `refreshBridgeSidebarConfig`.
- The `sidebarConfigs: Record<BridgeId, SidebarConfig>` prop on `Switcher` (around line 3828).
- `DisconnectedBridgeRow` (around line 9020).

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_CONFIG,
  MAX_SIDEBAR_ROWS,
  MAX_SIDEBAR_TOKENS_PER_ROW,
  agentTokenContext,
  parseSidebarConfig,
  resolveAgentRows,
  resolveSpaceRows,
  rowsContainStateText,
  shouldShowTabToken,
  spaceTokenContext,
  statusGlyph,
  tokenSeparator,
} from "./sidebarTokens";
import type { PaneInfo, WorkspaceInfo } from "./types";

const EXPECTED_DEFAULT_SIDEBAR_CONFIG = {
  spaces: {
    rows: [
      [
        { kind: "builtin", name: "state_icon", style: {} },
        { kind: "builtin", name: "workspace", style: {} },
      ],
      [
        { kind: "builtin", name: "branch", style: {} },
        { kind: "builtin", name: "git_status", style: {} },
      ],
    ],
    rowGap: 0,
  },
  agents: {
    rows: [
      [
        { kind: "builtin", name: "state_icon", style: {} },
        { kind: "builtin", name: "workspace", style: {} },
        { kind: "builtin", name: "tab", style: {} },
      ],
      [{ kind: "builtin", name: "agent", style: {} }],
    ],
    rowsByAgent: {},
    rowGap: 0,
  },
};

describe("sidebar config parsing", () => {
  it("uses the TUI defaults for invalid roots", () => {
    expect([
      DEFAULT_SIDEBAR_CONFIG,
      parseSidebarConfig({}),
      parseSidebarConfig(null),
      parseSidebarConfig("garbage"),
    ]).toStrictEqual([
      EXPECTED_DEFAULT_SIDEBAR_CONFIG,
      EXPECTED_DEFAULT_SIDEBAR_CONFIG,
      EXPECTED_DEFAULT_SIDEBAR_CONFIG,
      EXPECTED_DEFAULT_SIDEBAR_CONFIG,
    ]);
  });

  it("normalizes plain builtin and custom string tokens", () => {
    expect(
      parseSidebarConfig({
        spaces: {
          rows: [["state_icon", "workspace", "$summary"]],
          row_gap: 2,
        },
        agents: {
          rows: [["terminal_title_stripped", "$command"]],
          rows_by_agent: {},
          row_gap: 3,
        },
      }),
    ).toStrictEqual({
      spaces: {
        rows: [[
          { kind: "builtin", name: "state_icon", style: {} },
          { kind: "builtin", name: "workspace", style: {} },
          { kind: "custom", name: "summary", style: {} },
        ]],
        rowGap: 2,
      },
      agents: {
        rows: [[
          { kind: "builtin", name: "terminal_title_stripped", style: {} },
          { kind: "custom", name: "command", style: {} },
        ]],
        rowsByAgent: {},
        rowGap: 3,
      },
    });
  });

  it("parses styled table tokens and expands short hexadecimal colors", () => {
    expect(
      parseSidebarConfig({
        sidebar: {
          spaces: {
            rows: [[{ token: "branch", fg: "#AbC", bold: true, dim: false }]],
          },
          agents: {
            rows: [[{ token: "$summary", fg: "#010203", bold: false, dim: true }]],
          },
        },
      }),
    ).toStrictEqual({
      spaces: {
        rows: [[
          {
            kind: "builtin",
            name: "branch",
            style: { fg: "#aabbcc", bold: true, dim: false },
          },
        ]],
        rowGap: 0,
      },
      agents: {
        rows: [[
          {
            kind: "custom",
            name: "summary",
            style: { fg: "#010203", bold: false, dim: true },
          },
        ]],
        rowsByAgent: {},
        rowGap: 0,
      },
    });
  });

  it("drops unknown tokens and tokens with malformed styles", () => {
    expect(
      parseSidebarConfig({
        spaces: {
          rows: [[
            "workspace",
            "tab",
            "$bad token",
            { token: "branch", fg: "red" },
            { token: "git_status", bold: "yes" },
          ]],
        },
        agents: {
          rows: [["agent", "branch", { token: "tab", dim: 1 }]],
        },
      }),
    ).toStrictEqual({
      spaces: {
        rows: [[{ kind: "builtin", name: "workspace", style: {} }]],
        rowGap: 0,
      },
      agents: {
        rows: [[{ kind: "builtin", name: "agent", style: {} }]],
        rowsByAgent: {},
        rowGap: 0,
      },
    });
  });

  it("truncates rows and tokens at the TUI limits", () => {
    const row = Array.from(
      { length: MAX_SIDEBAR_TOKENS_PER_ROW + 2 },
      () => "workspace",
    );
    const rows = Array.from({ length: MAX_SIDEBAR_ROWS + 2 }, () => row);
    const expectedRow = Array.from(
      { length: MAX_SIDEBAR_TOKENS_PER_ROW },
      () => ({ kind: "builtin" as const, name: "workspace" as const, style: {} }),
    );
    const expectedRows = Array.from({ length: MAX_SIDEBAR_ROWS }, () => expectedRow);

    expect(
      parseSidebarConfig({
        spaces: { rows },
        agents: { rows },
      }),
    ).toStrictEqual({
      spaces: { rows: expectedRows, rowGap: 0 },
      agents: { rows: expectedRows, rowsByAgent: {}, rowGap: 0 },
    });
  });

  it("preserves per-agent row layouts", () => {
    expect(
      parseSidebarConfig({
        spaces: {
          rows: [["state_icon", "workspace"], ["branch", "git_status"]],
          row_gap: 0,
        },
        agents: {
          rows: [["agent"]],
          rows_by_agent: {
            claude: [["state_icon", "workspace"], ["$summary"]],
            codex: [[{ token: "terminal_title", dim: true }]],
          },
          row_gap: 1,
        },
      }),
    ).toStrictEqual({
      spaces: DEFAULT_SIDEBAR_CONFIG.spaces,
      agents: {
        rows: [[{ kind: "builtin", name: "agent", style: {} }]],
        rowsByAgent: {
          claude: [
            [
              { kind: "builtin", name: "state_icon", style: {} },
              { kind: "builtin", name: "workspace", style: {} },
            ],
            [{ kind: "custom", name: "summary", style: {} }],
          ],
          codex: [[
            {
              kind: "builtin",
              name: "terminal_title",
              style: { dim: true },
            },
          ]],
        },
        rowGap: 1,
      },
    });
  });

  it("accepts equivalent enveloped and bare config bodies", () => {
    const body = {
      spaces: { rows: [["workspace"]], row_gap: 4 },
      agents: { rows: [["agent"]], rows_by_agent: {}, row_gap: 5 },
    };

    expect([
      parseSidebarConfig(body),
      parseSidebarConfig({ sidebar: body }),
    ]).toStrictEqual([
      {
        spaces: {
          rows: [[{ kind: "builtin", name: "workspace", style: {} }]],
          rowGap: 4,
        },
        agents: {
          rows: [[{ kind: "builtin", name: "agent", style: {} }]],
          rowsByAgent: {},
          rowGap: 5,
        },
      },
      {
        spaces: {
          rows: [[{ kind: "builtin", name: "workspace", style: {} }]],
          rowGap: 4,
        },
        agents: {
          rows: [[{ kind: "builtin", name: "agent", style: {} }]],
          rowsByAgent: {},
          rowGap: 5,
        },
      },
    ]);
  });
});

describe("space token resolution", () => {
  it("resolves the default rows from a complete context", () => {
    expect(
      resolveSpaceRows(DEFAULT_SIDEBAR_CONFIG.spaces, {
        workspace: "repo",
        stateText: "working",
        branch: "feature/sidebar",
        ahead: 2,
        behind: 1,
      }),
    ).toStrictEqual([
      [
        { kind: { type: "state_icon" }, style: {} },
        { kind: { type: "workspace", text: "repo" }, style: {} },
      ],
      [
        { kind: { type: "branch", text: "feature/sidebar" }, style: {} },
        { kind: { type: "git_status", ahead: 2, behind: 1 }, style: {} },
      ],
    ]);
  });

  it("drops the empty git row when branch and counts are missing", () => {
    expect(
      resolveSpaceRows(DEFAULT_SIDEBAR_CONFIG.spaces, {
        workspace: "repo",
        stateText: "idle",
      }),
    ).toStrictEqual([
      [
        { kind: { type: "state_icon" }, style: {} },
        { kind: { type: "workspace", text: "repo" }, style: {} },
      ],
    ]);
  });

  it("elides an in-sync git status while preserving the branch", () => {
    expect(
      resolveSpaceRows(DEFAULT_SIDEBAR_CONFIG.spaces, {
        workspace: "repo",
        stateText: "idle",
        branch: "main",
        ahead: 0,
        behind: 0,
      }),
    ).toStrictEqual([
      [
        { kind: { type: "state_icon" }, style: {} },
        { kind: { type: "workspace", text: "repo" }, style: {} },
      ],
      [{ kind: { type: "branch", text: "main" }, style: {} }],
    ]);
  });

  it("suppresses both builtin git details for grouped children", () => {
    expect(
      resolveSpaceRows(DEFAULT_SIDEBAR_CONFIG.spaces, {
        workspace: "feature",
        stateText: "idle",
        branch: "worktree/feature",
        ahead: 2,
        behind: 1,
        suppressGitDetails: true,
      }),
    ).toStrictEqual([
      [
        { kind: { type: "state_icon" }, style: {} },
        { kind: { type: "workspace", text: "feature" }, style: {} },
      ],
    ]);
  });

  it("resolves a present custom token and drops a missing one", () => {
    const config = parseSidebarConfig({
      spaces: { rows: [["$jj_status"], ["$missing"]] },
    });

    expect(
      resolveSpaceRows(config.spaces, {
        workspace: "repo",
        stateText: "idle",
        tokens: { jj_status: "2 changes" },
      }),
    ).toStrictEqual([
      [{ kind: { type: "custom", text: "2 changes" }, style: {} }],
    ]);
  });
});

describe("agent token resolution", () => {
  it("drops missing custom tokens and their empty rows", () => {
    const config = parseSidebarConfig({
      agents: {
        rows: [["state_icon", "$missing"], ["$missing"], ["agent"]],
      },
    });

    expect(
      resolveAgentRows(config.agents, {
        stateText: "working",
        agent: "pi",
      }),
    ).toStrictEqual([
      [{ kind: { type: "state_icon" }, style: {} }],
      [{ kind: { type: "agent", text: "pi" }, style: {} }],
    ]);
  });

  it("keeps state text independent from arbitrary values", () => {
    const config = parseSidebarConfig({
      agents: { rows: [["state_text", "$summary"]] },
    });

    expect(
      resolveAgentRows(config.agents, {
        stateText: "deep in the mines",
        tokens: { summary: "reviewing auth" },
      }),
    ).toStrictEqual([
      [
        { kind: { type: "state_text", text: "deep in the mines" }, style: {} },
        { kind: { type: "custom", text: "reviewing auth" }, style: {} },
      ],
    ]);
  });

  it("keeps raw, stripped, and custom terminal titles distinct", () => {
    const config = parseSidebarConfig({
      agents: {
        rows: [["terminal_title", "terminal_title_stripped", "$terminal_title"]],
      },
    });

    expect(
      resolveAgentRows(config.agents, {
        stateText: "working",
        terminalTitle: "⠋ raw title",
        terminalTitleStripped: "raw title",
        tokens: { terminal_title: "custom title" },
      }),
    ).toStrictEqual([
      [
        { kind: { type: "terminal_title", text: "⠋ raw title" }, style: {} },
        { kind: { type: "terminal_title", text: "raw title" }, style: {} },
        { kind: { type: "custom", text: "custom title" }, style: {} },
      ],
    ]);
  });

  it("uses a matching agent override and otherwise falls back to default rows", () => {
    const config = parseSidebarConfig({
      agents: {
        rows: [["workspace"]],
        rows_by_agent: { pi: [["agent"]] },
      },
    });

    expect([
      resolveAgentRows(config.agents, {
        stateText: "working",
        agentId: "pi",
        workspace: "repo",
        agent: "renamed pi",
      }),
      resolveAgentRows(config.agents, {
        stateText: "working",
        workspace: "repo",
        agent: "renamed pi",
      }),
    ]).toStrictEqual([
      [[{ kind: { type: "agent", text: "renamed pi" }, style: {} }]],
      [[{ kind: { type: "workspace", text: "repo" }, style: {} }]],
    ]);
  });
});

describe("sidebar token helpers", () => {
  it("uses the TUI separator truth table", () => {
    const stateIcon = { kind: { type: "state_icon" as const }, style: {} };
    const workspace = {
      kind: { type: "workspace" as const, text: "repo" },
      style: {},
    };
    const gitStatus = {
      kind: { type: "git_status" as const, ahead: 1, behind: 0 },
      style: {},
    };

    expect([
      tokenSeparator(stateIcon, workspace),
      tokenSeparator(workspace, gitStatus),
      tokenSeparator(stateIcon, gitStatus),
      tokenSeparator(workspace, workspace),
    ]).toStrictEqual([" ", " ", " ", " · "]);
  });

  it("maps every agent status to its TUI glyph", () => {
    expect([
      statusGlyph("blocked"),
      statusGlyph("working"),
      statusGlyph("done"),
      statusGlyph("idle"),
      statusGlyph("unknown"),
    ]).toStrictEqual(["●", "●", "●", "○", "·"]);
  });

  it("shows tab tokens for multiple tabs or a custom tab name", () => {
    expect([
      shouldShowTabToken(1, false),
      shouldShowTabToken(2, false),
      shouldShowTabToken(1, true),
      shouldShowTabToken(2, true),
    ]).toStrictEqual([false, true, true, true]);
  });

  it("detects resolved state text tokens", () => {
    expect([
      rowsContainStateText([]),
      rowsContainStateText([
        [{ kind: { type: "workspace", text: "repo" }, style: {} }],
      ]),
      rowsContainStateText([
        [{ kind: { type: "state_text", text: "working" }, style: {} }],
      ]),
    ]).toStrictEqual([false, false, true]);
  });
});

describe("sidebar token contexts", () => {
  it("builds a space context from snapshot fields", () => {
    const workspace: WorkspaceInfo = {
      workspace_id: "workspace-100",
      number: 1,
      label: "repo",
      focused: true,
      pane_count: 1,
      tab_count: 1,
      active_tab_id: "tab-100",
      agent_status: "unknown",
      git: { branch: "main", ahead: 2, behind: 1 },
      tokens: { summary: "reviewing auth" },
    };

    expect(
      spaceTokenContext(workspace, { suppressGitDetails: true }),
    ).toStrictEqual({
      workspace: "repo",
      stateText: "idle",
      branch: "main",
      ahead: 2,
      behind: 1,
      tokens: { summary: "reviewing auth" },
      suppressGitDetails: true,
    });
  });

  it("builds an agent context from pane display fields and state labels", () => {
    const pane: PaneInfo = {
      pane_id: "pane-100",
      terminal_id: "terminal-100",
      workspace_id: "workspace-100",
      tab_id: "tab-100",
      focused: true,
      label: "CLI",
      agent: "claude",
      display_agent: "Claude Code",
      terminal_title: "⠋ raw title",
      terminal_title_stripped: "raw title",
      agent_status: "working",
      state_labels: { working: "pondering" },
      tokens: { summary: "reviewing auth" },
      revision: 1,
    };

    expect(
      agentTokenContext(pane, {
        workspaceLabel: "repo",
        tabLabel: "Agents",
      }),
    ).toStrictEqual({
      stateText: "pondering",
      agentId: "claude",
      workspace: "repo",
      tab: "Agents",
      pane: "CLI",
      agent: "Claude Code",
      terminalTitle: "⠋ raw title",
      terminalTitleStripped: "raw title",
      tokens: { summary: "reviewing auth" },
    });
  });
});

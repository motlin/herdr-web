import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_CONFIG,
  MAX_SIDEBAR_ROWS,
  MAX_SIDEBAR_TOKENS_PER_ROW,
  parseSidebarConfig,
} from "./sidebarTokens";

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

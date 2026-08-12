/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRow, SpaceRow } from "./App";
import { SidebarTokenRows } from "./SidebarRow";
import {
  DEFAULT_SIDEBAR_CONFIG,
  agentTokenContext,
  parseSidebarConfig,
  resolveAgentRows,
  resolveSpaceRows,
  type ResolvedRow,
} from "./sidebarTokens";
import type { PaneInfo, WorkspaceInfo } from "./types";

const roots: Root[] = [];

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) {
      root.unmount();
    }
  });
  document.body.innerHTML = "";
});

describe("SidebarTokenRows", () => {
  it("renders the TUI space token stream with exact glyphs and separators", async () => {
    const rows = resolveSpaceRows(DEFAULT_SIDEBAR_CONFIG.spaces, {
      workspace: "herdr-web",
      stateText: "working",
      branch: "feat/sidebar",
      ahead: 2,
      behind: 1,
    });
    const container = await renderRows(rows, "working", "space");

    expect(
      [...container.querySelectorAll(".sb-row")].map((row) => row.textContent),
    ).toStrictEqual(["● herdr-web", "feat/sidebar ↑2 ↓1"]);
  });

  it("collapses a clean non-git workspace to one row", async () => {
    const rows = resolveSpaceRows(DEFAULT_SIDEBAR_CONFIG.spaces, {
      workspace: "herdr-web",
      stateText: "idle",
    });
    const container = await renderRows(rows, "idle", "space");

    expect(
      [...container.querySelectorAll(".sb-row")].map((row) => row.textContent),
    ).toStrictEqual(["○ herdr-web"]);
  });

  it("renders ahead and behind counts as separate elements", async () => {
    const rows = resolveSpaceRows(DEFAULT_SIDEBAR_CONFIG.spaces, {
      workspace: "herdr-web",
      stateText: "working",
      branch: "feat/sidebar",
      ahead: 2,
      behind: 1,
    });
    const container = await renderRows(rows, "working", "space");

    expect(
      [...container.querySelectorAll(".sb-git > span")].map((element) => ({
        className: element.className,
        text: element.textContent,
      })),
    ).toStrictEqual([
      { className: "sb-ahead", text: "↑2" },
      { className: "sb-behind", text: "↓1" },
    ]);
  });

  it("applies configured token colors inline", async () => {
    const rows: ResolvedRow[] = [[
      {
        kind: { type: "custom", text: "review" },
        style: { fg: "#010203" },
      },
    ]];
    const container = await renderRows(rows, "unknown", "agent");

    expect(
      container.querySelector<HTMLElement>('[data-token="custom"]')?.style.color,
    ).toBe("rgb(1, 2, 3)");
  });

  it("renders the default agent rows", async () => {
    const rows = resolveAgentRows(DEFAULT_SIDEBAR_CONFIG.agents, {
      stateText: "working",
      workspace: "herdr-web",
      tab: "CLI",
      agent: "claude",
    });
    const container = await renderRows(rows, "working", "agent");

    expect(
      [...container.querySelectorAll(".sb-row")].map((row) => row.textContent),
    ).toStrictEqual(["● herdr-web · CLI", "claude"]);
  });
});

describe("SpaceRow", () => {
  it("renders TUI token rows while keeping legacy metadata in the tooltip", async () => {
    const workspace: WorkspaceInfo = {
      workspace_id: "workspace-100",
      number: 1,
      label: "herdr-web",
      focused: true,
      pane_count: 5,
      tab_count: 2,
      active_tab_id: "tab-100",
      agent_status: "working",
      git: { branch: "feat/sidebar", ahead: 2, behind: 1 },
    };
    const rows = resolveSpaceRows(
      DEFAULT_SIDEBAR_CONFIG.spaces,
      {
        workspace: workspace.label,
        stateText: "working",
        branch: workspace.git?.branch,
        ahead: workspace.git?.ahead,
        behind: workspace.git?.behind,
      },
    );
    const container = await renderSpaceRow(
      workspace,
      rows,
      "host-a · 2 tabs · 5 panes · 3 agents",
    );
    const button = container.querySelector<HTMLButtonElement>(".space-row");

    expect({
      title: button?.title,
      rows: [...container.querySelectorAll(".sb-row")].map(
        (row) => row.textContent,
      ),
      attention: container.querySelector(".attn")?.textContent,
      legacyDotCount: container.querySelectorAll(".space-row > .dot").length,
      legacyBodyCount: container.querySelectorAll(".space-body").length,
    }).toStrictEqual({
      title: "host-a · 2 tabs · 5 panes · 3 agents",
      rows: ["● herdr-web", "feat/sidebar ↑2 ↓1"],
      attention: "2",
      legacyDotCount: 0,
      legacyBodyCount: 0,
    });
  });
});

describe("AgentRow", () => {
  it("renders default TUI token rows with the icon and pin fixed before them", async () => {
    const pane = agentPane();
    const rows = resolveAgentRows(
      DEFAULT_SIDEBAR_CONFIG.agents,
      agentTokenContext(pane, { workspaceLabel: "herdr-web", tabLabel: "CLI" }),
    );
    const container = await renderAgentRow(
      pane,
      rows,
      "host-a · herdr-web · CLI · project · Reviewing",
    );
    const button = container.querySelector<HTMLButtonElement>(".agent-row");

    expect({
      title: button?.title,
      rows: [...container.querySelectorAll(".sb-row")].map(
        (row) => row.textContent,
      ),
      childClassNames: [...(button?.children ?? [])].map(
        (element) => element.getAttribute("class"),
      ),
      leadingClassNames: [...(button?.querySelector(".agent-row-leading")?.children ?? [])].map(
        (element) => element.getAttribute("class"),
      ),
      statusBadge: container.querySelector(".pane-word")?.textContent,
    }).toStrictEqual({
      title: "host-a · herdr-web · CLI · project · Reviewing",
      rows: ["● herdr-web · CLI", "claude"],
      childClassNames: [
        "agent-row-leading",
        "sb-rows",
        "pane-word",
      ],
      leadingClassNames: [
        "agent-icon agent-icon-claude",
        "lucide lucide-pin agent-pin-indicator",
      ],
      statusBadge: "working",
    });
  });

  it("suppresses the status badge when the token rows contain state text", async () => {
    const pane = agentPane();
    const config = parseSidebarConfig({
      agents: {
        rows: [["state_icon", "workspace", "state_text"], ["agent"]],
      },
    });
    const rows = resolveAgentRows(
      config.agents,
      agentTokenContext(pane, { workspaceLabel: "herdr-web", tabLabel: "CLI" }),
    );
    const container = await renderAgentRow(pane, rows, "Agent details");

    expect({
      rows: [...container.querySelectorAll(".sb-row")].map(
        (row) => row.textContent,
      ),
      statusBadge: container.querySelector(".pane-word")?.textContent,
    }).toStrictEqual({
      rows: ["● herdr-web · Reviewing", "claude"],
      statusBadge: undefined,
    });
  });
});

async function renderRows(
  rows: ResolvedRow[],
  status: "blocked" | "working" | "done" | "idle" | "unknown",
  variant: "space" | "agent",
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(
      <SidebarTokenRows rows={rows} status={status} variant={variant} />,
    );
  });

  return container;
}

async function renderSpaceRow(
  workspace: WorkspaceInfo,
  rows: ResolvedRow[],
  subtitle: string,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(
      <SpaceRow
        workspace={workspace}
        rows={rows}
        subtitle={subtitle}
        active
        attention={2}
        index={0}
        reorderMember={false}
        reorderSource={false}
        reorderBusy={false}
        dropBefore={false}
        dropAfter={false}
        rowRef={vi.fn()}
        onSelect={vi.fn()}
        onMenu={vi.fn()}
        onReorderPointerDown={vi.fn()}
        onReorderPointerMove={vi.fn()}
        onReorderPointerUp={vi.fn()}
        onReorderPointerCancel={vi.fn()}
        onReorderKeyDown={vi.fn()}
        onCancelReorder={vi.fn()}
      />,
    );
  });

  return container;
}

async function renderAgentRow(
  pane: PaneInfo,
  rows: ResolvedRow[],
  subtitle: string,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(
      <AgentRow
        pane={pane}
        rows={rows}
        subtitle={subtitle}
        pinned
        active
        index={0}
        onSelect={vi.fn()}
        onMenu={vi.fn()}
      />,
    );
  });

  return container;
}

function agentPane(): PaneInfo {
  return {
    pane_id: "pane-100",
    terminal_id: "terminal-100",
    workspace_id: "workspace-100",
    tab_id: "tab-100",
    focused: true,
    foreground_cwd: "/work/project",
    agent: "claude",
    display_agent: "claude",
    agent_status: "working",
    state_labels: { working: "Reviewing" },
    revision: 1,
  };
}

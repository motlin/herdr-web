/** TUI-compatible sidebar token configuration parsing, without bridge or React dependencies. */

import { statusLabel } from "./state";
import type { AgentStatus, PaneInfo, WorkspaceInfo } from "./types";

export const MAX_SIDEBAR_ROWS = 16;
export const MAX_SIDEBAR_TOKENS_PER_ROW = 16;

export interface SidebarTokenStyle {
  fg?: string;
  bold?: boolean;
  dim?: boolean;
}

export type SpaceTokenName =
  | "state_icon"
  | "state_text"
  | "workspace"
  | "branch"
  | "git_status";

export type AgentTokenName =
  | "state_icon"
  | "state_text"
  | "workspace"
  | "tab"
  | "pane"
  | "agent"
  | "terminal_title"
  | "terminal_title_stripped";

export type TokenSpec<TokenName extends string> =
  | {
      kind: "builtin";
      name: TokenName;
      style: SidebarTokenStyle;
    }
  | {
      kind: "custom";
      name: string;
      style: SidebarTokenStyle;
    };

export type SpaceTokenSpec = TokenSpec<SpaceTokenName>;
export type AgentTokenSpec = TokenSpec<AgentTokenName>;

export interface SpacesSidebarConfig {
  rows: SpaceTokenSpec[][];
  rowGap: number;
}

export interface AgentsSidebarConfig {
  rows: AgentTokenSpec[][];
  rowsByAgent: Record<string, AgentTokenSpec[][]>;
  rowGap: number;
}

export interface SidebarConfig {
  spaces: SpacesSidebarConfig;
  agents: AgentsSidebarConfig;
}

export type ResolvedTokenKind =
  | { type: "state_icon" }
  | { type: "state_text"; text: string }
  | { type: "workspace"; text: string }
  | { type: "tab"; text: string }
  | { type: "pane"; text: string }
  | { type: "agent"; text: string }
  | { type: "terminal_title"; text: string }
  | { type: "branch"; text: string }
  | { type: "git_status"; ahead: number; behind: number }
  | { type: "custom"; text: string };

export interface ResolvedToken {
  kind: ResolvedTokenKind;
  style: SidebarTokenStyle;
}

export type ResolvedRow = ResolvedToken[];

export interface SpaceTokenContext {
  workspace: string;
  stateText: string;
  branch?: string;
  ahead?: number;
  behind?: number;
  tokens?: Record<string, string>;
  suppressGitDetails?: boolean;
}

export interface AgentTokenContext {
  stateText: string;
  agentId?: string;
  workspace?: string;
  tab?: string;
  pane?: string;
  agent?: string;
  terminalTitle?: string;
  terminalTitleStripped?: string;
  tokens?: Record<string, string>;
}

const SPACE_TOKEN_NAMES = new Set<SpaceTokenName>([
  "state_icon",
  "state_text",
  "workspace",
  "branch",
  "git_status",
]);

const AGENT_TOKEN_NAMES = new Set<AgentTokenName>([
  "state_icon",
  "state_text",
  "workspace",
  "tab",
  "pane",
  "agent",
  "terminal_title",
  "terminal_title_stripped",
]);

export const DEFAULT_SIDEBAR_CONFIG: SidebarConfig = {
  spaces: {
    rows: [
      [builtinToken("state_icon"), builtinToken("workspace")],
      [builtinToken("branch"), builtinToken("git_status")],
    ],
    rowGap: 0,
  },
  agents: {
    rows: [
      [
        builtinToken("state_icon"),
        builtinToken("workspace"),
        builtinToken("tab"),
      ],
      [builtinToken("agent")],
    ],
    rowsByAgent: {},
    rowGap: 0,
  },
};

export function parseSidebarConfig(value: unknown): SidebarConfig {
  const body = configBody(value);
  if (!body) {
    return DEFAULT_SIDEBAR_CONFIG;
  }

  return {
    spaces: parseSpacesConfig(body.spaces),
    agents: parseAgentsConfig(body.agents),
  };
}

export function resolveSpaceRows(
  config: SpacesSidebarConfig,
  context: SpaceTokenContext,
): ResolvedRow[] {
  return resolveRows(config.rows, (token) => resolveSpaceToken(token, context));
}

export function resolveAgentRows(
  config: AgentsSidebarConfig,
  context: AgentTokenContext,
): ResolvedRow[] {
  const rows = context.agentId === undefined
    ? config.rows
    : (config.rowsByAgent[context.agentId] ?? config.rows);
  return resolveRows(rows, (token) => resolveAgentToken(token, context));
}

export function tokenSeparator(
  previous: ResolvedToken,
  current: ResolvedToken,
): " " | " · " {
  return previous.kind.type === "state_icon" || current.kind.type === "git_status"
    ? " "
    : " · ";
}

export function statusGlyph(status: AgentStatus): "●" | "○" | "·" {
  switch (status) {
    case "blocked":
    case "working":
    case "done":
      return "●";
    case "idle":
      return "○";
    case "unknown":
      return "·";
  }
}

export function shouldShowTabToken(
  tabCount: number,
  tabHasCustomName: boolean,
): boolean {
  return tabCount > 1 || tabHasCustomName;
}

export function rowsContainStateText(rows: ResolvedRow[]): boolean {
  return rows.some((row) => row.some((token) => token.kind.type === "state_text"));
}

export function spaceTokenContext(
  workspace: WorkspaceInfo,
  options: { suppressGitDetails?: boolean } = {},
): SpaceTokenContext {
  return {
    workspace: workspace.label,
    stateText: statusLabel(workspace.agent_status),
    branch: workspace.git?.branch,
    ahead: workspace.git?.ahead,
    behind: workspace.git?.behind,
    tokens: workspace.tokens,
    suppressGitDetails: options.suppressGitDetails,
  };
}

export function agentTokenContext(
  pane: PaneInfo,
  labels: { workspaceLabel?: string; tabLabel?: string },
): AgentTokenContext {
  return {
    stateText:
      pane.state_labels?.[pane.agent_status] ?? statusLabel(pane.agent_status),
    agentId: pane.agent,
    workspace: labels.workspaceLabel,
    tab: labels.tabLabel,
    pane: pane.label,
    agent: pane.display_agent ?? pane.agent,
    terminalTitle: pane.terminal_title,
    terminalTitleStripped: pane.terminal_title_stripped,
    tokens: pane.tokens,
  };
}

function resolveRows<TokenName extends string>(
  rows: TokenSpec<TokenName>[][],
  resolveToken: (token: TokenSpec<TokenName>) => ResolvedTokenKind | undefined,
): ResolvedRow[] {
  return rows.flatMap((row) => {
    const resolved = row.flatMap((token) => {
      const kind = resolveToken(token);
      return kind ? [{ kind, style: token.style }] : [];
    });
    return resolved.length > 0 ? [resolved] : [];
  });
}

function resolveSpaceToken(
  token: SpaceTokenSpec,
  context: SpaceTokenContext,
): ResolvedTokenKind | undefined {
  if (token.kind === "custom") {
    return textToken("custom", context.tokens?.[token.name]);
  }

  switch (token.name) {
    case "state_icon":
      return { type: "state_icon" };
    case "state_text":
      return { type: "state_text", text: context.stateText };
    case "workspace":
      return { type: "workspace", text: context.workspace };
    case "branch":
      return context.suppressGitDetails
        ? undefined
        : textToken("branch", context.branch);
    case "git_status": {
      if (
        context.suppressGitDetails ||
        (context.ahead === undefined && context.behind === undefined)
      ) {
        return undefined;
      }
      const ahead = context.ahead ?? 0;
      const behind = context.behind ?? 0;
      return ahead === 0 && behind === 0
        ? undefined
        : { type: "git_status", ahead, behind };
    }
  }
}

function resolveAgentToken(
  token: AgentTokenSpec,
  context: AgentTokenContext,
): ResolvedTokenKind | undefined {
  if (token.kind === "custom") {
    return textToken("custom", context.tokens?.[token.name]);
  }

  switch (token.name) {
    case "state_icon":
      return { type: "state_icon" };
    case "state_text":
      return { type: "state_text", text: context.stateText };
    case "workspace":
      return textToken("workspace", context.workspace);
    case "tab":
      return textToken("tab", context.tab);
    case "pane":
      return textToken("pane", context.pane);
    case "agent":
      return textToken("agent", context.agent);
    case "terminal_title":
      return textToken("terminal_title", context.terminalTitle);
    case "terminal_title_stripped":
      return textToken("terminal_title", context.terminalTitleStripped);
  }
}

function textToken(
  type: "state_text" | "workspace" | "tab" | "pane" | "agent" | "terminal_title" | "branch" | "custom",
  text: string | undefined,
): ResolvedTokenKind | undefined {
  return text === undefined ? undefined : { type, text };
}

function configBody(value: unknown): UnknownRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  if (hasOwn(value, "sidebar")) {
    return isRecord(value.sidebar) ? value.sidebar : null;
  }
  return hasOwn(value, "spaces") || hasOwn(value, "agents") ? value : null;
}

function parseSpacesConfig(value: unknown): SpacesSidebarConfig {
  if (!isRecord(value)) {
    return DEFAULT_SIDEBAR_CONFIG.spaces;
  }
  return {
    rows: parseRows(value.rows, SPACE_TOKEN_NAMES, DEFAULT_SIDEBAR_CONFIG.spaces.rows),
    rowGap: parseRowGap(value.row_gap),
  };
}

function parseAgentsConfig(value: unknown): AgentsSidebarConfig {
  if (!isRecord(value)) {
    return DEFAULT_SIDEBAR_CONFIG.agents;
  }
  return {
    rows: parseRows(value.rows, AGENT_TOKEN_NAMES, DEFAULT_SIDEBAR_CONFIG.agents.rows),
    rowsByAgent: parseRowsByAgent(value.rows_by_agent),
    rowGap: parseRowGap(value.row_gap),
  };
}

function parseRows<TokenName extends string>(
  value: unknown,
  builtinNames: ReadonlySet<TokenName>,
  defaultRows: TokenSpec<TokenName>[][],
): TokenSpec<TokenName>[][] {
  if (!Array.isArray(value)) {
    return defaultRows;
  }

  return value.slice(0, MAX_SIDEBAR_ROWS).flatMap((row) => {
    if (!Array.isArray(row)) {
      return [];
    }
    return [
      row
        .slice(0, MAX_SIDEBAR_TOKENS_PER_ROW)
        .flatMap((token) => {
          const parsed = parseToken(token, builtinNames);
          return parsed ? [parsed] : [];
        }),
    ];
  });
}

function parseRowsByAgent(value: unknown): Record<string, AgentTokenSpec[][]> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([agent, rows]) => {
      if (!Array.isArray(rows)) {
        return [];
      }
      return [[agent, parseRows(rows, AGENT_TOKEN_NAMES, [])]];
    }),
  );
}

function parseToken<TokenName extends string>(
  value: unknown,
  builtinNames: ReadonlySet<TokenName>,
): TokenSpec<TokenName> | null {
  if (typeof value === "string") {
    return tokenFromName(value, {}, builtinNames);
  }
  if (!isRecord(value) || typeof value.token !== "string") {
    return null;
  }

  const style = parseStyle(value);
  return style ? tokenFromName(value.token, style, builtinNames) : null;
}

function tokenFromName<TokenName extends string>(
  name: string,
  style: SidebarTokenStyle,
  builtinNames: ReadonlySet<TokenName>,
): TokenSpec<TokenName> | null {
  if (builtinNames.has(name as TokenName)) {
    return { kind: "builtin", name: name as TokenName, style };
  }
  if (!isValidCustomTokenName(name)) {
    return null;
  }
  return { kind: "custom", name: name.slice(1), style };
}

function parseStyle(value: UnknownRecord): SidebarTokenStyle | null {
  const style: SidebarTokenStyle = {};
  if (hasOwn(value, "fg")) {
    if (typeof value.fg !== "string") {
      return null;
    }
    const fg = normalizeColor(value.fg);
    if (!fg) {
      return null;
    }
    style.fg = fg;
  }
  if (hasOwn(value, "bold")) {
    if (typeof value.bold !== "boolean") {
      return null;
    }
    style.bold = value.bold;
  }
  if (hasOwn(value, "dim")) {
    if (typeof value.dim !== "boolean") {
      return null;
    }
    style.dim = value.dim;
  }
  return style;
}

function normalizeColor(value: string): string | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/iu.exec(value);
  if (!match) {
    return null;
  }
  const digits = match[1].toLowerCase();
  return digits.length === 3
    ? `#${[...digits].map((digit) => `${digit}${digit}`).join("")}`
    : `#${digits}`;
}

function parseRowGap(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 65_535
    ? Number(value)
    : 0;
}

function isValidCustomTokenName(value: string): boolean {
  return /^\$[a-z0-9_-]{1,32}$/iu.test(value);
}

function builtinToken<TokenName extends string>(name: TokenName): TokenSpec<TokenName> {
  return { kind: "builtin", name, style: {} };
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

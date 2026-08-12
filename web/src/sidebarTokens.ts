/** TUI-compatible sidebar token configuration parsing, without bridge or React dependencies. */

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

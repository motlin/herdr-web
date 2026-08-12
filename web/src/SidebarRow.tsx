import { Fragment, type CSSProperties, type ReactElement } from "react";
import {
  statusGlyph,
  tokenSeparator,
  type ResolvedRow,
  type ResolvedToken,
  type SidebarTokenStyle,
} from "./sidebarTokens";
import type { AgentStatus } from "./types";

interface SidebarTokenRowsProps {
  rows: ResolvedRow[];
  status: AgentStatus;
  variant: "space" | "agent";
  rowGap?: number;
}

type SidebarRowsStyle = CSSProperties & {
  "--sb-row-gap"?: string;
};

export function SidebarTokenRows({
  rows,
  status,
  variant,
  rowGap = 0,
}: SidebarTokenRowsProps) {
  const rowsStyle: SidebarRowsStyle = {
    "--sb-row-gap": rowGap ? `${rowGap * 14}px` : undefined,
  };

  return (
    <span className="sb-rows" data-variant={variant} style={rowsStyle}>
      {rows.map((row, rowIndex) => (
        <span className="sb-row" data-row={rowIndex} key={rowIndex}>
          {row.map((token, tokenIndex) => (
            <Fragment key={tokenIndex}>
              {tokenIndex > 0 && (
                <span className="sb-sep" aria-hidden="true">
                  {tokenSeparator(row[tokenIndex - 1], token)}
                </span>
              )}
              {tokenElement(token, status)}
            </Fragment>
          ))}
        </span>
      ))}
    </span>
  );
}

export function sidebarRowsText(rows: ResolvedRow[]): string {
  return rows
    .map((row) => row.filter((token) => token.kind.type !== "state_icon"))
    .filter((row) => row.length > 0)
    .map((row) => rowText(row))
    .join("\n");
}

export function tokenStyleProps(style: SidebarTokenStyle): CSSProperties {
  return {
    color: style.fg,
    fontWeight:
      style.bold === undefined ? undefined : style.bold ? 700 : 400,
    opacity: style.dim === undefined ? undefined : style.dim ? 0.65 : 1,
  };
}

function tokenElement(
  token: ResolvedToken,
  status: AgentStatus,
): ReactElement {
  const style = tokenStyleProps(token.style);

  if (token.kind.type === "state_icon") {
    return (
      <span className="sb-dot" data-status={status} style={style}>
        {statusGlyph(status)}
      </span>
    );
  }

  if (token.kind.type === "git_status") {
    return (
      <span className="sb-git" style={style}>
        {token.kind.ahead > 0 && (
          <span className="sb-ahead">↑{token.kind.ahead}</span>
        )}
        {token.kind.ahead > 0 && token.kind.behind > 0 && " "}
        {token.kind.behind > 0 && (
          <span className="sb-behind">↓{token.kind.behind}</span>
        )}
      </span>
    );
  }

  return (
    <span
      className="sb-tok"
      data-token={token.kind.type}
      style={style}
    >
      {token.kind.text}
    </span>
  );
}

function rowText(row: ResolvedRow): string {
  return row
    .map((token, index) => {
      const separator = index > 0
        ? tokenSeparator(row[index - 1], token)
        : "";
      return `${separator}${tokenText(token)}`;
    })
    .join("");
}

function tokenText(token: ResolvedToken): string {
  if (token.kind.type === "state_icon") {
    return "";
  }
  if (token.kind.type === "git_status") {
    const ahead = token.kind.ahead > 0 ? `↑${token.kind.ahead}` : "";
    const behind = token.kind.behind > 0 ? `↓${token.kind.behind}` : "";
    return [ahead, behind].filter(Boolean).join(" ");
  }
  return token.kind.text;
}

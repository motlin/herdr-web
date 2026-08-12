//! Herdr TUI sidebar configuration parsing for the web bridge.
//!
//! Unlike upstream Herdr, `rows_by_agent` accepts any agent id matching
//! `^[a-z0-9][a-z0-9_-]{0,31}$`. Herdr's agent enum changes between releases, while an unmatched
//! override is inert in the web client, so preserving a valid future id is safer than rejecting the
//! complete sidebar configuration.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub(crate) const CONFIG_PATH_ENV_VAR: &str = "HERDR_CONFIG_PATH";

const MAX_CONFIG_BYTES: u64 = 1024 * 1024;
const MAX_SIDEBAR_ROWS: usize = 16;
const MAX_SIDEBAR_TOKENS_PER_ROW: usize = 16;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct SidebarToken {
    pub(crate) token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) fg: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bold: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) dim: Option<bool>,
}

impl SidebarToken {
    fn plain(token: &str) -> Self {
        Self {
            token: token.to_string(),
            fg: None,
            bold: None,
            dim: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct SpacesSidebarConfig {
    pub(crate) rows: Vec<Vec<SidebarToken>>,
    pub(crate) row_gap: u16,
}

impl Default for SpacesSidebarConfig {
    fn default() -> Self {
        Self {
            rows: vec![
                vec![
                    SidebarToken::plain("state_icon"),
                    SidebarToken::plain("workspace"),
                ],
                vec![
                    SidebarToken::plain("branch"),
                    SidebarToken::plain("git_status"),
                ],
            ],
            row_gap: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct AgentsSidebarConfig {
    pub(crate) rows: Vec<Vec<SidebarToken>>,
    pub(crate) rows_by_agent: BTreeMap<String, Vec<Vec<SidebarToken>>>,
    pub(crate) row_gap: u16,
}

impl Default for AgentsSidebarConfig {
    fn default() -> Self {
        Self {
            rows: vec![
                vec![
                    SidebarToken::plain("state_icon"),
                    SidebarToken::plain("workspace"),
                    SidebarToken::plain("tab"),
                ],
                vec![SidebarToken::plain("agent")],
            ],
            rows_by_agent: BTreeMap::new(),
            row_gap: 0,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub(crate) struct SidebarLayout {
    pub(crate) spaces: SpacesSidebarConfig,
    pub(crate) agents: AgentsSidebarConfig,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SidebarConfigSource {
    Defaults,
    Config,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LoadedSidebarConfig {
    pub(crate) layout: SidebarLayout,
    pub(crate) source: SidebarConfigSource,
    pub(crate) path: PathBuf,
    pub(crate) diagnostic: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct GitRefreshDemand {
    pub(crate) branch: bool,
    pub(crate) ahead_behind: bool,
}

#[derive(Debug, Default, Deserialize)]
struct RawConfigRoot {
    ui: Option<RawUiConfig>,
}

#[derive(Debug, Deserialize)]
struct RawUiConfig {
    sidebar: Option<RawSidebarLayout>,
}

#[derive(Debug, Deserialize)]
struct RawSidebarLayout {
    spaces: Option<RawSpacesSidebarConfig>,
    agents: Option<RawAgentsSidebarConfig>,
}

#[derive(Debug, Deserialize)]
struct RawSpacesSidebarConfig {
    rows: Option<Vec<Vec<RawSidebarToken>>>,
    row_gap: Option<u16>,
}

#[derive(Debug, Deserialize)]
struct RawAgentsSidebarConfig {
    rows: Option<Vec<Vec<RawSidebarToken>>>,
    rows_by_agent: Option<BTreeMap<String, Vec<Vec<RawSidebarToken>>>>,
    row_gap: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum RawSidebarToken {
    Plain(String),
    Styled(RawStyledSidebarToken),
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawStyledSidebarToken {
    token: String,
    fg: Option<String>,
    bold: Option<bool>,
    dim: Option<bool>,
}

pub(crate) fn load_sidebar_config() -> LoadedSidebarConfig {
    let path = sidebar_config_path();
    load_sidebar_config_from_path(path)
}

fn sidebar_config_path() -> PathBuf {
    std::env::var(CONFIG_PATH_ENV_VAR)
        .ok()
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| herdr_compat::config::config_dir().join("config.toml"))
}

fn load_sidebar_config_from_path(path: PathBuf) -> LoadedSidebarConfig {
    let metadata = match std::fs::metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) => {
            return fallback(
                path,
                format!("could not read sidebar config metadata: {error}"),
            )
        }
    };
    if metadata.len() > MAX_CONFIG_BYTES {
        return fallback(
            path,
            format!("sidebar config exceeds the {MAX_CONFIG_BYTES}-byte size limit"),
        );
    }

    let contents = match std::fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(error) => return fallback(path, format!("could not read sidebar config: {error}")),
    };
    let root = match toml::from_str::<RawConfigRoot>(&contents) {
        Ok(root) => root,
        Err(error) => return fallback(path, format!("could not parse sidebar config: {error}")),
    };
    let Some(raw_sidebar) = root.ui.and_then(|ui| ui.sidebar) else {
        return LoadedSidebarConfig {
            layout: SidebarLayout::default(),
            source: SidebarConfigSource::Defaults,
            path,
            diagnostic: None,
        };
    };
    let layout = match parse_sidebar_layout(raw_sidebar) {
        Ok(layout) => layout,
        Err(error) => return fallback(path, error),
    };

    LoadedSidebarConfig {
        layout,
        source: SidebarConfigSource::Config,
        path,
        diagnostic: None,
    }
}

fn fallback(path: PathBuf, diagnostic: String) -> LoadedSidebarConfig {
    LoadedSidebarConfig {
        layout: SidebarLayout::default(),
        source: SidebarConfigSource::Defaults,
        path,
        diagnostic: Some(diagnostic),
    }
}

fn parse_sidebar_layout(raw: RawSidebarLayout) -> Result<SidebarLayout, String> {
    let spaces = match raw.spaces {
        Some(raw) => parse_spaces_config(raw)?,
        None => SpacesSidebarConfig::default(),
    };
    let agents = match raw.agents {
        Some(raw) => parse_agents_config(raw)?,
        None => AgentsSidebarConfig::default(),
    };
    Ok(SidebarLayout { spaces, agents })
}

fn parse_spaces_config(raw: RawSpacesSidebarConfig) -> Result<SpacesSidebarConfig, String> {
    let defaults = SpacesSidebarConfig::default();
    let rows = match raw.rows {
        Some(rows) => parse_rows(rows, SPACE_BUILTIN_TOKENS)?,
        None => defaults.rows,
    };
    Ok(SpacesSidebarConfig {
        rows,
        row_gap: raw.row_gap.unwrap_or(defaults.row_gap),
    })
}

fn parse_agents_config(raw: RawAgentsSidebarConfig) -> Result<AgentsSidebarConfig, String> {
    let defaults = AgentsSidebarConfig::default();
    let rows = match raw.rows {
        Some(rows) => parse_rows(rows, AGENT_BUILTIN_TOKENS)?,
        None => defaults.rows,
    };
    let mut rows_by_agent = BTreeMap::new();
    for (agent_id, rows) in raw.rows_by_agent.unwrap_or_default() {
        if !valid_agent_id(&agent_id) {
            return Err(format!(
                "invalid sidebar rows_by_agent id `{agent_id}`; expected 1-32 lowercase ASCII letters, digits, '_', or '-'"
            ));
        }
        rows_by_agent.insert(agent_id, parse_rows(rows, AGENT_BUILTIN_TOKENS)?);
    }
    Ok(AgentsSidebarConfig {
        rows,
        rows_by_agent,
        row_gap: raw.row_gap.unwrap_or(defaults.row_gap),
    })
}

fn parse_rows(
    rows: Vec<Vec<RawSidebarToken>>,
    builtin_tokens: &[&str],
) -> Result<Vec<Vec<SidebarToken>>, String> {
    validate_row_limits(&rows)?;
    rows.into_iter()
        .map(|row| {
            row.into_iter()
                .map(|token| parse_token(token, builtin_tokens))
                .collect()
        })
        .collect()
}

fn validate_row_limits<T>(rows: &[Vec<T>]) -> Result<(), String> {
    if rows.len() > MAX_SIDEBAR_ROWS {
        return Err(format!(
            "sidebar layouts may contain at most {MAX_SIDEBAR_ROWS} rows"
        ));
    }
    if rows
        .iter()
        .any(|row| row.len() > MAX_SIDEBAR_TOKENS_PER_ROW)
    {
        return Err(format!(
            "sidebar rows may contain at most {MAX_SIDEBAR_TOKENS_PER_ROW} tokens"
        ));
    }
    Ok(())
}

fn parse_token(raw: RawSidebarToken, builtin_tokens: &[&str]) -> Result<SidebarToken, String> {
    let (token, fg, bold, dim) = match raw {
        RawSidebarToken::Plain(token) => (token, None, None, None),
        RawSidebarToken::Styled(styled) => (
            styled.token,
            styled.fg.map(|color| normalize_color(&color)).transpose()?,
            styled.bold,
            styled.dim,
        ),
    };
    validate_token(&token, builtin_tokens)?;
    Ok(SidebarToken {
        token,
        fg,
        bold,
        dim,
    })
}

fn validate_token(token: &str, builtin_tokens: &[&str]) -> Result<(), String> {
    if builtin_tokens.contains(&token) {
        return Ok(());
    }
    let Some(name) = token.strip_prefix('$') else {
        return Err(format!(
            "unknown sidebar token `{token}`; custom tokens must start with `$`"
        ));
    };
    if name.is_empty()
        || name.len() > 32
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Err(format!("invalid custom sidebar token `{token}`"));
    }
    Ok(())
}

fn normalize_color(color: &str) -> Result<String, String> {
    let Some(hex) = color.strip_prefix('#').filter(|hex| {
        hex.is_ascii()
            && matches!(hex.len(), 3 | 6)
            && hex.bytes().all(|byte| byte.is_ascii_hexdigit())
    }) else {
        return Err("sidebar token fg must be #RGB or #RRGGBB".to_string());
    };
    if hex.len() == 3 {
        let expanded = hex
            .chars()
            .flat_map(|character| [character, character])
            .collect::<String>();
        Ok(format!("#{expanded}").to_ascii_lowercase())
    } else {
        Ok(color.to_ascii_lowercase())
    }
}

fn valid_agent_id(agent_id: &str) -> bool {
    let bytes = agent_id.as_bytes();
    matches!(bytes.len(), 1..=32)
        && (bytes[0].is_ascii_lowercase() || bytes[0].is_ascii_digit())
        && bytes.iter().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'_' | b'-')
        })
}

pub(crate) fn git_refresh_demand(layout: &SidebarLayout) -> GitRefreshDemand {
    let mut demand = GitRefreshDemand::default();
    for token in layout.spaces.rows.iter().flatten() {
        match token.token.as_str() {
            "branch" => demand.branch = true,
            "git_status" => demand.ahead_behind = true,
            _ => {}
        }
    }
    demand
}

const SPACE_BUILTIN_TOKENS: &[&str] = &[
    "state_icon",
    "state_text",
    "workspace",
    "branch",
    "git_status",
];
const AGENT_BUILTIN_TOKENS: &[&str] = &[
    "state_icon",
    "state_text",
    "workspace",
    "tab",
    "pane",
    "agent",
    "terminal_title",
    "terminal_title_stripped",
];

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde_json::json;

    use super::*;
    use crate::session::TEST_ENV_LOCK;

    #[test]
    fn defaults_match_the_tui_sidebar_layouts() {
        assert_eq!(
            SidebarLayout::default(),
            SidebarLayout {
                spaces: SpacesSidebarConfig {
                    rows: vec![
                        vec![token("state_icon"), token("workspace")],
                        vec![token("branch"), token("git_status")],
                    ],
                    row_gap: 0,
                },
                agents: AgentsSidebarConfig {
                    rows: vec![
                        vec![token("state_icon"), token("workspace"), token("tab")],
                        vec![token("agent")],
                    ],
                    rows_by_agent: BTreeMap::new(),
                    row_gap: 0,
                },
            }
        );
    }

    #[test]
    fn missing_config_file_serves_defaults() {
        let root = temp_test_dir("missing-config");
        let path = root.join("missing.toml");

        let loaded = load_with_config_path(&path);

        assert_eq!(loaded.layout, SidebarLayout::default());
        assert_eq!(loaded.source, SidebarConfigSource::Defaults);
        assert!(loaded.diagnostic.is_some());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn config_without_ui_sidebar_section_serves_defaults() {
        let root = temp_test_dir("without-sidebar");
        let path = write_config(
            &root,
            r#"
[ui]
theme = "one-dark"

[unrelated]
value = [{ nested = "ignored" }]
"#,
        );

        let loaded = load_with_config_path(&path);

        assert_eq!(loaded.layout, SidebarLayout::default());
        assert_eq!(loaded.source, SidebarConfigSource::Defaults);
        assert_eq!(loaded.diagnostic, None);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn partial_sidebar_section_keeps_defaults_for_the_other_panel() {
        let root = temp_test_dir("partial-sidebar");
        let path = write_config(
            &root,
            r#"
[ui.sidebar.spaces]
rows = [["workspace"]]
row_gap = 2
"#,
        );

        let loaded = load_with_config_path(&path);

        assert_eq!(
            loaded.layout,
            SidebarLayout {
                spaces: SpacesSidebarConfig {
                    rows: vec![vec![token("workspace")]],
                    row_gap: 2,
                },
                agents: AgentsSidebarConfig::default(),
            }
        );
        assert_eq!(loaded.source, SidebarConfigSource::Config);
        assert_eq!(loaded.diagnostic, None);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn plain_string_tokens_normalize_to_table_form() {
        let root = temp_test_dir("plain-token");
        let path = write_config(
            &root,
            r#"
[ui.sidebar.spaces]
rows = [["state_icon", "$summary"]]
"#,
        );

        let loaded = load_with_config_path(&path);

        assert_eq!(
            serde_json::to_value(loaded.layout.spaces.rows).unwrap(),
            json!([[{"token": "state_icon"}, {"token": "$summary"}]])
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn short_hex_expands_to_six_digits() {
        let root = temp_test_dir("short-hex");
        let path = write_config(
            &root,
            r##"
[ui.sidebar.agents]
rows = [[{ token = "workspace", fg = "#AbC", bold = true, dim = false }]]
"##,
        );

        let loaded = load_with_config_path(&path);

        assert_eq!(
            loaded.layout.agents.rows,
            vec![vec![SidebarToken {
                token: "workspace".to_string(),
                fg: Some("#aabbcc".to_string()),
                bold: Some(true),
                dim: Some(false),
            }]]
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unknown_token_without_dollar_prefix_falls_back_to_defaults_with_diagnostic() {
        let root = temp_test_dir("unknown-token");
        let path = write_config(
            &root,
            r#"
[ui.sidebar.spaces]
rows = [["workspace", "summary"]]
"#,
        );

        let loaded = load_with_config_path(&path);

        assert_eq!(loaded.layout, SidebarLayout::default());
        assert_eq!(loaded.source, SidebarConfigSource::Defaults);
        assert!(loaded.diagnostic.is_some());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rows_over_the_limit_fall_back_to_defaults() {
        let root = temp_test_dir("too-many-rows");
        let rows = std::iter::repeat("[\"workspace\"]")
            .take(17)
            .collect::<Vec<_>>()
            .join(", ");
        let path = write_config(&root, &format!("[ui.sidebar.spaces]\nrows = [{rows}]\n"));

        let loaded = load_with_config_path(&path);

        assert_eq!(loaded.layout, SidebarLayout::default());
        assert_eq!(loaded.source, SidebarConfigSource::Defaults);
        assert!(loaded.diagnostic.is_some());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rows_by_agent_overrides_are_exposed_per_agent_id() {
        let root = temp_test_dir("agent-overrides");
        let path = write_config(
            &root,
            r#"
[ui.sidebar.agents]
rows = [["workspace"]]

[ui.sidebar.agents.rows_by_agent]
9-future-agent = [["state_icon", "agent"], ["$summary"]]
"#,
        );

        let loaded = load_with_config_path(&path);

        assert_eq!(
            loaded.layout.agents.rows_by_agent,
            BTreeMap::from([(
                "9-future-agent".to_string(),
                vec![
                    vec![token("state_icon"), token("agent")],
                    vec![token("$summary")],
                ],
            )])
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn syntax_error_falls_back_to_defaults_with_diagnostic() {
        let root = temp_test_dir("syntax-error");
        let path = write_config(&root, "[ui.sidebar.spaces\nrows = [[]]\n");

        let loaded = load_with_config_path(&path);

        assert_eq!(loaded.layout, SidebarLayout::default());
        assert_eq!(loaded.source, SidebarConfigSource::Defaults);
        assert!(loaded.diagnostic.is_some());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn oversized_config_falls_back_to_defaults_with_diagnostic() {
        let root = temp_test_dir("oversized-config");
        let path = root.join("config.toml");
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(MAX_CONFIG_BYTES + 1).unwrap();

        let loaded = load_with_config_path(&path);

        assert_eq!(loaded.layout, SidebarLayout::default());
        assert_eq!(loaded.source, SidebarConfigSource::Defaults);
        assert_eq!(
            loaded.diagnostic,
            Some(format!(
                "sidebar config exceeds the {MAX_CONFIG_BYTES}-byte size limit"
            ))
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn git_refresh_demand_matches_configured_space_tokens() {
        let no_git = SidebarLayout {
            spaces: SpacesSidebarConfig {
                rows: vec![vec![token("workspace")]],
                row_gap: 0,
            },
            agents: AgentsSidebarConfig::default(),
        };
        let branch_only = SidebarLayout {
            spaces: SpacesSidebarConfig {
                rows: vec![vec![token("branch")]],
                row_gap: 0,
            },
            agents: AgentsSidebarConfig::default(),
        };
        let status_only = SidebarLayout {
            spaces: SpacesSidebarConfig {
                rows: vec![vec![token("git_status")]],
                row_gap: 0,
            },
            agents: AgentsSidebarConfig::default(),
        };

        assert_eq!(
            git_refresh_demand(&no_git),
            GitRefreshDemand {
                branch: false,
                ahead_behind: false,
            }
        );
        assert_eq!(
            git_refresh_demand(&branch_only),
            GitRefreshDemand {
                branch: true,
                ahead_behind: false,
            }
        );
        assert_eq!(
            git_refresh_demand(&status_only),
            GitRefreshDemand {
                branch: false,
                ahead_behind: true,
            }
        );
        assert_eq!(
            git_refresh_demand(&SidebarLayout::default()),
            GitRefreshDemand {
                branch: true,
                ahead_behind: true,
            }
        );
    }

    #[test]
    fn sidebar_config_serializes_to_the_documented_json_shape() {
        assert_eq!(
            serde_json::to_value(SidebarLayout::default()).unwrap(),
            json!({
                "spaces": {
                    "rows": [
                        [{"token": "state_icon"}, {"token": "workspace"}],
                        [{"token": "branch"}, {"token": "git_status"}],
                    ],
                    "row_gap": 0,
                },
                "agents": {
                    "rows": [
                        [
                            {"token": "state_icon"},
                            {"token": "workspace"},
                            {"token": "tab"},
                        ],
                        [{"token": "agent"}],
                    ],
                    "rows_by_agent": {},
                    "row_gap": 0,
                },
            })
        );
    }

    fn token(name: &str) -> SidebarToken {
        SidebarToken {
            token: name.to_string(),
            fg: None,
            bold: None,
            dim: None,
        }
    }

    fn load_with_config_path(path: &Path) -> LoadedSidebarConfig {
        let _guard = TEST_ENV_LOCK.lock().unwrap();
        let previous_path = std::env::var(CONFIG_PATH_ENV_VAR).ok();
        std::env::set_var(CONFIG_PATH_ENV_VAR, path);
        let loaded = load_sidebar_config();
        restore_env(CONFIG_PATH_ENV_VAR, previous_path);
        loaded
    }

    fn write_config(root: &Path, contents: &str) -> PathBuf {
        let path = root.join("config.toml");
        std::fs::write(&path, contents).unwrap();
        path
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        let unique = format!(
            "herdr-web-bridge-sidebar-config-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let path = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    fn restore_env(name: &str, value: Option<String>) {
        match value {
            Some(value) => std::env::set_var(name, value),
            None => std::env::remove_var(name),
        }
    }
}

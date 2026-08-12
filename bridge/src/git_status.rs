use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use herdr_compat::api::schema::{PaneInfo, WorkspaceInfo};

use crate::workspace::{git_common_dir_for_git_dir, git_dir_for_repo_root, git_repo_root};

const GIT_COMMAND_TIMEOUT: Duration = Duration::from_secs(5);
const GIT_COMMAND_POLL_INTERVAL: Duration = Duration::from_millis(50);

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct GitWorktreeInfo {
    pub(crate) repo_root: PathBuf,
    pub(crate) git_dir: PathBuf,
    pub(crate) git_common_dir: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct GitStatusFingerprint {
    pub(crate) git_dir: PathBuf,
    pub(crate) git_common_dir: PathBuf,
    pub(crate) head: GitHeadIdentity,
    pub(crate) upstream: Option<GitUpstreamIdentity>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum GitHeadIdentity {
    Branch {
        full_ref: String,
        short_name: String,
        oid: Option<String>,
    },
    Detached {
        oid: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct GitUpstreamIdentity {
    pub(crate) remote: String,
    pub(crate) merge_ref: String,
    pub(crate) full_ref: String,
    pub(crate) oid: Option<String>,
}

impl GitStatusFingerprint {
    pub(crate) fn branch_name(&self) -> Option<&str> {
        match &self.head {
            GitHeadIdentity::Branch { short_name, .. } => Some(short_name),
            GitHeadIdentity::Detached { .. } => None,
        }
    }

    pub(crate) fn head_oid(&self) -> Option<&str> {
        match &self.head {
            GitHeadIdentity::Branch { oid, .. } => oid.as_deref(),
            GitHeadIdentity::Detached { oid } => Some(oid),
        }
    }

    pub(crate) fn upstream_oid(&self) -> Option<&str> {
        self.upstream
            .as_ref()
            .and_then(|upstream| upstream.oid.as_deref())
    }
}

pub(crate) trait GitCommandRunner: Send + Sync {
    fn symbolic_head_full(&self, repo_root: &Path) -> Option<String>;
    fn rev_parse_verify(&self, repo_root: &Path, revision: &str) -> Option<String>;
    fn ahead_behind(
        &self,
        repo_root: &Path,
        head_oid: &str,
        upstream_oid: &str,
    ) -> Option<(usize, usize)>;
}

#[derive(Debug, Default)]
pub(crate) struct SubprocessGit;

impl SubprocessGit {
    fn trimmed_stdout(&self, repo_root: &Path, arguments: &[&str]) -> Option<String> {
        let repo_root = std::fs::canonicalize(repo_root).ok()?;
        if !repo_root.is_absolute() {
            return None;
        }

        let mut child = Command::new("git")
            .arg("-C")
            .arg(repo_root)
            .args(arguments)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .stdout(Stdio::piped())
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_OPTIONAL_LOCKS", "0")
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .env_remove("GIT_INDEX_FILE")
            .env_remove("GIT_ASKPASS")
            .env_remove("SSH_ASKPASS")
            .spawn()
            .ok()?;
        let started = Instant::now();

        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if started.elapsed() < GIT_COMMAND_TIMEOUT => {
                    std::thread::sleep(GIT_COMMAND_POLL_INTERVAL);
                }
                Ok(None) | Err(_) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
            }
        };
        if !status.success() {
            return None;
        }

        let mut output = Vec::new();
        child.stdout.take()?.read_to_end(&mut output).ok()?;
        let output = String::from_utf8(output).ok()?;
        let output = output.trim();
        (!output.is_empty()).then(|| output.to_string())
    }
}

impl GitCommandRunner for SubprocessGit {
    fn symbolic_head_full(&self, repo_root: &Path) -> Option<String> {
        self.trimmed_stdout(repo_root, &["symbolic-ref", "--quiet", "HEAD"])
    }

    fn rev_parse_verify(&self, repo_root: &Path, revision: &str) -> Option<String> {
        self.trimmed_stdout(repo_root, &["rev-parse", "--verify", revision])
    }

    fn ahead_behind(
        &self,
        repo_root: &Path,
        head_oid: &str,
        upstream_oid: &str,
    ) -> Option<(usize, usize)> {
        let range = format!("{head_oid}...{upstream_oid}");
        let output =
            self.trimmed_stdout(repo_root, &["rev-list", "--left-right", "--count", &range])?;
        parse_ahead_behind_output(&output)
    }
}

pub(crate) fn workspace_identity_cwd(
    workspace: &WorkspaceInfo,
    panes: &[PaneInfo],
) -> Option<PathBuf> {
    if let Some(worktree) = &workspace.worktree {
        return Some(PathBuf::from(&worktree.checkout_path));
    }

    panes
        .iter()
        .filter(|pane| pane.workspace_id == workspace.workspace_id)
        .filter_map(|pane| pane.foreground_cwd.as_ref().or(pane.cwd.as_ref()))
        .min()
        .map(PathBuf::from)
}

pub(crate) fn git_worktree_info(cwd: &Path) -> Option<GitWorktreeInfo> {
    let repo_root = canonicalize(git_repo_root(cwd)?)?;
    let git_dir = canonicalize(git_dir_for_repo_root(&repo_root)?)?;
    let git_common_dir = canonicalize(git_common_dir_for_git_dir(&git_dir))?;
    Some(GitWorktreeInfo {
        repo_root,
        git_dir,
        git_common_dir,
    })
}

pub(crate) fn git_status_fingerprint(
    cwd: &Path,
    runner: &dyn GitCommandRunner,
) -> Option<GitStatusFingerprint> {
    let info = git_worktree_info(cwd)?;
    let reftable = git_ref_storage_is_reftable(&info.git_common_dir);
    let head = if reftable {
        read_head_identity_from_runner(&info, runner)?
    } else {
        read_head_identity_from_files(&info)?
    };
    let upstream = match &head {
        GitHeadIdentity::Branch { short_name, .. } => {
            read_upstream_identity(&info, short_name, reftable, runner)
        }
        GitHeadIdentity::Detached { .. } => None,
    };

    Some(GitStatusFingerprint {
        git_dir: info.git_dir,
        git_common_dir: info.git_common_dir,
        head,
        upstream,
    })
}

pub(crate) fn ahead_behind_for_fingerprint(
    repo_root: &Path,
    fingerprint: &GitStatusFingerprint,
    runner: &dyn GitCommandRunner,
) -> Option<(usize, usize)> {
    let head_oid = fingerprint.head_oid()?;
    let upstream_oid = fingerprint.upstream_oid()?;
    let repo_root = canonicalize(repo_root)?;
    runner.ahead_behind(&repo_root, head_oid, upstream_oid)
}

fn canonicalize(path: impl AsRef<Path>) -> Option<PathBuf> {
    std::fs::canonicalize(path).ok()
}

fn read_head_identity_from_files(info: &GitWorktreeInfo) -> Option<GitHeadIdentity> {
    let head = std::fs::read_to_string(info.git_dir.join("HEAD")).ok()?;
    let head = head.trim();
    if let Some(full_ref) = head.strip_prefix("ref: ") {
        let short_name = full_ref.strip_prefix("refs/heads/")?;
        return Some(GitHeadIdentity::Branch {
            full_ref: full_ref.to_string(),
            short_name: short_name.to_string(),
            oid: read_ref_oid(&info.git_common_dir, full_ref),
        });
    }
    (!head.is_empty()).then(|| GitHeadIdentity::Detached {
        oid: head.to_string(),
    })
}

fn read_head_identity_from_runner(
    info: &GitWorktreeInfo,
    runner: &dyn GitCommandRunner,
) -> Option<GitHeadIdentity> {
    if let Some(full_ref) = runner.symbolic_head_full(&info.repo_root) {
        let short_name = full_ref.strip_prefix("refs/heads/")?.to_string();
        let oid = runner.rev_parse_verify(&info.repo_root, &full_ref);
        return Some(GitHeadIdentity::Branch {
            full_ref,
            short_name,
            oid,
        });
    }
    runner
        .rev_parse_verify(&info.repo_root, "HEAD")
        .map(|oid| GitHeadIdentity::Detached { oid })
}

fn read_upstream_identity(
    info: &GitWorktreeInfo,
    branch: &str,
    reftable: bool,
    runner: &dyn GitCommandRunner,
) -> Option<GitUpstreamIdentity> {
    let config = read_branch_config(info, branch)?;
    let full_ref = upstream_full_ref(&config)?;
    let oid = if reftable {
        runner.rev_parse_verify(&info.repo_root, &full_ref)
    } else {
        read_ref_oid(&info.git_common_dir, &full_ref)
    };
    Some(GitUpstreamIdentity {
        remote: config.remote,
        merge_ref: config.merge_ref,
        full_ref,
        oid,
    })
}

fn read_ref_oid(common_dir: &Path, full_ref: &str) -> Option<String> {
    if let Ok(contents) = std::fs::read_to_string(common_dir.join(full_ref)) {
        let oid = contents.trim();
        if !oid.is_empty() {
            return Some(oid.to_string());
        }
    }

    let packed_refs = std::fs::read_to_string(common_dir.join("packed-refs")).ok()?;
    for line in packed_refs.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with('^') {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(oid) = parts.next() else {
            continue;
        };
        let Some(name) = parts.next() else {
            continue;
        };
        if name == full_ref {
            return Some(oid.to_string());
        }
    }
    None
}

fn git_ref_storage_is_reftable(common_dir: &Path) -> bool {
    read_config_value(&common_dir.join("config"), "extensions", "refstorage")
        .is_some_and(|value| value.eq_ignore_ascii_case("reftable"))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct BranchConfig {
    remote: String,
    merge_ref: String,
    fetch_refspecs: Vec<(String, String)>,
}

fn read_branch_config(info: &GitWorktreeInfo, branch: &str) -> Option<BranchConfig> {
    let common_config = info.git_common_dir.join("config");
    let mut config = BranchConfig {
        remote: String::new(),
        merge_ref: String::new(),
        fetch_refspecs: Vec::new(),
    };
    merge_local_config(&mut config, &common_config, branch);
    if worktree_config_enabled(&common_config) {
        merge_local_config(&mut config, &info.git_dir.join("config.worktree"), branch);
    }
    (!config.remote.is_empty() && !config.merge_ref.is_empty()).then_some(config)
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ConfigSection {
    Branch,
    Remote(String),
    Other,
}

fn merge_local_config(config: &mut BranchConfig, path: &Path, branch: &str) {
    let Ok(contents) = std::fs::read_to_string(path) else {
        return;
    };
    let mut section = ConfigSection::Other;
    for raw_line in contents.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if let Some(section_name) = extract_config_section(line) {
            section = if quoted_config_subsection(section_name, "branch") == Some(branch) {
                ConfigSection::Branch
            } else if let Some(remote) = quoted_config_subsection(section_name, "remote") {
                ConfigSection::Remote(remote.to_string())
            } else {
                ConfigSection::Other
            };
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = normalize_config_value(value);
        match &section {
            ConfigSection::Branch if key.eq_ignore_ascii_case("remote") => config.remote = value,
            ConfigSection::Branch if key.eq_ignore_ascii_case("merge") => {
                config.merge_ref = value;
            }
            ConfigSection::Remote(remote) if key.eq_ignore_ascii_case("fetch") => {
                config.fetch_refspecs.push((remote.clone(), value));
            }
            _ => {}
        }
    }
}

fn worktree_config_enabled(path: &Path) -> bool {
    let Ok(contents) = std::fs::read_to_string(path) else {
        return false;
    };
    let mut in_extensions = false;
    let mut enabled = false;
    for raw_line in contents.lines() {
        let line = raw_line.trim();
        if let Some(section) = extract_config_section(line) {
            in_extensions = section.eq_ignore_ascii_case("extensions");
            continue;
        }
        if !in_extensions {
            continue;
        }
        if line.eq_ignore_ascii_case("worktreeConfig") {
            enabled = true;
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim().eq_ignore_ascii_case("worktreeConfig") {
            enabled = matches!(
                normalize_config_value(value).to_ascii_lowercase().as_str(),
                "true" | "1" | "yes" | "on"
            );
        }
    }
    enabled
}

fn read_config_value(path: &Path, section: &str, key: &str) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;
    let mut in_section = false;
    for raw_line in contents.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if let Some(section_name) = extract_config_section(line) {
            in_section = section_name.eq_ignore_ascii_case(section);
            continue;
        }
        if !in_section {
            continue;
        }
        let Some((name, value)) = line.split_once('=') else {
            continue;
        };
        if name.trim().eq_ignore_ascii_case(key) {
            return Some(normalize_config_value(value));
        }
    }
    None
}

fn extract_config_section(line: &str) -> Option<&str> {
    if !line.starts_with('[') {
        return None;
    }
    let mut in_quotes = false;
    let mut escaped = false;
    for (index, character) in line.char_indices().skip(1) {
        if escaped {
            escaped = false;
            continue;
        }
        match character {
            '\\' if in_quotes => escaped = true,
            '"' => in_quotes = !in_quotes,
            ']' if !in_quotes => {
                let rest = line[index + 1..].trim();
                return (rest.is_empty() || rest.starts_with('#') || rest.starts_with(';'))
                    .then_some(&line[1..index]);
            }
            _ => {}
        }
    }
    None
}

fn quoted_config_subsection<'a>(section: &'a str, name: &str) -> Option<&'a str> {
    let prefix_length = name.len() + 2;
    if section.len() <= prefix_length {
        return None;
    }
    let prefix = &section[..prefix_length];
    if !prefix.eq_ignore_ascii_case(&format!("{name} \"")) {
        return None;
    }
    section[prefix_length..].strip_suffix('"')
}

fn normalize_config_value(value: &str) -> String {
    let value = value.trim();
    let mut in_quotes = false;
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        match character {
            '\\' if in_quotes => escaped = true,
            '"' => in_quotes = !in_quotes,
            '#' | ';'
                if !in_quotes
                    && value[..index]
                        .chars()
                        .next_back()
                        .is_some_and(char::is_whitespace) =>
            {
                return unquote_config_value(value[..index].trim());
            }
            _ => {}
        }
    }
    unquote_config_value(value)
}

fn unquote_config_value(value: &str) -> String {
    value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(value)
        .to_string()
}

fn upstream_full_ref(config: &BranchConfig) -> Option<String> {
    if config.remote == "." {
        return Some(config.merge_ref.clone());
    }
    let default_refspec = format!("+refs/heads/*:refs/remotes/{}/*", config.remote);
    let matching_refspecs = config
        .fetch_refspecs
        .iter()
        .filter(|(remote, _)| remote == &config.remote)
        .map(|(_, refspec)| refspec)
        .collect::<Vec<_>>();
    if matching_refspecs.is_empty() {
        return map_fetch_refspec(&default_refspec, &config.merge_ref);
    }
    matching_refspecs
        .into_iter()
        .find_map(|refspec| map_fetch_refspec(refspec, &config.merge_ref))
}

fn map_fetch_refspec(refspec: &str, merge_ref: &str) -> Option<String> {
    let refspec = refspec.strip_prefix('+').unwrap_or(refspec);
    if refspec.starts_with('^') {
        return None;
    }
    let (source, destination) = refspec.split_once(':')?;
    match (source.split_once('*'), destination.split_once('*')) {
        (None, None) => (source == merge_ref).then(|| destination.to_string()),
        (Some((source_prefix, source_suffix)), Some((destination_prefix, destination_suffix))) => {
            let matched = merge_ref
                .strip_prefix(source_prefix)?
                .strip_suffix(source_suffix)?;
            Some(format!("{destination_prefix}{matched}{destination_suffix}"))
        }
        _ => None,
    }
}

fn parse_ahead_behind_output(output: &str) -> Option<(usize, usize)> {
    let mut parts = output.split_whitespace();
    let ahead = parts.next()?.parse().ok()?;
    let behind = parts.next()?.parse().ok()?;
    parts.next().is_none().then_some((ahead, behind))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;

    use herdr_compat::api::schema::{AgentStatus, PaneInfo, WorkspaceInfo, WorkspaceWorktreeInfo};

    use super::*;

    const HEAD_OID: &str = "1111111111111111111111111111111111111111";
    const UPSTREAM_OID: &str = "2222222222222222222222222222222222222222";

    #[derive(Debug, Clone, PartialEq, Eq)]
    enum GitCall {
        SymbolicHead(PathBuf),
        RevParse(PathBuf, String),
        AheadBehind(PathBuf, String, String),
    }

    #[derive(Debug, Default)]
    struct FakeGitRunner {
        symbolic_head: Option<String>,
        revisions: HashMap<String, String>,
        counts: Option<(usize, usize)>,
        calls: Mutex<Vec<GitCall>>,
    }

    impl GitCommandRunner for FakeGitRunner {
        fn symbolic_head_full(&self, repo_root: &Path) -> Option<String> {
            self.calls
                .lock()
                .unwrap()
                .push(GitCall::SymbolicHead(repo_root.to_path_buf()));
            self.symbolic_head.clone()
        }

        fn rev_parse_verify(&self, repo_root: &Path, revision: &str) -> Option<String> {
            self.calls.lock().unwrap().push(GitCall::RevParse(
                repo_root.to_path_buf(),
                revision.to_string(),
            ));
            self.revisions.get(revision).cloned()
        }

        fn ahead_behind(
            &self,
            repo_root: &Path,
            head_oid: &str,
            upstream_oid: &str,
        ) -> Option<(usize, usize)> {
            self.calls.lock().unwrap().push(GitCall::AheadBehind(
                repo_root.to_path_buf(),
                head_oid.to_string(),
                upstream_oid.to_string(),
            ));
            self.counts
        }
    }

    fn write_fake_tracked_repo(root: &Path) {
        std::fs::create_dir_all(root.join(".git/refs/heads")).unwrap();
        std::fs::create_dir_all(root.join(".git/refs/remotes/origin")).unwrap();
        std::fs::write(root.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
        std::fs::write(root.join(".git/refs/heads/main"), format!("{HEAD_OID}\n")).unwrap();
        std::fs::write(
            root.join(".git/refs/remotes/origin/main"),
            format!("{UPSTREAM_OID}\n"),
        )
        .unwrap();
        std::fs::write(
            root.join(".git/config"),
            "[branch \"main\"]\n\tremote = origin\n\tmerge = refs/heads/main\n",
        )
        .unwrap();
    }

    fn write_fake_linked_worktree(root: &Path) -> (PathBuf, PathBuf) {
        let common_dir = root.join("repo/.git");
        let checkout = root.join("feature-checkout");
        let git_dir = common_dir.join("worktrees/feature-checkout");
        std::fs::create_dir_all(common_dir.join("refs/heads")).unwrap();
        std::fs::create_dir_all(common_dir.join("refs/remotes/origin")).unwrap();
        std::fs::create_dir_all(&git_dir).unwrap();
        std::fs::create_dir_all(&checkout).unwrap();
        std::fs::write(
            checkout.join(".git"),
            format!("gitdir: {}\n", git_dir.display()),
        )
        .unwrap();
        std::fs::write(git_dir.join("commondir"), "../..\n").unwrap();
        std::fs::write(git_dir.join("HEAD"), "ref: refs/heads/feature\n").unwrap();
        std::fs::write(
            common_dir.join("refs/heads/feature"),
            format!("{HEAD_OID}\n"),
        )
        .unwrap();
        std::fs::write(
            common_dir.join("refs/remotes/origin/feature"),
            format!("{UPSTREAM_OID}\n"),
        )
        .unwrap();
        std::fs::write(
            common_dir.join("config"),
            "[branch \"feature\"]\n\tremote = origin\n\tmerge = refs/heads/feature\n",
        )
        .unwrap();
        (checkout, git_dir)
    }

    fn test_workspace(workspace_id: &str) -> WorkspaceInfo {
        WorkspaceInfo {
            workspace_id: workspace_id.to_string(),
            number: 1,
            label: "workspace".to_string(),
            focused: true,
            pane_count: 1,
            tab_count: 1,
            active_tab_id: "tab-1".to_string(),
            agent_status: AgentStatus::Idle,
            tokens: HashMap::new(),
            worktree: None,
        }
    }

    fn test_pane_in(
        pane_id: &str,
        workspace_id: &str,
        cwd: Option<&str>,
        foreground_cwd: Option<&str>,
    ) -> PaneInfo {
        PaneInfo {
            pane_id: pane_id.to_string(),
            terminal_id: format!("terminal-{pane_id}"),
            workspace_id: workspace_id.to_string(),
            tab_id: "tab-1".to_string(),
            focused: false,
            cwd: cwd.map(str::to_string),
            foreground_cwd: foreground_cwd.map(str::to_string),
            label: None,
            agent: None,
            title: None,
            terminal_title: None,
            terminal_title_stripped: None,
            display_agent: None,
            agent_status: AgentStatus::Idle,
            state_labels: HashMap::new(),
            tokens: HashMap::new(),
            agent_session: None,
            scroll: None,
            revision: 1,
        }
    }

    #[test]
    fn worktree_info_resolves_git_dir_and_common_dir() {
        let root = crate::workspace::temp_test_dir("git-status-worktree");
        write_fake_tracked_repo(&root);

        assert_eq!(
            git_worktree_info(&root),
            Some(GitWorktreeInfo {
                repo_root: std::fs::canonicalize(&root).unwrap(),
                git_dir: std::fs::canonicalize(root.join(".git")).unwrap(),
                git_common_dir: std::fs::canonicalize(root.join(".git")).unwrap(),
            })
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn linked_worktree_resolves_shared_common_dir_and_own_head() {
        let root = crate::workspace::temp_test_dir("git-status-linked");
        let (checkout, git_dir) = write_fake_linked_worktree(&root);
        let runner = FakeGitRunner::default();

        assert_eq!(
            git_status_fingerprint(&checkout, &runner),
            Some(GitStatusFingerprint {
                git_dir: std::fs::canonicalize(git_dir).unwrap(),
                git_common_dir: std::fs::canonicalize(root.join("repo/.git")).unwrap(),
                head: GitHeadIdentity::Branch {
                    full_ref: "refs/heads/feature".to_string(),
                    short_name: "feature".to_string(),
                    oid: Some(HEAD_OID.to_string()),
                },
                upstream: Some(GitUpstreamIdentity {
                    remote: "origin".to_string(),
                    merge_ref: "refs/heads/feature".to_string(),
                    full_ref: "refs/remotes/origin/feature".to_string(),
                    oid: Some(UPSTREAM_OID.to_string()),
                }),
            })
        );
        assert_eq!(*runner.calls.lock().unwrap(), Vec::<GitCall>::new());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fingerprint_reads_head_and_upstream_oids_from_loose_refs() {
        let root = crate::workspace::temp_test_dir("git-status-loose");
        write_fake_tracked_repo(&root);
        let runner = FakeGitRunner::default();

        let fingerprint = git_status_fingerprint(&root, &runner).unwrap();

        assert_eq!(
            (
                fingerprint.branch_name(),
                fingerprint.head_oid(),
                fingerprint.upstream_oid(),
            ),
            (Some("main"), Some(HEAD_OID), Some(UPSTREAM_OID))
        );
        assert_eq!(*runner.calls.lock().unwrap(), Vec::<GitCall>::new());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fingerprint_falls_back_to_packed_refs() {
        let root = crate::workspace::temp_test_dir("git-status-packed");
        write_fake_tracked_repo(&root);
        std::fs::remove_file(root.join(".git/refs/heads/main")).unwrap();
        std::fs::remove_file(root.join(".git/refs/remotes/origin/main")).unwrap();
        std::fs::write(
            root.join(".git/packed-refs"),
            format!(
                "# pack-refs with: peeled fully-peeled sorted\n{HEAD_OID} refs/heads/main\n{UPSTREAM_OID} refs/remotes/origin/main\n"
            ),
        )
        .unwrap();

        let fingerprint = git_status_fingerprint(&root, &FakeGitRunner::default()).unwrap();

        assert_eq!(
            (fingerprint.head_oid(), fingerprint.upstream_oid()),
            (Some(HEAD_OID), Some(UPSTREAM_OID))
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fingerprint_changes_when_branch_switches_at_the_same_oid() {
        let root = crate::workspace::temp_test_dir("git-status-branch-switch");
        write_fake_tracked_repo(&root);
        let runner = FakeGitRunner::default();
        let before = git_status_fingerprint(&root, &runner).unwrap();
        std::fs::write(root.join(".git/HEAD"), "ref: refs/heads/feature\n").unwrap();
        std::fs::write(
            root.join(".git/refs/heads/feature"),
            format!("{HEAD_OID}\n"),
        )
        .unwrap();
        std::fs::write(
            root.join(".git/config"),
            "[branch \"feature\"]\n\tremote = origin\n\tmerge = refs/heads/main\n",
        )
        .unwrap();

        let after = git_status_fingerprint(&root, &runner).unwrap();

        assert_ne!(before, after);
        assert_eq!(
            (before.branch_name(), after.branch_name()),
            (Some("main"), Some("feature"))
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn upstream_full_ref_maps_custom_fetch_refspecs() {
        let cases = [
            (
                BranchConfig {
                    remote: "origin".to_string(),
                    merge_ref: "refs/heads/feature".to_string(),
                    fetch_refspecs: vec![(
                        "origin".to_string(),
                        "+refs/heads/*:refs/remotes/origin/*".to_string(),
                    )],
                },
                Some("refs/remotes/origin/feature"),
            ),
            (
                BranchConfig {
                    remote: "upstream".to_string(),
                    merge_ref: "refs/heads/main".to_string(),
                    fetch_refspecs: vec![(
                        "upstream".to_string(),
                        "refs/heads/main:refs/remotes/upstream/trunk".to_string(),
                    )],
                },
                Some("refs/remotes/upstream/trunk"),
            ),
            (
                BranchConfig {
                    remote: "origin".to_string(),
                    merge_ref: "refs/heads/private".to_string(),
                    fetch_refspecs: vec![("origin".to_string(), "^refs/heads/private".to_string())],
                },
                None,
            ),
            (
                BranchConfig {
                    remote: ".".to_string(),
                    merge_ref: "refs/heads/main".to_string(),
                    fetch_refspecs: Vec::new(),
                },
                Some("refs/heads/main"),
            ),
        ];

        assert_eq!(
            cases
                .iter()
                .map(|(config, _)| upstream_full_ref(config))
                .collect::<Vec<_>>(),
            cases
                .iter()
                .map(|(_, expected)| expected.map(str::to_string))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn worktree_config_can_define_the_branch_upstream() {
        let root = crate::workspace::temp_test_dir("git-status-worktree-config");
        write_fake_tracked_repo(&root);
        std::fs::write(
            root.join(".git/config"),
            "[extensions]\n\tworktreeConfig = true\n[remote \"fork\"]\n\tfetch = +refs/heads/*:refs/remotes/fork/*\n",
        )
        .unwrap();
        std::fs::write(
            root.join(".git/config.worktree"),
            "[branch \"main\"]\n\tremote = fork\n\tmerge = refs/heads/main\n",
        )
        .unwrap();
        std::fs::create_dir_all(root.join(".git/refs/remotes/fork")).unwrap();
        std::fs::write(
            root.join(".git/refs/remotes/fork/main"),
            format!("{UPSTREAM_OID}\n"),
        )
        .unwrap();

        let fingerprint = git_status_fingerprint(&root, &FakeGitRunner::default()).unwrap();

        assert_eq!(
            fingerprint.upstream,
            Some(GitUpstreamIdentity {
                remote: "fork".to_string(),
                merge_ref: "refs/heads/main".to_string(),
                full_ref: "refs/remotes/fork/main".to_string(),
                oid: Some(UPSTREAM_OID.to_string()),
            })
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn parse_ahead_behind_output_reads_left_right_counts() {
        assert_eq!(
            ["2\t1\n", "", "garbage", "2\tbad\n", "2\t1\textra\n"].map(parse_ahead_behind_output),
            [Some((2, 1)), None, None, None, None]
        );
    }

    #[test]
    fn detached_head_reports_no_branch_and_no_counts() {
        let root = crate::workspace::temp_test_dir("git-status-detached");
        write_fake_tracked_repo(&root);
        std::fs::write(root.join(".git/HEAD"), format!("{HEAD_OID}\n")).unwrap();
        let runner = FakeGitRunner {
            counts: Some((2, 1)),
            ..FakeGitRunner::default()
        };

        let fingerprint = git_status_fingerprint(&root, &runner).unwrap();

        assert_eq!(
            (
                fingerprint.branch_name(),
                ahead_behind_for_fingerprint(&root, &fingerprint, &runner),
            ),
            (None, None)
        );
        assert_eq!(*runner.calls.lock().unwrap(), Vec::<GitCall>::new());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn branch_without_upstream_reports_branch_only() {
        let root = crate::workspace::temp_test_dir("git-status-no-upstream");
        write_fake_tracked_repo(&root);
        std::fs::write(root.join(".git/config"), "").unwrap();
        let runner = FakeGitRunner {
            counts: Some((2, 1)),
            ..FakeGitRunner::default()
        };

        let fingerprint = git_status_fingerprint(&root, &runner).unwrap();

        assert_eq!(
            (
                fingerprint.branch_name(),
                fingerprint.upstream.clone(),
                ahead_behind_for_fingerprint(&root, &fingerprint, &runner),
            ),
            (Some("main"), None, None)
        );
        assert_eq!(*runner.calls.lock().unwrap(), Vec::<GitCall>::new());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reftable_repo_uses_the_subprocess_runner() {
        let root = crate::workspace::temp_test_dir("git-status-reftable");
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(root.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
        std::fs::write(
            root.join(".git/config"),
            "[extensions]\n\trefStorage = reftable\n[branch \"main\"]\n\tremote = origin\n\tmerge = refs/heads/main\n",
        )
        .unwrap();
        let runner = FakeGitRunner {
            symbolic_head: Some("refs/heads/main".to_string()),
            revisions: HashMap::from([
                ("refs/heads/main".to_string(), HEAD_OID.to_string()),
                (
                    "refs/remotes/origin/main".to_string(),
                    UPSTREAM_OID.to_string(),
                ),
            ]),
            counts: Some((2, 1)),
            calls: Mutex::new(Vec::new()),
        };

        let fingerprint = git_status_fingerprint(&root, &runner).unwrap();
        let counts = ahead_behind_for_fingerprint(&root, &fingerprint, &runner);
        let canonical_root = std::fs::canonicalize(&root).unwrap();

        assert_eq!(
            (
                fingerprint.branch_name(),
                fingerprint.head_oid(),
                fingerprint.upstream_oid(),
                counts,
                runner.calls.lock().unwrap().clone(),
            ),
            (
                Some("main"),
                Some(HEAD_OID),
                Some(UPSTREAM_OID),
                Some((2, 1)),
                vec![
                    GitCall::SymbolicHead(canonical_root.clone()),
                    GitCall::RevParse(canonical_root.clone(), "refs/heads/main".to_string()),
                    GitCall::RevParse(
                        canonical_root.clone(),
                        "refs/remotes/origin/main".to_string(),
                    ),
                    GitCall::AheadBehind(
                        canonical_root,
                        HEAD_OID.to_string(),
                        UPSTREAM_OID.to_string(),
                    ),
                ],
            )
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn workspace_identity_cwd_prefers_worktree_checkout_path() {
        let mut workspace = test_workspace("workspace-1");
        workspace.worktree = Some(WorkspaceWorktreeInfo {
            repo_key: "repo-key".to_string(),
            repo_name: "repo".to_string(),
            repo_root: "/test/repo".to_string(),
            checkout_path: "/test/repo-worktree".to_string(),
            is_linked_worktree: true,
        });
        let panes = vec![test_pane_in(
            "pane-1",
            "workspace-1",
            Some("/test/repo"),
            Some("/test/repo/nested"),
        )];

        assert_eq!(
            workspace_identity_cwd(&workspace, &panes),
            Some(PathBuf::from("/test/repo-worktree"))
        );
    }

    #[test]
    fn workspace_identity_cwd_falls_back_to_min_pane_cwd() {
        let workspace = test_workspace("workspace-1");
        let panes = vec![
            test_pane_in(
                "pane-2",
                "workspace-1",
                Some("/test/zulu"),
                Some("/test/charlie"),
            ),
            test_pane_in("pane-1", "workspace-1", Some("/test/alice"), None),
            test_pane_in(
                "pane-3",
                "workspace-2",
                Some("/test/bob"),
                Some("/test/bob/foreground"),
            ),
        ];

        assert_eq!(
            workspace_identity_cwd(&workspace, &panes),
            Some(PathBuf::from("/test/alice"))
        );
    }
}

//! Pick from a fresh daemon snapshot, then validate only candidates we might focus.
use crate::daemon_socket::DaemonSocket;
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Clone, Debug, Deserialize)]
pub struct AgentPane {
    pub window_id: String,
    pub session: String,
    #[serde(default)]
    pub workspace: u32,
    #[serde(default)]
    pub protocol: String,
    #[serde(default)]
    pub focused: bool,
}

/// Match the existing interactive-agent filter, including wrapped Claude processes.
pub fn detection_is_interactive(detection: &Value) -> bool {
    if detection["matched"] != true {
        return false;
    }
    let harness = detection["matched_harness"].as_str().or_else(|| {
        detection["manifests"]
            .as_array()?
            .iter()
            .find(|m| m["matched"] == true)?["id"]
            .as_str()
    });
    if harness != Some("claude-code") {
        return true;
    }
    let argv = detection["group"]
        .as_array()
        .and_then(|group| group.iter().find(|p| p["matched"] == true))
        .and_then(|p| p["argv"].as_array())
        .or_else(|| detection["process"]["argv"].as_array());
    !argv
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .take_while(|arg| *arg != "--")
        .any(|arg| arg == "-p" || arg == "--print" || arg.starts_with("--print="))
}

/// Walk in session/workspace order, preserving daemon order inside a workspace.
pub fn ordered_candidates(
    mut panes: Vec<AgentPane>,
    current: &str,
    previous: bool,
) -> Vec<AgentPane> {
    panes.sort_by(|a, b| (&a.session, a.workspace).cmp(&(&b.session, b.workspace)));
    if panes.is_empty() {
        return panes;
    }
    let at = panes.iter().position(|p| p.window_id == current);
    let start = match (at, previous) {
        (Some(at), false) => (at + 1) % panes.len(),
        (Some(at), true) => at,
        (None, _) => 0,
    };
    panes.rotate_left(start);
    if previous {
        panes.reverse();
    }
    panes
}

/// Read current membership every time: additions/removals require no subscription or TTL.
pub fn cycle_agent_pane(
    socket: &mut DaemonSocket,
    session: &str,
    current: &str,
    previous: bool,
    preview: bool,
) -> Result<Value, Box<dyn std::error::Error>> {
    // If the renderer has not caught up with a previous cross-session press,
    // its environment still names the old session. A sole attached client is
    // unambiguous; use the daemon's current session before reading its focus.
    let clients = socket.call("list-clients", json!({}))?;
    let attached: Vec<&str> = clients["clients"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|client| client["session"].as_str())
        .filter(|name| !name.is_empty())
        .collect();
    let session = if attached.len() == 1 {
        attached[0]
    } else {
        session
    };
    let listing = socket.call("list-agents", json!({"all_sessions":true}))?;
    let panes: Vec<AgentPane> = serde_json::from_value(listing["agents"].clone())?;
    // A held/repeated key may have captured the previous frame's focus. The
    // daemon focus wins so queued presses continue advancing rather than repeat.
    let current = panes
        .iter()
        .find(|p| p.session == session && p.focused)
        .map(|p| p.window_id.as_str())
        .unwrap_or(current)
        .to_owned();
    for target in ordered_candidates(panes, &current, previous) {
        if target.protocol.is_empty() {
            let detection = match socket.call(
                "explain-agent-detect",
                json!({"session":target.session,"window":target.window_id}),
            ) {
                Ok(detection) => detection,
                Err(error) if error.target_disappeared() => continue,
                Err(error) => return Err(error.into()),
            };
            if !detection_is_interactive(&detection) {
                continue;
            }
        }
        if preview {
            return Ok(json!({"session":target.session,"window":target.window_id}));
        }
        // Focus before switching session: if the pane disappeared, never show an
        // unrelated pane in that session. The daemon resolves UUIDs at execution.
        match socket.call(
            "focus-window",
            json!({"session":target.session,"window":target.window_id}),
        ) {
            Ok(_) => {}
            Err(error) if error.target_disappeared() => continue,
            Err(error) => return Err(error.into()),
        }
        if target.session != session {
            match socket.call(
                "switch-session",
                json!({"session":session,"name":target.session}),
            ) {
                Ok(_) => {}
                Err(error) if error.target_disappeared() => continue,
                Err(error) => return Err(error.into()),
            }
        }
        return Ok(json!({"session":target.session,"window":target.window_id}));
    }
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wrapped_claude_print_modes_are_excluded() {
        for flag in ["-p", "--print", "--print=true"] {
            assert!(!detection_is_interactive(
                &json!({"matched":true,"matched_harness":"claude-code","process":{"argv":["node","wrapper"]},"group":[{"matched":true,"argv":["claude",flag,"prompt"]}]})
            ));
        }
        assert!(detection_is_interactive(
            &json!({"matched":true,"manifests":[{"matched":true,"id":"claude-code"}],"process":{"argv":["claude","--","--print"]}})
        ));
        assert!(detection_is_interactive(
            &json!({"matched":true,"matched_harness":"codex","process":{"argv":["codex","-p","work"]}})
        ));
        assert!(!detection_is_interactive(&json!({"matched":false})));
    }
}

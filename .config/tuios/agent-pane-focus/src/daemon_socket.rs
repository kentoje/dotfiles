//! Direct TuiOS verb calls, preserving the invoking pane's permissions.
use serde_json::{Value, json};
use std::{
    env,
    io::{BufRead, BufReader, Read, Write},
    os::unix::net::UnixStream,
    path::Path,
    time::Duration,
};

#[derive(Debug)]
pub struct DaemonError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for DaemonError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for DaemonError {}
impl From<std::io::Error> for DaemonError {
    fn from(error: std::io::Error) -> Self {
        Self {
            code: "socket_io".into(),
            message: error.to_string(),
        }
    }
}
impl From<serde_json::Error> for DaemonError {
    fn from(error: serde_json::Error) -> Self {
        Self {
            code: "invalid_response".into(),
            message: error.to_string(),
        }
    }
}

impl DaemonError {
    /// Only missing targets are safe to skip; permission and transport errors stop cycling.
    pub fn target_disappeared(&self) -> bool {
        matches!(
            self.code.as_str(),
            "window_not_found"
                | "session_not_found"
                | "unknown_pane"
                | "no_windows"
                | "pty_not_found"
        )
    }
}

pub struct DaemonSocket {
    reader: BufReader<UnixStream>,
    request_id: u64,
}
impl DaemonSocket {
    /// Connect once per keypress; never spawn the TuiOS CLI or keep a stale pane cache.
    pub fn connect(path: &Path) -> Result<Self, DaemonError> {
        let stream = UnixStream::connect(path)?;
        stream.set_read_timeout(Some(Duration::from_secs(2)))?;
        stream.set_write_timeout(Some(Duration::from_secs(2)))?;
        let mut socket = Self {
            reader: BufReader::new(stream),
            request_id: 0,
        };
        socket.call(
            "hello",
            json!({"client":"tuios-agent-pane-focus", "version":"0.1.0", "protocol":1}),
        )?;
        // Match the official CLI on macOS, where kernel peer credentials cannot
        // identify the caller's pane. Never print or persist the capability token.
        if let (Ok(id), Ok(token)) = (env::var("TUIOS_PANE_ID"), env::var("TUIOS_PANE_TOKEN")) {
            socket.call("pane-grants", json!({"pane_id":id, "pane_token":token}))?;
        }
        Ok(socket)
    }

    /// Send one newline-delimited request and bound malformed or oversized replies.
    pub fn call(&mut self, verb: &str, params: Value) -> Result<Value, DaemonError> {
        self.request_id += 1;
        let request = json!({"id": self.request_id, "verb": verb, "params": params});
        serde_json::to_writer(self.reader.get_mut(), &request)?;
        self.reader.get_mut().write_all(b"\n")?;
        let mut line = Vec::new();
        (&mut self.reader)
            .take(8 * 1024 * 1024 + 1)
            .read_until(b'\n', &mut line)?;
        if line.last() != Some(&b'\n') || line.len() > 8 * 1024 * 1024 {
            return Err(DaemonError {
                code: "invalid_response".into(),
                message: "missing newline or response exceeds 8 MiB".into(),
            });
        }
        let mut reply: Value = serde_json::from_slice(&line)?;
        if let Some(error) = reply.get("error") {
            return Err(DaemonError {
                code: error["code"].as_str().unwrap_or("daemon_error").into(),
                message: error["message"]
                    .as_str()
                    .unwrap_or("TuiOS refused the request")
                    .into(),
            });
        }
        if reply["id"] != self.request_id || !reply["result"].is_object() {
            return Err(DaemonError {
                code: "invalid_response".into(),
                message: "response id mismatch or missing result".into(),
            });
        }
        Ok(reply["result"].take())
    }
}

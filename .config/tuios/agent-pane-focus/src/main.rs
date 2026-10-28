//! Low-latency agent pane switching against current TuiOS daemon state.
mod agent_cycle;
mod daemon_socket;
use std::{env, fs::OpenOptions, os::unix::fs::OpenOptionsExt, path::PathBuf, process::ExitCode};

fn run_agent_cycle() -> Result<(), Box<dyn std::error::Error>> {
    let mut previous = false;
    let mut preview = false;
    let mut socket_path = env::var_os("TUIOS_SOCKET").map(PathBuf::from);
    let mut session = env::var("TUIOS_SESSION").unwrap_or_default();
    let mut current = env::var("TUIOS_ACTIVE_PANE_ID").unwrap_or_default();
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "next" => previous = false,
            "prev" => previous = true,
            "--preview" => preview = true,
            "--socket" => {
                socket_path = Some(arguments.next().ok_or("--socket requires a path")?.into())
            }
            "--session" => session = arguments.next().ok_or("--session requires a name")?,
            "--current" => current = arguments.next().ok_or("--current requires a pane UUID")?,
            "--help" | "-h" => {
                println!(
                    "tuios-agent-pane-focus next|prev [--preview] [--socket PATH] [--session NAME] [--current UUID]"
                );
                return Ok(());
            }
            _ => return Err(format!("unknown argument: {argument}").into()),
        }
    }
    let socket_path = socket_path
        .ok_or("TUIOS_SOCKET is unset; run from a TuiOS command binding or pass --socket")?;
    // Serialize overlapping repeat presses against this daemon. The lock lives
    // beside its user-private socket, never in a globally writable cache file.
    let lock_path = socket_path.with_extension("agent-pane-focus.lock");
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .mode(0o600)
        .open(lock_path)?;
    lock.lock()?;
    let mut socket = daemon_socket::DaemonSocket::connect(&socket_path)?;
    let target = agent_cycle::cycle_agent_pane(&mut socket, &session, &current, previous, preview)?;
    if preview {
        println!("{target}");
    }
    Ok(())
}
fn main() -> ExitCode {
    match run_agent_cycle() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("tuios-agent-pane-focus: {error}");
            ExitCode::FAILURE
        }
    }
}

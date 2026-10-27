"""Drive the real URL popup through a PTY and a separate TUIOS daemon.

Run with python3 -m unittest discover -s .config/terminal/scripts -v.
Requires tuios, fish, fzf and tac. Browser opens are captured, never launched.
"""

import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shlex
import shutil
import struct
import subprocess
import tempfile
import termios
import time
import unittest


SCRIPT = Path(__file__).with_name("fzf-url.fish").resolve()


@unittest.skipUnless(all(shutil.which(tool) for tool in ("tuios", "fish", "fzf", "tac")),
                     "requires tuios, fish, fzf and tac")
class FzfUrlNavigationTest(unittest.TestCase):
    def test_popup_receives_navigation_and_releases_keys_on_accept_and_cancel(self):
        with tempfile.TemporaryDirectory(prefix="tuios-url-navigation-") as directory:
            root = Path(directory)
            (root / "tuios").mkdir()
            (root / "bin").mkdir()
            opener = root / "bin" / "open"
            opener.write_text(f'#!/bin/sh\nprintf "%s\\n" "$1" >> {shlex.quote(str(root / "opened"))}\n')
            opener.chmod(0o755)
            fixture = root / "fixture.py"
            fixture.write_text(f'''import os, tty
tty.setraw(0)
print("https://one.example\\r\\nhttps://two.example\\r\\nhttps://three.example", flush=True)
while True:
    with open({str(root / "keys")!r}, "ab", buffering=0) as log:
        log.write(os.read(0, 1))
''')
            command = f"fish --no-config -c {shlex.quote('source ' + shlex.quote(str(SCRIPT)))}"
            (root / "tuios" / "config.toml").write_text(f'''
[appearance]
preferred_shell = "/bin/sh"
nvim_navigation = true
motion = "none"
[keybindings]
leader_key = "ctrl+a"
preset = "tmux"
[keybindings.terminal_mode]
terminal_focus_down = ["ctrl+j"]
terminal_focus_up = ["ctrl+k"]
[keybindings.lists]
list_down = ["down", "ctrl+j"]
list_up = ["up", "ctrl+k"]
[keybindings.prefix_mode]
prefix_next_window = []
[[keybindings.command]]
key = "prefix+o"
type = "popup"
command = {json.dumps(command)}
''')
            env = {key: value for key, value in os.environ.items()
                   if not key.startswith(("TUIOS_", "HERDR_", "TMUX", "FZF_"))}
            env.update(XDG_CONFIG_HOME=str(root), TUIOS_SERVER=f"urlnav-{os.getpid()}",
                       TERM="xterm-256color", SHELL="/bin/sh",
                       PATH=f'{root / "bin"}:{os.environ["PATH"]}',
                       FZF_DEFAULT_OPTS=f"--reverse --bind 'focus:execute-silent(echo {{}} > {root / 'focused'})'")

            def cli(*args):
                return subprocess.run(["tuios", *args], env=env, text=True,
                                      capture_output=True, check=True, timeout=15).stdout

            cli("new", "repro", "--detach")
            pid, fd = pty.fork()
            if pid == 0:
                os.execvpe("tuios", ["tuios", "attach", "repro", "--terminal-mode"], env)
            fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
            screen = bytearray()

            def wait_until(predicate):
                deadline = time.monotonic() + 8
                while time.monotonic() < deadline:
                    if predicate():
                        return
                    readable, _, _ = select.select([fd], [], [], 0.05)
                    if readable:
                        screen.extend(os.read(fd, 65536))
                self.fail("URL popup did not reach the expected state")

            def read(name):
                path = root / name
                return path.read_text().strip() if path.exists() else ""

            def navigate(keys, expected):
                os.write(fd, keys)
                wait_until(lambda: read("focused") == f"https://{expected}.example")

            try:
                wait_until(lambda: any(client.get("session") == "repro"
                                       for client in json.loads(cli("list-clients", "--json"))))
                cli("new-window", "-s", "repro", "fixture", "--", shutil.which("python3"), str(fixture))
                for window in json.loads(cli("list-windows", "-s", "repro", "--json"))["windows"]:
                    if window.get("custom_name") != "fixture":
                        cli("close-window", "-s", "repro", window["window_id"])
                cli("wait-for", "window-output", "-s", "repro", "-w", "fixture",
                    "--pattern", "https://three.example", "--timeout", "8000")
                wait_until(lambda: b"https://three.example" in screen)
                for cancel in (False, True):
                    with self.subTest(cancel=cancel):
                        (root / "focused").unlink(missing_ok=True)
                        navigate(b"\x01o", "three")
                        navigate(b"\x0a", "two")  # Ctrl J
                        navigate(b"\x0b", "three")  # Ctrl K
                        navigate(b"\x1b[B", "two")
                        navigate(b"\x1b[A", "three")
                        # The Kitty encoding used by terminals such as Ghostty.
                        navigate(b"\x1b[106;5u", "two")
                        navigate(b"\x1b[107;5u", "three")
                        navigate(b"\x0a", "two")
                        os.write(fd, b"\x03" if cancel else b"\r")
                        wait_until(lambda: json.loads(cli("list-windows", "-s", "repro", "--json"))
                                   ["windows"][-1].get("custom_name") == "fixture")
                        self.assertEqual(read("opened"), "https://two.example")
                        # Navigation must be consumed by TUIOS again in the source pane.
                        (root / "keys").write_bytes(b"")
                        os.write(fd, b"\x0a\x0bx")
                        wait_until(lambda: "x" in read("keys"))
                        self.assertEqual((root / "keys").read_bytes(), b"x")
            finally:
                cli("kill-server")
                os.close(fd)
                os.waitpid(pid, 0)


if __name__ == "__main__":
    unittest.main()

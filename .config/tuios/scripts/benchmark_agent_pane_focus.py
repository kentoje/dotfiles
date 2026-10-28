"""Benchmark actual focus requests in a disposable daemon; never touch live sessions.

Uses a sleep process with argv[0]=codex, not an AI model or conversation.
"""
import json
import os
import pathlib
import socket
import statistics
import subprocess
import tempfile
import time
binary = str(pathlib.Path.home() / '.local/bin/tuios-agent-pane-focus')
server = 'cycle-' + str(os.getpid())
env = {k: v for k, v in os.environ.items() if not k.startswith('TUIOS_')}
with tempfile.TemporaryDirectory(prefix='cycle-live-', dir='/tmp') as tmp:
    env['XDG_STATE_HOME'] = tmp
    env['XDG_RUNTIME_DIR'] = tmp
    daemon = subprocess.Popen(['tuios', '--server', server, 'daemon', '--no-restore'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    path = f'{tmp}/tuios/servers/{server}/tuios.sock'
    try:
        for _ in range(100):
            if pathlib.Path(path).exists():
                break
            if daemon.poll() is not None:
                raise RuntimeError(daemon.stderr.read().decode())
            time.sleep(0.02)
        stream = socket.socket(socket.AF_UNIX)
        stream.connect(path)
        f = stream.makefile('rwb', buffering=0)

        def call(verb, params):
            f.write((json.dumps(dict(id=1, verb=verb, params=params)) + '\n').encode())
            r = json.loads(f.readline())
            if 'error' in r:
                raise RuntimeError(r['error'])
            return r['result']
        call('new-session', dict(name='bench', window=False))

        def new_agent(name):
            a = call('new-window', dict(session='bench', name=name, command=['/bin/bash', '--noprofile', '--norc', '-c', 'exec -a codex /bin/sleep 120']))
            return a['window_id']
        a = new_agent('a')
        b = new_agent('b')
        deadline = time.monotonic() + 10
        while len(call('list-agents', dict(all_sessions=True))['agents']) < 2:
            if time.monotonic() > deadline:
                raise RuntimeError('detector missed fake agents')
            time.sleep(0.03)
        runenv = dict(env, TUIOS_SOCKET=path, TUIOS_SESSION='bench', TUIOS_ACTIVE_PANE_ID=a)

        def cycle(preview=False):
            cmd = ['sh', '-c', 'exec "$1" next' + (' --preview' if preview else ''), 'benchmark', binary]
            t = time.perf_counter()
            p = subprocess.run(cmd, env=runenv, capture_output=True, text=True)
            if p.returncode:
                raise RuntimeError(p.stderr)
            return ((time.perf_counter() - t) * 1000, p.stdout)
        times = [cycle()[0] for _ in range(100)]
        print('REAL FOCUS via sh+exec (100): median', round(statistics.median(times), 2), 'p95', round(sorted(times)[94], 2), 'max', round(max(times), 2), 'ms')
        c = new_agent('c')
        deadline = time.monotonic() + 10
        while len(call('list-agents', dict(all_sessions=True))['agents']) < 3:
            if time.monotonic() > deadline:
                raise RuntimeError('new pane missing')
            time.sleep(0.03)
        call('focus-window', dict(session='bench', window=b))
        cycle()
        rows = call('list-agents', dict(all_sessions=True))['agents']
        assert next((x['window_id'] for x in rows if x['focused'])) == c, 'addition was skipped'
        call('close-window', dict(session='bench', window=c))
        for _ in range(4):
            cycle()
        assert c not in [x['window_id'] for x in call('list-agents', dict(all_sessions=True))['agents']]
        call('close-window', dict(session='bench', window=b))
        print('live addition/removal and repeated switching: PASS')
        f.close()
        stream.close()
    finally:
        daemon.terminate()
        try:
            daemon.wait(timeout=5)
        except subprocess.TimeoutExpired:
            daemon.kill()
            daemon.wait()

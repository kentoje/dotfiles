#!/usr/bin/env python3
"""dev-flow-set — upsert fields into a worktree's .dev-flow.json manifest.

Deterministic glue for the aircall-dev-flow skill: merges keys into the manifest
without clobbering the rest, and always refreshes `updatedAt`. Use this instead of
rewriting the whole JSON by hand at each phase transition.

Usage:
  dev-flow-set.py phase=implementing
  dev-flow-set.py ticket.key=CI-5814 ticket.epic=csat ticket.storyPoints=3
  dev-flow-set.py mr.id=1070 mr.url=https://gitlab.com/.../merge_requests/1070
  dev-flow-set.py gate.approved=true gate.verdict="ship it"
  dev-flow-set.py pipeline.status=failed
  dev-flow-set.py --file /path/to/worktree/.dev-flow.json phase=shipped

Notes:
  - key=value; dotted keys (mr.url) write nested objects.
  - value is parsed as JSON when possible (true/false/numbers/null/objects),
    otherwise kept as a string.
  - --file defaults to ./.dev-flow.json (the current worktree).
"""
import sys, os, json, datetime

def parse_value(raw):
    try:
        return json.loads(raw)
    except (ValueError, json.JSONDecodeError):
        return raw

def set_path(obj, dotted, value):
    parts = dotted.split(".")
    cur = obj
    for p in parts[:-1]:
        if not isinstance(cur.get(p), dict):
            cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = value

def main(argv):
    path = ".dev-flow.json"
    pairs = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ("-f", "--file"):
            path = argv[i + 1]; i += 2; continue
        if a in ("-h", "--help"):
            print(__doc__); return 0
        if "=" not in a:
            print(f"expected key=value, got: {a}", file=sys.stderr); return 2
        k, v = a.split("=", 1)
        pairs.append((k, parse_value(v)))
        i += 1
    if not pairs:
        print("nothing to set", file=sys.stderr); return 2

    data = {}
    if os.path.exists(path):
        try:
            with open(path) as fh:
                data = json.load(fh) or {}
        except (ValueError, json.JSONDecodeError):
            data = {}

    for k, v in pairs:
        set_path(data, k, v)
    data["updatedAt"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")

    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, path)
    print(f"updated {path}: " + ", ".join(k for k, _ in pairs))
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

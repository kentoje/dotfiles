#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
COVENANT_BIN="${COVENANT_BIN:-covenant}"
npm run check
npm run fallow
npm run typecheck
uv run --with pyyaml --with jsonschema python scripts/check-module-contracts.py
uv run --with pyyaml --with jsonschema python scripts/test-module-contracts.py
"$COVENANT_BIN" --project . validate
mkdir -p .covenant
"$COVENANT_BIN" --project . --json check --all > .covenant/bootstrap-result.json
python3 - <<'PY'
import json
r=json.load(open('.covenant/bootstrap-result.json'))['report']
active=[o for o in r['obligations'] if o['outcome']!='draft']
print(json.dumps({'run_id':r['run_id'],'scope':r['scope'],'outcome':r['outcome'],'active_obligations':active,'tests':len(r['tests'])},indent=2))
assert r['outcome']=='pass' and r['scope']=='all'
PY
"$COVENANT_BIN" --project . coverage

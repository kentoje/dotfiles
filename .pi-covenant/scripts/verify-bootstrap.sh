#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec pnpm check

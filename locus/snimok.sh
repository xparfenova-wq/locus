#!/bin/bash
                                                                
set -euo pipefail
umask 077
KOREN="$(cd "$(dirname "$0")" && pwd)"
if [ "${1:-}" = --nochnoj ]; then
  exec python3 "$KOREN/ops/locus_ops.py" --root "$KOREN" scheduled --nightly --offsite
fi
exec python3 "$KOREN/ops/locus_ops.py" --root "$KOREN" scheduled

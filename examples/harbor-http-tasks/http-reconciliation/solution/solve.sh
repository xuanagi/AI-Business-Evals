#!/bin/sh
set -eu
mkdir -p /workspace/output
python - <<'PY'
import json
from pathlib import Path

data = json.loads(Path('/workspace/input.json').read_text())
receipts = {r['receipt_id']: r for r in data['receipts']}
rows = []
for order in data['orders']:
    received = [r for r in receipts.values() if r['order_id'] == order['order_id']]
    qty = sum(r['quantity'] for r in received) - order['quantity']
    amount = sum(r['amount'] for r in received) - order['amount']
    rows.append(dict(order_id=order['order_id'], quantity_delta=qty, amount_delta=amount,
                     status='missing' if not received else 'matched' if qty == amount == 0 else 'mismatch'))
Path('/workspace/output/response.json').write_text(json.dumps({'rows': rows}))
PY

"""Local, stateless teaching service. Not a production application."""

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def reconcile(data):
    unique = {}
    for receipt in data["receipts"]:
        unique.setdefault(receipt["receipt_id"], receipt)
    totals = {}
    for receipt in unique.values():
        qty, amount = totals.get(receipt["order_id"], (0, 0))
        totals[receipt["order_id"]] = (qty + receipt["quantity"], amount + receipt["amount"])
    rows = []
    for order in data["orders"]:
        qty, amount = totals.get(order["order_id"], (0, 0))
        dq, da = qty - order["quantity"], amount - order["amount"]
        status = "missing" if order["order_id"] not in totals else "matched" if dq == da == 0 else "mismatch"
        rows.append(dict(order_id=order["order_id"], quantity_delta=dq, amount_delta=da, status=status))
    return {"rows": rows}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/reconcile":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 1_000_000:
                raise ValueError("Invalid body length")
            result = reconcile(json.loads(self.rfile.read(length)))
        except (ValueError, KeyError, TypeError):
            self.send_error(400, "Invalid reconciliation input")
            return
        body = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Demo service: http://127.0.0.1:{args.port}/reconcile", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

"""Independent business checks. Does not call the service or use its implementation."""

import json
from pathlib import Path


EXPECTED = {
    "A": (0, 0, "matched"),
    "B": (-2, -400, "mismatch"),
    "C": (1, 100, "mismatch"),
    "D": (-2, -300, "missing"),
    "E": (0, -50, "mismatch"),
}


def evaluate(result):
    rows = result.get("rows") if isinstance(result, dict) else None
    valid = isinstance(rows, list) and all(isinstance(row, dict) and isinstance(row.get("order_id"), str) for row in rows)
    ids = [row["order_id"] for row in rows] if valid else []
    complete = valid and len(ids) == len(EXPECTED) and set(ids) == set(EXPECTED)
    checks = [{"name": "complete_unique_orders", "passed": complete,
               "gate": True, "weight": 0, "detail": "Exactly one row per expected order is required"}]
    by_id = {row["order_id"]: row for row in rows} if valid else {}
    for order_id, (quantity, amount, status) in EXPECTED.items():
        row = by_id.get(order_id, {})
        passed = (type(row.get("quantity_delta")) is int and type(row.get("amount_delta")) is int
                  and (row["quantity_delta"], row["amount_delta"], row.get("status")) == (quantity, amount, status))
        checks.append({"name": f"order_{order_id}", "passed": passed, "gate": False,
                       "weight": 1 / len(EXPECTED), "detail": f"Expected deltas/status: {quantity}, {amount}, {status}"})
    return {"reward": sum(c["weight"] for c in checks if c["passed"]) if complete else 0.0,
            "gate_failed": not complete, "passed": sum(c["passed"] for c in checks),
            "total": len(checks), "checks": checks}


def main():
    output = Path("/workspace/output/response.json")
    try:
        result = json.loads(output.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        result = None  # Missing/malformed submission is a business failure.
    score = evaluate(result)  # Unexpected evaluator bugs must fail the verifier.
    logs = Path("/logs/verifier")
    logs.mkdir(parents=True, exist_ok=True)
    (logs / "score.json").write_text(json.dumps(score, indent=2), encoding="utf-8")
    (logs / "reward.json").write_text(json.dumps({"reward": score["reward"]}), encoding="utf-8")


if __name__ == "__main__":
    main()

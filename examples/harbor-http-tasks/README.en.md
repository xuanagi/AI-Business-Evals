# HTTP business-evaluation example

[中文](README.md) | English

This example preserves Harbor’s Task / Job / Trial / verifier structure and swaps only the executor for an HTTP JSON adapter. It needs no large model and no separate Runner.

- [`http-reconciliation`](http-reconciliation): an original procurement-reconciliation teaching Task covering exact matches, split receipts, duplicates, short/over receipts, missing receipts, and amount differences.
- [Run and customize guide](../../docs/harbor/http-evaluation.en.md): start the local service, run HTTP and oracle implementations, review evidence, and connect your own endpoint.

All data is original synthetic content under Apache-2.0. Replace it with your own business input distribution and acceptance rules for production use.

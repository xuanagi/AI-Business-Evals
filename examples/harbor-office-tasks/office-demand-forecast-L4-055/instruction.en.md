# Monthly demand forecast and historical validation

[中文](instruction.md) | English

You are a demand-planning analyst. Read `input/monthly_demand.json` without network access, external industry data, or changes to the original.

Forecast demand for January–March 2026 from the monthly history. The forecast must be historically validated, explainable, and reviewable. When data is insufficient, lower the strength of the conclusion rather than inventing precision.

Requirements:

1. Check continuity of months, non-negative demand, blanks, and obvious anomalies.
2. Promotion and stockout days may affect demand; do not simply remove every high or low value.
3. Explain missing-demand treatment and retain both original and processed values.
4. Show historical trend, seasonality, and the latest 12-month change.
5. Use October–December 2025 as the fixed validation window. For each month, forecast only from data available before that month, then compare with the known actual. Show month, forecast, actual, absolute error, and percentage error and summarize mean percentage error. Never copy actuals into forecasts.
6. Choose the final method from validation and explain it in ordinary business language; no specific algorithm is required.
7. Output three forecasts and a reasonable uncertainty range, clearly marked as not a commitment.

Write `output/result.xlsx` with `Historical Data`, `Historical Validation`, `Forecast`, and `Forecast Notes`. Keep all 36 months with original/processed demand, promotion days, and stockout days; `Forecast` must at least include month, forecast, lower bound, and upper bound. Derive the range from historical variation and validation error rather than an unrelated arbitrary interval.

Use a native Excel chart to distinguish history, validation, and future forecast. Do not draw blank months as zero and do not create a web page or image. Do not make procurement commitments or automatic execution recommendations. Reopen the workbook and confirm the forecast, validation, and limitations are reviewable.

# Weekly customer-support dashboard

[中文](instruction.md) | English

You are a customer-support operations analyst. Read `input/客服工单处理记录.xlsx` (customer ticket records) without network access and never modify or overwrite the original.

Aggregate daily tickets by calendar week, show weekly planned volume, resolved volume, and completion rate, and create a trend chart suitable for a weekly meeting.

Rules:

1. `TICKET_DATE` may use several formats; normalize it to a sortable Excel date.
2. Weeks run Monday through Sunday.
3. Weekly planned volume is the sum of `PLAN_COUNT`.
4. Weekly resolved volume is the sum of `RESOLVED_COUNT`.
5. Completion rate is resolved divided by planned; if planned is zero, write `to be confirmed`.
6. Check duplicate `TICKET_ID`; delete only records confirmed to be exact duplicates.

Write `output/result.xlsx` with:

- `Weekly Summary`: week, start/end dates, record count, planned, resolved, and completion rate;
- `Data Quality`: unrecognized dates, duplicate ticket IDs, blanks, and other anomalies; and
- `Processing Notes`: filename, data range, week definition, duplicate check, and calculations.

The summary must have one row per week with mutually associated fields. Do not hide correct numbers in notes or chart helper ranges. State input row count, duplicate results, and unrecognized-date count on the data-quality sheet.

Completion rates must be numeric Excel percentages. Weekly totals must reconcile to cleaned input. Add native Excel charts on `Weekly Summary`: a column chart for planned versus resolved and a line chart for completion rate, with titles, legends, week labels, and units. Keep helper columns hidden if they share the sheet; do not create a separate web page or image. Reopen the workbook and verify the sheets, charts, and totals.

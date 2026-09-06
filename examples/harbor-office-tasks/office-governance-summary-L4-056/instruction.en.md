# Project-governance management summary

[中文](instruction.md) | English

You are a project-governance reporting assistant. Read `input/program_milestone_update_register.xlsx` and `input/quarterly_governance_board_deck.pptx` without network access, external templates, or changes to the originals.

Use the milestone register’s explicitly marked latest records as the current truth; use the PPT as background and as a reference for older wording. Produce a management summary that is quick to read.

Rules:

1. List both files’ versions, as-of dates, main sheets or slide numbers, and confirmed current status.
2. Distinguish complete, in progress, awaiting decision, at risk, historical archive, future draft, monitor-only, and template placeholder.
3. Do not merge similar names when version, date, or status differs.
4. Record dependencies, planned/actual/forecast dates, risk windows, owners, and decisions for management.
5. When files conflict, show both statements, the report’s chosen basis, and the item still requiring confirmation.
6. If an owner or decision maker is not explicitly sourced, write `to be confirmed`; do not treat a workflow name or communication recipient as an owner.
7. A status inferred from individual items must be labelled `synthesized judgment`, not presented as source wording.
8. Cite source file, sheet, or slide for every key conclusion.

Keep the item ID in every milestone, risk, and decision row; put status, date, and source on that same row. For M-101, M-205, and M-206, separately state old draft wording, current register wording, the report’s basis, and whether confirmation remains. M-206 and RISK-118 have no reliable owner source, so owner must be `to be confirmed`.

Write `output/result.docx`, ideally four to six pages, with an executive summary, milestone table, risks/blockers, decision list, conflicts and pending confirmations, and source notes.

Separate risk level from risk type/status; use `to be confirmed` when the source gives no level. Use `management decision pending` when a decision has no recommendation. State only facts supported by the files. Reopen the Word document and check heading hierarchy, table completeness, date/status consistency, and citations.

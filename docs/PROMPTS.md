# AI Prompt Record

This document contains the prompts used while developing the Expense Splitter.

## Prompt entry format

**Agent:**  
**Model:**  
**Date:**  
**Purpose:**

### Prompt

### Result

### My review

#################################################

## P01 - Requirements and architecture

**Agent:** Claude Code
**Model:** Sonnet
**Date:** 8/14/2026
**Purpose:** Analyse the assignment and establish the project rules.

### Prompt

# Context

I am completing an Expense Splitter. The original brief is located at `reference/Project_Expense_Splitter.pdf`.

The most important requirements are exact monetary calculations, deterministic rounding, and a provably minimum settlement plan.

# Task

Read every page of the assignment brief and inspect the repository.

Do not implement the application yet.

Create:

- `AGENTS.md`
- `docs/PROJECT_SPEC.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`

# Required content

`PROJECT_SPEC.md` must separate:

- Mandatory requirements
- Bonus requirements
- Assumptions
- Submission requirements
- Acceptance criteria

`DECISIONS.md` must document:

- React, TypeScript, and Vite
- Vitest and React Testing Library
- localStorage persistence
- LKR as the only currency
- Integer cents for all money
- Equal and exact-amount splits
- Deterministic remainder-cent allocation
- Exact settlement optimization
- Why greedy settlement alone is insufficient

`TEST_PLAN.md` must include:

- The complete scenario supplied in the brief
- Rounding tests
- Payer-excluded-from-split tests
- Edit and deletion tests
- Balance reconciliation tests
- Greedy counterexamples
- Exact optimizer tests
- Property-based test ideas

`AGENTS.md` must instruct coding agents to:

- Read the project documents before editing
- Keep domain calculations independent of React
- Never use floating-point values for stored money
- Never describe a greedy result as globally optimal
- Run relevant tests after changes
- Avoid unrelated changes
- Never commit or push
- Never edit or fabricate entries in `docs/PROMPTS.md`

# Constraints

- Do not create application source code.
- Do not install dependencies.
- Do not commit or push.
- Do not edit `docs/PROMPTS.md`.
- Do not include the assignment PDF in tracked files.
- Do not invent requirements missing from the brief.
- Clearly label assumptions.

# Output

Report:

1. Files created
2. Important decisions
3. Ambiguities requiring my decision
4. Any contradiction found in the brief

Keep the final response under 400 words.

### Result

1. Files created

AGENTS.md — 8 binding rules + pre-done checklist
docs/PROJECT_SPEC.md — mandatory / bonus / assumptions / submission / AC1–AC25
docs/DECISIONS.md — 11 decisions, all 9 you listed
docs/TEST_PLAN.md — 10 sections
No source code, no dependencies, nothing committed, docs/PROMPTS.md untouched (still 0 bytes), PDF confirmed git-ignored via reference/.

2. Important decisions

Exact-amount as the second split type (brief offers a free choice; its verification scenario is written in exact amounts). Percentage is bonus.
Integer cents everywhere, branded Cents type. Parsing by string manipulation, not Math.round(x\*100) — that trap misrounds values like 1.005.
Remainder rule: floor, then one extra cent each to the first r participants in ascending person-id order. Total, deterministic, order-independent.
Settlement = maximise zero-sum partitions. min txns = m − k, solved by bitmask DP (O(3^m)), exact for m ≤ 18 non-zero balances; above that greedy runs but is labelled not proven minimal.
Verified the brief's scenario: Alice +5,666.67, Bob −9,333.33, Carol +7,000.00, Dave −3,333.34, sum exactly 0; minimum 3 transactions.
Verified greedy counterexample by exhaustive search, not from memory: balances −400/−300/+200/+200/+300 → greedy 4, exact 3. Six more are tabulated. The search also showed no 4-person case defeats greedy — so the brief's own scenario returns 3 either way and cannot prove minimality. That negative control is written into the test plan. 3. Ambiguities needing your decision (assumptions are in place; none blocks implementation)

Build percentage split too, or exact-amount only?
Invalid splits (bonus): hard-reject at entry (assumed) or accept with a warning?
Person removal — brief only requires adding. Currently blocked once referenced.
Remainder fairness: fixed canonical order (assumed) or rotate the extra cent across expenses?
When several minimal plans tie, any preference (fewest payers, smallest max transfer)? 4. Contradictions in the brief

C1 p1 "balances always reconcile to zero, not Rs. 99.99 or 100.01" vs p3 "approximately Rs. 0 (within a cent)". → adopted the stricter: exactly 0.
C2 "single-session tool" vs p2's explicit persistence menu incl. localStorage. → read as no accounts, not no persistence.
C3 "minimum number of transactions" vs "a minimized set". → implementing the provable minimum.
C4 LKR cents aren't in circulation, but the brief's own example and its 3,333.33/3,333.34 figures require them.

### My review

Pending.

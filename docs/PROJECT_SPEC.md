# Project Specification — Expense Splitter

**Source of truth:** `reference/Project_ Expense_Splitter.pdf` (3 pages, read in full).
The PDF is git-ignored and is not tracked in this repository.

This document restates the brief and separates what the brief *requires* from what this project *assumes*. Every statement below is tagged:

- **[BRIEF]** — stated in the assignment PDF.
- **[ASSUMPTION]** — our judgment call, not stated in the brief.
- **[DERIVED]** — a direct logical consequence of a [BRIEF] statement.

No requirement has been invented. Where the brief is silent, the gap is recorded as an assumption or an open question, not as a requirement.

---

## 1. Mandatory requirements

### 1.1 Context

- **[BRIEF]** A group of friends share expenses on a trip. At the end, everyone wants to know who owes whom, and how to settle up with the fewest payments possible.
- **[BRIEF]** All amounts are in Sri Lankan Rupees (LKR).
- **[BRIEF]** No login or user accounts. This is a single-session tool, not a multi-user app.
- **[BRIEF]** AI tools are fully allowed and encouraged.

### 1.2 Functional requirements

The app must let a user:

| # | Requirement | Source |
|---|---|---|
| M1 | Add people to a group by name, with **no limit on group size** (2 people or 10 — must work for any number). | [BRIEF] |
| M2 | Log an expense capturing: **amount**, **who paid**, **who the expense is split between**, and **how it is split**. | [BRIEF] |
| M3 | Support **equal split** among selected people. | [BRIEF] |
| M4 | Support **one of**: percentage split **OR** exact-amount split (implementer's choice). | [BRIEF] |
| M5 | **Edit or delete** an expense after it is created, with balances recalculating correctly afterward. | [BRIEF] |
| M6 | **View running balances** — how much each person is net owed or owes overall. | [BRIEF] |
| M7 | **View a "Settle Up" screen** — the *minimum number of transactions* needed to bring everyone's balance to zero, **not** just a list of every pairwise debt. | [BRIEF] |
| M8 | Handle **rounding** explicitly, so that balances always reconcile to zero — not to Rs. 99.99 or Rs. 100.01. | [BRIEF] |

- **[DECISION]** For M4 we implement **exact-amount split**. See `docs/DECISIONS.md` §6. The brief presents this as a free choice, and the brief's own verification scenario is written in terms of exact amounts.

### 1.3 Explicitly emphasised by the brief

- **[BRIEF]** *"You Must Explicitly Handle — this is the actual point of the exercise, please don't skip it: Rounding."*
- **[BRIEF]** Worked example given: Rs. 100 split three ways leaves an extra cent (a fraction of a rupee) somewhere; the app must show how it handles this.
- **[BRIEF]** *"Prioritize correctness of the split calculations and the settle-up logic over UI polish or covering every edge case. A correct, plain-looking app beats a beautiful one with wrong balances."*

### 1.4 UI requirements

- **[BRIEF]** The UI does not need to be polished. It must be **usable** and make the flow clear: **add people → log expenses → view balances → settle up**.

### 1.5 Non-requirements (explicitly out of scope per the brief)

- **[BRIEF]** No authentication, user accounts, or multi-user support.
- **[BRIEF]** UI polish is explicitly deprioritised.
- **[BRIEF]** Covering every edge case is explicitly deprioritised relative to calculation correctness.

---

## 2. Bonus requirements

Everything in this section is marked in the brief as optional. None of it may be delivered at the expense of §1.

| # | Requirement | Source |
|---|---|---|
| B1 | Handle splits that **don't add up**: percentages ≠ 100%, exact amounts ≠ total. Brief: *"If you have time left over... this is a bonus, not required."* | [BRIEF] |
| B2 | Implement **percentage split** as well as exact-amount split. The brief requires only one of the two; building both is beyond the requirement. | [DERIVED] |

- **[ASSUMPTION]** For B1, an invalid split is **rejected at entry** with a clear message naming the discrepancy (e.g. "Exact amounts total Rs. 9,999.99, expense is Rs. 10,000.00 — short by Rs. 0.01"). It is never silently absorbed, auto-corrected, or persisted. Rationale: silently repairing a split would make balances untraceable to their inputs, which conflicts with M8's reconciliation guarantee.

---

## 3. Assumptions

The brief explicitly leaves the following to our judgment and asks that assumptions be noted in the README. They are recorded here and will be summarised in the README.

### 3.1 Left to judgment by the brief

| # | Area | Assumption | Brief's position |
|---|---|---|---|
| A1 | **Persistence** | `localStorage`, storing integer cents. | [BRIEF] *"In-memory, localStorage, a local file, a database — pick whatever lets you spend the most time on the split/settle-up logic rather than infrastructure."* |
| A2 | **Currency** | LKR only. No multi-currency, no FX, no currency selector. Display format `Rs. 1,234.56`. | [BRIEF] *"Assume a single currency (LKR)."* |
| A3 | **Tech stack** | React + TypeScript + Vite; Vitest + React Testing Library. | [BRIEF] *"Use whatever you're fastest and most comfortable in."* |

### 3.2 Assumptions on points the brief does not address

These are **our** calls. The brief is silent on each; none is a stated requirement.

| # | Assumption | Rationale |
|---|---|---|
| A4 | **Sub-unit.** 1 LKR = 100 cents; all money is stored as integer cents. The brief itself refers to "an extra cent (i.e., a fraction of a rupee)", so cents are the atomic unit. | Required to satisfy M8 exactly. |
| A5 | **Reconciliation is exact, not approximate.** Net balances sum to exactly 0 cents at all times. See §6. | Page 1 of the brief is stricter than page 3; we adopt the stricter reading. |
| A6 | **"Single-session" means no accounts, not no persistence.** State survives a page reload; the brief lists persistence options, so persistence is clearly permitted. There is no session expiry and no sync. | Reconciles two brief statements; see §6. |
| A7 | **A payer need not be part of the split.** The brief's own scenario has Carol pay Rs. 10,000 split only among Alice, Bob and Dave. Payer participation is therefore independent of split membership. | Directly implied by the brief's verification scenario. |
| A8 | **Split participants must be a non-empty subset of the group.** An expense with an empty split set is rejected. | Not stated; an empty split has no defined meaning. |
| A9 | **Person removal is outside the required scope.** People can be added (M1) but not removed in this delivery. If removal is added later, it is offered only for people with **no expense references** — no reassignment or void semantics are modelled. | Avoids inventing deletion semantics (reassign? void expenses?) that the brief does not specify. **Locked**, see `DECISIONS.md`. |
| A10 | **Names must be unique, case-insensitively, after trimming whitespace.** Adding a person whose trimmed name matches an existing person's trimmed name (ignoring case) is rejected with a clear message. Each person also has a stable internal id. | Prevents two people from being indistinguishable in the balances/settle-up UI, which would make "who owes whom" ambiguous — a direct risk to M6/M7. **Locked**, see `DECISIONS.md`. |
| A11 | **Amounts are positive.** Zero and negative expense amounts are rejected. Refunds/settlement records are not modelled. | Not mentioned in the brief; modelling refunds would be inventing a requirement. |
| A12 | **Maximum representable amount** is bounded by JS safe integers; practically capped at Rs. 90,000,000,000,000 (9e15 cents) with validation. | Implementation constraint of integer-cent arithmetic. |
| A13 | **The settle-up plan is deterministic.** Where several distinct minimal plans exist, ties are broken by preferring direct debtor-to-creditor transfers, then by stable group creation order, so the same data always renders the same plan. | Not required, but necessary for testability and for a trustworthy UI. **Locked**, see `DECISIONS.md` §10. |
| A14 | **No `.env` file is used.** The app has no API keys or server config. | The brief's `.env` submission clause therefore does not apply; see §4. |
| A15 | **Single group.** One group of people per browser profile; no multi-group or trip-switching UI. | Brief consistently says "a group", singular. |

---

## 4. Submission requirements

| # | Requirement | Source |
|---|---|---|
| S1 | A **public GitHub repo link** containing the working app. | [BRIEF] |
| S2 | A **README in the repo** covering: **how to run it**. | [BRIEF] |
| S3 | README: **the assumptions you made and why**. | [BRIEF] |
| S4 | README: **anything you'd do differently, or build next, with more time**. | [BRIEF] |
| S5 | README: **anything you left incomplete, and why you prioritised the way you did**. | [BRIEF] |
| S6 | If the project uses a `.env` file, **do not commit it**; instead copy its contents into a plain `.txt` file (e.g. `env-values.txt`) and send it separately. | [BRIEF] |

- **[ASSUMPTION]** S6 is not triggered: this app has no `.env` file (A14). If one is ever introduced, it must be git-ignored and its contents sent separately as a `.txt`.
- **[ASSUMPTION]** The company additionally requires a record of the AI prompts used; this is kept in `docs/PROMPTS.md`, which is human-authored and off-limits to coding agents (`AGENTS.md` §8).
- **[BRIEF]** *"It's fine — expected, even — to leave some things unfinished."* Anything unfinished must be named in the README under S5 rather than quietly omitted.
- **[ASSUMPTION]** The assignment PDF stays in the git-ignored `reference/` directory and is never tracked or redistributed.

---

## 5. Acceptance criteria

An implementation is accepted only when **all** of the following hold.

### 5.1 The brief's own verification scenario

**[BRIEF]** *"Try This Before You Submit — run this scenario through your app and sanity-check the output."*

Group: Alice, Bob, Carol, Dave.

1. Alice paid Rs. 12,000, split equally among all 4.
2. Carol paid Rs. 10,000, split by exact amount — Alice Rs. 3,333.33, Bob Rs. 3,333.33, Dave Rs. 3,333.34.
3. Dave paid Rs. 6,000, split equally between Dave and Bob only.

The brief requires that:

- **[BRIEF]** Final balances sum to approximately Rs. 0 (within a cent). *We hold ourselves to exactly Rs. 0 — see A5 and §6.*
- **[BRIEF]** The Settle Up screen shows a minimised set of transactions, not every pairwise debt.
- **[BRIEF]** No one is double-counted or missing from a split they should be part of.

**[DERIVED]** Expected net balances (computed and verified — full working in `docs/TEST_PLAN.md` A5):

| Person | Net (cents) | Net (LKR) |
|---|---:|---:|
| Alice | +566,667 | +Rs. 5,666.67 |
| Bob | −933,333 | −Rs. 9,333.33 |
| Carol | +700,000 | +Rs. 7,000.00 |
| Dave | −333,334 | −Rs. 3,333.34 |
| **Sum** | **0** | **Rs. 0.00** |

**[DERIVED]** The minimum settlement for this scenario is **3 transactions** (no proper zero-sum subgroup exists, so the bound is *n* − 1 = 3).

### 5.2 Acceptance criteria list

| # | Criterion | Traces to |
|---|---|---|
| AC1 | Group size is unbounded; the app is correct for 2 people and for 10+. | M1 |
| AC2 | An expense records amount, payer, split participants, and split method. | M2 |
| AC3 | Equal split distributes the exact total with no cent created or lost. | M3, M8 |
| AC4 | Exact-amount split accepts per-person amounts and validates their sum against the total. | M4 |
| AC5 | Editing an expense recomputes all balances correctly; no stale balance persists. | M5 |
| AC6 | Deleting an expense recomputes all balances correctly; deleting every expense returns all balances to exactly 0. | M5 |
| AC7 | Running balances are shown per person as net owed / net owing. | M6 |
| AC8 | **The sum of all net balances is exactly 0 cents after every operation** — add, edit, delete, in any order. | M8, A5 |
| AC9 | Every split allocates the full expense total: `sum(shares) == total` exactly, for every split method, for every group size. | M8 |
| AC10 | Remainder cents are allocated by a **documented, deterministic** rule; identical inputs always produce identical shares. | M8 |
| AC11 | Rs. 100 split three ways yields 33.34 / 33.33 / 33.33 (in some deterministic order) and never 33.33 × 3. | M8 (brief's example) |
| AC12 | The settle-up plan uses a **provably minimum** number of transactions, computed by an exact algorithm with no size-based fallback to an unproven heuristic. | M7 |
| AC13 | The settle-up plan is **not** a list of every pairwise debt. | M7 |
| AC14 | The settle-up plan's transfers, when applied, bring every balance to exactly 0. | M7, M8 |
| AC15 | Every transfer amount in the plan is strictly positive; no zero-amount or self-directed transfers. | M7 |
| AC16 | The known greedy counterexample (`docs/TEST_PLAN.md` A8) produces 3 transactions via the exact algorithm, not 4. | M7 |
| AC17 | The brief's scenario produces exactly the balances in §5.1 and a 3-transaction plan. | Brief §"Try This" |
| AC18 | A payer who is not among the split participants is handled correctly (Carol's expense). | A7, brief scenario |
| AC19 | Nobody is double-counted in or missing from a split. | Brief check list |
| AC20 | No floating-point value is stored, summed, compared, or persisted as money. | A4, `DECISIONS.md` §5 |
| AC21 | State survives a page reload; corrupt or absent stored state degrades to an empty group without crashing. | A1, A6 |
| AC22 | The flow add people → log expenses → view balances → settle up is navigable and clear. | UI requirement |
| AC23 | Domain logic is pure and testable without rendering React. | `AGENTS.md` §2 |
| AC24 | README covers S2–S5. | S2–S5 |
| AC25 | The assignment PDF is not a tracked file. | Project constraint |

---

## 6. Clarifications and stricter interpretations

None of the points below are treated as blocking contradictions. In every case the brief states two framings of the same requirement at different points, one looser and one stricter (or one general and one brief-specific); we adopt the stricter or more specific reading and confirm it also satisfies the looser one. Recorded verbatim so the resolution is auditable.

**Exact zero is a stricter result that also satisfies "within a cent."**
Page 1: *"balances always reconcile to zero, not to Rs. 99.99 or Rs. 100.01."* Page 3: *"Final balances sum to approximately Rs. 0 (within a cent)."* We hold to the page-1 bar — balances sum to **exactly** 0 cents, always (A5) — which is a strict subset of, and therefore automatically satisfies, the page-3 tolerance check.

**"Single-session" and `localStorage` are compatible.**
Page 1: *"this is a single-session tool, not a multi-user app."* Page 2 explicitly lists `localStorage` among acceptable persistence choices. Persistence is left to judgment by the brief itself, so "single-session" is read as a statement about **identity and accounts** — no login, no multi-user — not a prohibition on state surviving a reload (A6).

**"Minimum" and "minimized" are resolved by the clearer, stronger wording.**
Page 1: *"the minimum number of transactions."* Page 3: *"a minimized set of transactions, not every pairwise debt."* Page 1's "minimum" is the more precise and more demanding requirement, so it governs: the app implements the **provable minimum**, not merely an improvement over the pairwise list (`DECISIONS.md` §10).

**LKR cents are an implementation model the brief's own examples require, not a contradiction.**
The LKR cent is not in everyday circulation, but the brief's rounding example ("an extra cent, i.e., a fraction of a rupee") and its verification scenario (Rs. 3,333.33 / Rs. 3,333.34) both depend on two-decimal precision. Modelling 100 cents to the rupee (A4) is simply what makes the brief's own worked numbers representable.

---

## 7. Decisions locked with the project owner

The following were previously open judgment calls; they are now decided and binding. Each links to its full rationale in `docs/DECISIONS.md`.

1. **Split methods.** Equal and exact-amount splits only (M3, M4). Percentage split (B2) is explicitly future work, not part of this delivery.
2. **Invalid exact-amount splits (B1).** Rejected at entry, with a message naming the discrepancy. Never silently absorbed or auto-corrected.
3. **Person removal.** Out of required scope for this delivery. If added later, only people with no expense references may be removed (A9).
4. **Remainder-cent allocation.** The extra cent(s) from an equal split go to the first participants in stable group creation order (A10, `DECISIONS.md` §9).
5. **Tie-break among multiple minimal settlement plans.** Prefer direct debtor-to-creditor transfers, then stable group creation order (A13, `DECISIONS.md` §10).
6. **Duplicate names.** Rejected case-insensitively after trimming whitespace — two people cannot share an indistinguishable display name (A10).

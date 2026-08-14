# Test Plan

Scope: the domain layer (money, splits, balances, settlement) plus the UI paths that prove edit/delete recalculation. Money is always integer cents; every expected value below is stated in cents and in LKR.

References: `docs/PROJECT_SPEC.md` (M/A/AC ids), `docs/DECISIONS.md` (§ numbers).

Runner: Vitest. Component tests: React Testing Library. Property tests: `fast-check`.

The suite is split into two parts. **Part A is the core submission suite** — it must exist, pass, and never be weakened to make a build pass (`AGENTS.md` §4–§5). **Part B is additional coverage to add if time permits**; it deepens confidence but is not required for submission. See §10 for the definition of done.

---

## 1. Test layout

| Suite | File (planned) | Kind | Part |
|---|---|---|---|
| Money parse/format | `src/domain/money.test.ts` | pure | A |
| Splits + remainder | `src/domain/split.test.ts` | pure | A |
| Balances | `src/domain/balances.test.ts` | pure | A |
| Settlement (exact) | `src/domain/settle.test.ts` | pure | A |
| Brief scenario | `src/domain/scenario.test.ts` | pure, end-to-end over domain | A |
| Persistence | `src/storage/storage.test.ts` | pure + jsdom | A |
| Flow (RTL) | `src/ui/flow.test.tsx` | RTL | A |
| Extended rounding / edit / balance / optimizer | `src/domain/*.extended.test.ts` | pure | B |
| Properties | `src/domain/properties.test.ts` | property-based | B |
| Percentage split (if built) | `src/domain/percentage.test.ts` | pure | B |

---

# Part A — Core Submission Test Suite

These are the tests required for submission. Every one traces to a mandatory requirement (M1–M8) or an acceptance criterion in `PROJECT_SPEC.md` §5.2.

## A1. Money parsing and formatting

- Parse: `"1234.56"` → 123,456 · `"1,234.50"` → 123,450 · `"Rs. 1234.5"` → 123,450 · `"0.01"` → 1 · `"0"` → 0.
- Reject: `"1.005"` (3 dp), `""`, `"abc"`, `"-5"`, `"1.2.3"`, `NaN`, `Infinity`.
- **`"1.005"` must be rejected, not silently rounded** — parsing by string manipulation, not `Math.round(x * 100)` (`DECISIONS.md` §7).
- Format: 123,456 → `"Rs. 1,234.56"`; 1 → `"Rs. 0.01"`; 0 → `"Rs. 0.00"`; −123,456 → `"−Rs. 1,234.56"`.
- Round-trip: `parse(format(c)) === c` for a representative range of `c`.
- Guard: no domain module references `parseFloat`/`toFixed` on money (grep-based check).

## A2. Rs. 100 divided among three people (the brief's own rounding example)

`allocateEqually(10_000, [p1, p2, p3])` → `[3_334, 3_333, 3_333]` (extra cent to the first participant in stable group creation order, `DECISIONS.md` §9). Sum = 10,000.

Explicitly assert it is **not** `[3_333, 3_333, 3_333]` (= 9,999, i.e. Rs. 99.99) and **not** `[3_334, 3_334, 3_333]` (= 10,001, i.e. Rs. 100.01) — the two failures the brief names by name.

## A3. Exact-split sum validation

| Total | Amounts | Result |
|---:|---|---|
| 1,000,000 | 333,333 / 333,333 / 333,334 | accept (brief's scenario, step 2) |
| 1,000,000 | 333,333 ×3 = 999,999 | reject, short by 1c |
| 1,000,000 | 333,334 ×3 = 1,000,002 | reject, over by 2c |
| 1,000 | 1,000 / 0 | accept (zero share allowed) |
| 1,000 | 0 / 0 | reject (no positive share) |

Rejection carries a message naming the discrepancy and its direction (`DECISIONS.md` §8); it is asserted to never be silently absorbed or redistributed.

## A4. Payer excluded from participants

1. Carol pays 1,000,000, split among Alice/Bob/Dave only (the brief's scenario, step 2). Carol's net = **+1,000,000**; Carol appears in *no* share row (A7, AC18).
2. Payer included: Alice pays 1,200,000 split equally among all 4 → Alice net `1,200,000 − 300,000 = +900,000`, counted once as payer and once as participant, never twice (AC19).
3. Payer not in group → rejected. Participant not in group → rejected. Empty participant list → rejected (A8).
4. Every selected participant has a share row (possibly 0 for exact splits); no unselected person does.

## A5. The complete supplied scenario

Verbatim from the brief ("Try This Before You Submit"):

> **People:** Alice, Bob, Carol, Dave
> 1. Alice paid Rs. 12,000, split equally among all 4
> 2. Carol paid Rs. 10,000, split by exact amount — Alice Rs. 3,333.33, Bob Rs. 3,333.33, Dave Rs. 3,333.34
> 3. Dave paid Rs. 6,000, split equally between Dave and Bob only
>
> Check that: final balances sum to approximately Rs. 0 (within a cent); the Settle Up screen shows a minimized set of transactions, not every pairwise debt; no one is double-counted or missing from a split they should be part of.

### A5.1 Per-expense expected shares

**E1 — Alice pays 1,200,000c, equal among all 4.** `1,200,000 / 4 = 300,000` exactly; remainder 0.

| | Alice | Bob | Carol | Dave |
|---|---:|---:|---:|---:|
| share | 300,000 | 300,000 | 300,000 | 300,000 |
| paid | 1,200,000 | 0 | 0 | 0 |
| **Δ net** | **+900,000** | −300,000 | −300,000 | −300,000 |

**E2 — Carol pays 1,000,000c, exact: Alice 333,333 / Bob 333,333 / Dave 333,334.** Sum = 1,000,000 ✓. Carol is the payer and is not a participant.

| | Alice | Bob | Carol | Dave |
|---|---:|---:|---:|---:|
| share | 333,333 | 333,333 | — | 333,334 |
| paid | 0 | 0 | 1,000,000 | 0 |
| **Δ net** | −333,333 | −333,333 | **+1,000,000** | −333,334 |

**E3 — Dave pays 600,000c, equal between Dave and Bob only.** `600,000 / 2 = 300,000`; remainder 0. Alice and Carol are not participants.

| | Alice | Bob | Carol | Dave |
|---|---:|---:|---:|---:|
| share | — | 300,000 | — | 300,000 |
| paid | 0 | 0 | 0 | 600,000 |
| **Δ net** | 0 | −300,000 | 0 | **+300,000** |

### A5.2 Expected final balances (AC17)

| Person | Net (cents) | Net (LKR) | Position |
|---|---:|---:|---|
| Alice | **+566,667** | +Rs. 5,666.67 | owed |
| Bob | **−933,333** | −Rs. 9,333.33 | owes |
| Carol | **+700,000** | +Rs. 7,000.00 | owed |
| Dave | **−333,334** | −Rs. 3,333.34 | owes |
| **Σ** | **0** | **Rs. 0.00** | — |

Assert `sum === 0` **exactly**, not within a tolerance — the stricter reading holds here too (A5, `PROJECT_SPEC.md` §6).

### A5.3 Expected settlement

No proper subset of `{+566,667, −933,333, +700,000, −333,334}` sums to zero, so the minimum is **3 transactions**. A valid plan:

| From | To | Cents | LKR |
|---|---|---:|---:|
| Bob | Alice | 566,667 | Rs. 5,666.67 |
| Bob | Carol | 366,666 | Rs. 3,666.66 |
| Dave | Carol | 333,334 | Rs. 3,333.34 |

Assertions: `plan.length === 3`; applying every transfer leaves all four balances at exactly 0 (AC14); every `amountCents > 0`, no self-transfer (AC15); total moved = 1,266,667c; the plan is stable across repeated runs and reloads (A13).

⚠️ **This scenario alone does not prove minimality** — greedy also returns 3 here (see A8.3). Optimality is proven by A8 and A10, not by this test.

## A6. Editing and deleting expenses

Domain-level (recompute from the expense list) **and** RTL-level (displayed balances update), against the brief's scenario as the base state.

1. **Edit amount.** Change E1 from 1,200,000 → 1,600,000. New equal share 400,000. Expected: Alice **+866,667**; Bob **−1,033,333**; Carol **+600,000**; Dave **−433,334**. Σ = 0.
2. **Delete one.** Delete E3 → Alice +566,667, Bob −633,333, Carol +700,000, Dave −633,334. Σ = 0.
3. **Delete all.** Every balance exactly 0; settle-up plan is empty (AC6).
4. **No stale state.** After an edit or delete, the settle-up plan is recomputed; the previously rendered plan is gone.
5. **RTL flow.** Add 4 people → log 3 expenses → read balances → open Settle Up → edit E1's amount → balances and plan both update on screen → delete E1 → both update again.

## A7. Balance sum always equals zero

The load-bearing invariant: **`Σ net === 0` exactly, after every operation, always.**

1. After each of E1, E2, E3 individually, and after every prefix of the scenario.
2. Empty group → Σ = 0, no crash. Group with people but no expenses → all nets 0.
3. `net(p) = Σ paid(p) − Σ shares(p)`; every balance and share satisfies `Number.isSafeInteger(v)` — no float leakage.
4. After a `localStorage` save/load round-trip, balances are byte-identical.

## A8. The five-person greedy counterexample

This test exists to make it impossible to ship the greedy shortcut unnoticed. It asserts the **exact algorithm's** transaction count and, separately, that the greedy heuristic alone returns *more* — so it fails loudly if the exact search is ever quietly replaced by greedy's raw output.

### A8.1 The counterexample (machine-verified by exhaustive search)

Balances (cents): Alice **−40,000**, Bob **−30,000**, Carol **+20,000**, Dave **+20,000**, Erin **+30,000**. Σ = 0.

- `greedyMaxMax(...)` → **4** transactions (upper-bound seed only — never the returned answer, `DECISIONS.md` §11).
- `settleExact(...)` → **3** transactions, proven minimal.
- Expected plan: Bob → Erin Rs. 300.00; Alice → Carol Rs. 200.00; Alice → Dave Rs. 200.00.
- Greedy's path (for contrast, not for output): Alice→Erin 300, Bob→Carol 200, Bob→Dave 100, Alice→Dave 100 — it matches the largest debtor to the largest creditor and destroys the exact Bob/Erin pairing.

### A8.2 Anti-regression guards

- A test asserting the settle-up API used by the UI returns the exact algorithm's result, never greedy's raw output, regardless of group size.
- A grep/lint test that no source string calls a result "optimal"/"minimum" outside the exact path.

### A8.3 The negative control (why A5 is not sufficient on its own)

The brief's own scenario `{+566,667, −933,333, +700,000, −333,334}` → greedy **3**, exact **3**. Assert both equal 3, and note in the test that this scenario **cannot by itself** distinguish a correct exact implementation from a plain greedy one. That is exactly the gap A8.1 closes.

## A9. Applying the returned settlement produces zero balances

For every case in this suite (A5.3, A8.1, and the minimum-count table below): applying every transfer in the returned plan, in order, brings all balances to exactly 0. Every transfer amount is strictly positive; no `from === to`.

| Balances (cents) | Expected txns | Note |
|---|---:|---|
| `[]` | 0 | empty |
| `[+100,−100]` | 1 | trivial pair |
| `[+100,+100,−200]` | 2 | one debtor, two creditors |
| `[+500,−500,+300,−300]` | 2 | two independent zero-sum pairs |
| `[+1000,−400,−300,−300]` | 3 | *m*−1 bound, no zero-sum subset |
| A8.1 vector | 3 | greedy says 4 |

## A10. Exact result compared with an independent brute-force oracle

For randomly generated balance vectors of up to 8 non-zero people (integer cents, summing to zero), `settleExact(...).length` is compared against an **independently written** brute-force reference (e.g. try every way to partition the balances into zero-sum groups, by simple recursive enumeration with no pruning or memoization shared with the production solver) — the two must always agree on the transaction count. Run across many seeded random cases, plus the A8.1/A9 fixed cases as anchors.

## A11. localStorage save/load and corrupt-state handling

1. Save the brief's scenario, reload, recompute balances → byte-identical to before the save.
2. Unknown/missing storage key → empty group, no crash.
3. Malformed JSON, wrong `version`, non-integer `amountCents`, or a reference to an unknown person id → payload rejected, app starts empty, no wrong balance is ever rendered (AC21).
4. Reads/writes are confined to one storage adapter module; the domain layer is never exercised with a `localStorage` import (`AGENTS.md` §2).

## A12. One complete UI flow test

Add people (Alice, Bob, Carol, Dave) → log the brief's three expenses → view running balances matching A5.2 → open Settle Up and see the 3-transaction plan from A5.3 → confirm the flow add people → log expenses → view balances → settle up is navigable end to end in one RTL test.

---

# Part B — Additional Tests (Time Permitting)

Everything below deepens coverage but is not required for submission (`§10`). None of it may be built at the expense of Part A.

## B1. Extended rounding exactness table

Beyond A2, assert `sum(shares) === total` across a wider set of divisions:

| Total (cents) | n | base | remainder | Expected shares |
|---:|---:|---:|---:|---|
| 10,000 | 6 | 1,666 | 4 | 1,667 ×4, 1,666 ×2 |
| 10,000 | 7 | 1,428 | 4 | 1,429 ×4, 1,428 ×3 |
| 1,000 | 7 | 142 | 6 | 143 ×6, 142 ×1 |
| 1 | 3 | 0 | 1 | 1 / 0 / 0 |
| 5 | 7 | 0 | 5 | 1 ×5, 0 ×2 |
| 100 | 100 | 1 | 0 | 1 ×100 |
| 99 | 100 | 0 | 99 | 1 ×99, 0 ×1 |
| 123,456 | 4 | 30,864 | 0 | 30,864 ×4 |

Plus determinism checks: shuffling `participantIds` does not change who gets the extra cent (creation order governs, not array order); serialise → reload → recompute → identical shares.

## B2. Additional greedy counterexamples

Same exhaustive-search provenance as A8 (balances in rupees ×100):

| # | Balances | greedy | exact |
|---|---|---:|---:|
| a | −300, −200, −200, +300, +400 | 4 | 3 |
| b | −500, −400, +200, +300, +400 | 4 | 3 |
| c | −400, −300, −200, +400, +500 | 4 | 3 |
| d | −600, −400, +300, +300, +400 | 4 | 3 |
| e | −600, −300, +200, +200, +200, +300 | 5 | 4 |
| f | −300, −200, −200, −200, +300, +600 | 5 | 4 |

Search provenance: over all 4-, 5- and 6-person integer balance vectors with components in ±1…±6, no 4-person case defeats greedy; the smallest failures are at 5 people (120 distinct vectors, 30 distinct multisets) — which is why A8 uses a 5-person example.

## B3. Extended edit/delete scenarios

1. Edit payer (E1 payer Alice → Bob) and re-verify Σ = 0.
2. Edit participants (remove Carol from E1 → 1,200,000 / 3 = 400,000 exactly).
3. Edit split method (equal → exact → equal) and confirm shares return to their original values.
4. Edit into a remainder boundary (1,000,000 → 1,000,001 equal among 4 → 250,001/250,000/250,000/250,000).
5. Delete the exact-split expense (E2) in isolation and re-verify Σ = 0.
6. Delete then re-add identical data → balances identical to before the delete.
7. Order independence: adding E1/E2/E3 in any of the 6 permutations, then deleting E2, gives the same balances.
8. Delete a non-existent id → no-op or explicit error, never a partial mutation.

## B4. Extended balance reconciliation

1. A randomised sequence of add/edit/delete operations (seeded, reproducible) — Σ = 0 after *every* step.
2. A larger synthetic group (dozens of people, awkward totals) — Σ = 0.
3. Repeated remainder pressure: many tiny expenses split unevenly — Σ = 0 and each share vector matches the floor/remainder rule.
4. `net(p)` cross-checked against an independently written second summation for the same data.

## B5. Extended exact-solver behaviour

- Determinism: same balances → identical plan across runs, reloads, and input orderings.
- Duplicate balances (e.g. `[+200,+200,−200,−200]`) → 2 transactions, exercising the memoization path (`DECISIONS.md` §10 step 4).
- A moderately large non-zero-balance count (e.g. 12–15 people with no zero-sum subset) completes in reasonable time and still returns a proven-minimal plan — documenting that runtime grows, not that the algorithm changes (`DECISIONS.md` §10, "complexity — stated honestly"). This is a performance/sanity check, not a correctness boundary: there is no group size at which the returned answer stops being proven minimal.
- Branch-and-bound sanity: a case where the greedy seed is already optimal (so the search should prune almost immediately) and a case where it is not (so the search must find something shorter than the seed).

## B6. Property-based test ideas (`fast-check`)

Generators: `personId` (small stable pool), `amountCents` (positive safe integers within A12), `participantSubset` (non-empty), `expense` (equal or exact), `ledger` (list of expenses over a group of 1–12 people), `balanceVector` (integers summing to 0).

**Splits** — conservation (`sum(allocateEqually(...)) === total`); bounded spread (max − min share ≤ 1 cent); every share ∈ `{floor, floor+1}`; determinism; order invariance under participant reordering; non-negativity.

**Balances** — zero sum for any ledger; additivity across concatenated ledgers; delete inverts add; edit = delete + add; reorder invariance; integrality; storage round-trip.

**Settlement** — applying the plan always settles every balance; never worse than greedy's count; upper bound `plan.length ≤ m − 1`; scale invariance (multiplying all balances by a positive integer *c* leaves the plan length unchanged); sign symmetry; positivity of every transfer; determinism.

**Money** — parse/format round-trip for any safe-integer cents; parse is total or cleanly rejecting, never `NaN`/`Infinity`.

**End-to-end** — for any ledger, applying the settle-up plan to the derived balances leaves every person at exactly 0: the one property tying the split methods, the reconciliation guarantee, and the settlement algorithm together.

## B7. Percentage split tests (bonus B2, only if built)

Brief's alternative scenario: *"Carol paid Rs. 10,000, split by percentage — Alice 40%, Bob 30%, Dave 30%."* Expected via largest-remainder allocation (`DECISIONS.md` §9): 400,000 / 300,000 / 300,000, sum 1,000,000 exactly. Resulting balances: Alice +500,000, Bob −900,000, Carol +700,000, Dave −300,000; Σ = 0. Plus: percentages not summing to 100% are rejected at entry (mirrors A3 for exact amounts).

## B8. Additional money-formatting properties

Monotonic formatting (`a < b` ⇒ `format(a)` sorts before `format(b)` numerically when re-parsed); locale grouping edge cases (very large and very small amounts); negative-balance display formatting (`−Rs. …`).

---

## 10. Definition of done for this suite

- **Part A only is required for submission.** Every core acceptance criterion in `PROJECT_SPEC.md` §5.2 maps to at least one Part A test.
- A5, A8.1, and A8.3 are non-negotiable and may never be weakened or skipped to make a build pass (`AGENTS.md` §4).
- Part B items are added opportunistically; none is a submission blocker, and none may be used to justify cutting a Part A test.
- Test results are reported as actually run, failures included (`AGENTS.md` §5).

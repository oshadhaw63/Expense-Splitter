# Technical Decisions

Each decision is stated with its context, the decision itself, the alternatives rejected, and the consequences. These are locked; changing one requires updating this document first (`AGENTS.md` §1).

Requirement references (M1–M8, A1–A15, AC1–AC25) point at `docs/PROJECT_SPEC.md`.

---

## 1. React

**Status:** Accepted. **Traces to:** A3 (brief: *"Use whatever you're fastest and most comfortable in."*)

**Decision.** Build the UI as a single-page React application.

**Why.** The brief's required flow — add people → log expenses → view balances → settle up — is a small amount of state re-rendered from several views. React's derived-render model means balances and the settle-up plan are *computed from* the expense list on every render rather than stored and mutated, which structurally prevents the stale-balance class of bug that M5 (edit/delete recalculation) is specifically probing. No routing library or state library is needed at this size.

**Alternatives rejected.**
- *Vanilla TS + DOM.* Fewer moving parts, but manual DOM updates after an edit or delete are exactly where balance-staleness bugs live.
- *Next.js.* Brings SSR, routing and a server story that a no-login, no-backend, single-session tool (M/brief §1.1) does not need.
- *Svelte / Vue.* No technical objection; React is chosen for fluency, per the brief's own instruction.

**Consequences.** React is a UI concern only. It must not leak into the domain layer (`AGENTS.md` §2), because the domain layer is the part being graded (brief: *"Prioritize correctness of the split calculations and the settle-up logic over UI polish"*).

---

## 2. TypeScript

**Status:** Accepted. **Traces to:** A3, A4, AC20.

**Decision.** TypeScript throughout, in `strict` mode.

**Why.** The central invariant of this project is *money is an integer number of cents, never a float* (§5). TypeScript lets that invariant be encoded in the type system rather than left to discipline:

- A branded type — `type Cents = number & { readonly __brand: 'Cents' }` — makes it a compile error to pass a raw `number` (a rupee amount, a percentage, an array index) where cents are expected. Values enter the brand only through the validated parser.
- Discriminated unions model the split methods (`{ kind: 'equal' } | { kind: 'exact', amounts: ... }`), so adding percentage split later (B2) produces exhaustiveness errors at every site that must handle it, rather than silent fall-through.
- `readonly` types on domain inputs enforce the purity rule in `AGENTS.md` §2.

**Alternatives rejected.**
- *JavaScript with JSDoc.* Gets some checking, but branded nominal types — the specific mechanism protecting the money invariant — are far weaker.
- *Non-strict TypeScript.* `strictNullChecks` off would let an undefined balance silently become `NaN`, which is precisely the failure mode AC8 forbids.

**Consequences.** `strict: true`, `noUncheckedIndexedAccess: true`. `any` is not used in domain code. Type-checking runs in CI alongside tests.

---

## 3. Vite

**Status:** Accepted. **Traces to:** A3, brief: *"pick whatever lets you spend the most time on the split/settle-up logic rather than infrastructure."*

**Decision.** Vite as dev server and build tool, via the `react-ts` template.

**Why.** Near-zero configuration for a React + TS SPA, and it shares its transform pipeline and config file with Vitest (§4) — one config, one resolver, one set of aliases for both app and tests. That directly serves the brief's instruction to minimise infrastructure time.

**Alternatives rejected.**
- *Create React App.* Deprecated and unmaintained.
- *Webpack / Rollup by hand.* Configuration time spent on infrastructure the brief explicitly deprioritises.
- *Parcel.* Comparable, but does not give the shared-config benefit with the test runner.

**Consequences.** Static build output; deployable as static files, though the brief only asks for a repo and run instructions (S1, S2).

---

## 4. Vitest and React Testing Library

**Status:** Accepted. **Traces to:** A3, `docs/TEST_PLAN.md`, AC23.

**Decision.** Vitest as the test runner; React Testing Library (with `@testing-library/jest-dom` and `user-event`) for component tests. `jsdom` environment for UI tests; the default environment for domain tests.

**Why.**
- **Vitest** reuses the Vite config (§3), so tests resolve modules exactly as the app does — no second build pipeline to keep in sync. It runs TypeScript natively, and its watch mode is fast enough that the domain suite can be run continuously while the split and settlement algorithms are developed. Its Jest-compatible API means no bespoke idioms.
- **React Testing Library** tests through the rendered output and user interactions rather than component internals. That matters for M5: the assertion "after editing this expense, the displayed balances are correct" must be made against what the user actually sees, since a stale balance is a *rendering* bug as much as a calculation bug.
- The split is deliberate: the bulk of the suite is fast, pure domain tests with no DOM (AC23); RTL covers the flow and the edit/delete recalculation path.

**Alternatives rejected.**
- *Jest.* Requires a separate transform/config stack alongside Vite, plus ESM friction — infrastructure time for no gain here.
- *Enzyme.* Unmaintained, and its internals-focused API is the wrong shape for these assertions.
- *Playwright / Cypress as the primary suite.* Valuable end-to-end, but too slow to be the feedback loop for algorithmic work, and the brief prioritises calculation correctness over UI coverage.

**Consequences.** `fast-check` is the intended companion for the property-based tests in `TEST_PLAN.md` B6; it integrates with Vitest without extra configuration. Coverage is reported but not treated as a goal in itself — the goal is the scenarios in `TEST_PLAN.md`.

---

## 5. localStorage persistence

**Status:** Accepted. **Traces to:** A1, A6, AC21. Brief: *"In-memory, localStorage, a local file, a database — pick whatever lets you spend the most time on the split/settle-up logic rather than infrastructure."*

**Decision.** Persist application state to `localStorage` under a single versioned key, storing **all money as integer cents**.

**Why.** It is on the brief's own list of acceptable options, needs no backend, no schema migration tooling, and no build step — the least infrastructure of any option that survives a page reload. Surviving a reload matters for a grader who is working through the verification scenario (`PROJECT_SPEC.md` §5.1) across several steps.

**Shape.**

```jsonc
// key: "expense-splitter/v1"
{
  "version": 1,
  "people":   [ { "id": "p_01H…", "name": "Alice" } ],
  "expenses": [ {
      "id": "e_01H…",
      "description": "Dinner",
      "amountCents": 1200000,          // integer cents, never a decimal
      "paidByPersonId": "p_01H…",
      "split": { "kind": "equal", "participantIds": ["p_…","p_…"] }
      // or: { "kind": "exact", "amountsCents": { "p_…": 333333, … } }
  } ]
}
```

Only the **inputs** are persisted. Balances and the settle-up plan are always recomputed from the expense list; they are never stored. A stored derived value could disagree with its inputs after an edit — exactly the M5/AC5 failure mode.

**Load is defensive.** Unknown or missing key → empty group. Malformed JSON, wrong `version`, non-integer `amountCents`, references to unknown person ids → reject the payload, start empty, surface a non-blocking notice. A parse failure must never render a wrong balance (AC21). Reads and writes are confined to one adapter module so the domain layer stays storage-free (`AGENTS.md` §2).

**Alternatives rejected.**
- *In-memory only.* Simplest, but a page refresh mid-scenario discards the grader's work.
- *IndexedDB.* Async and far more API surface than a few kilobytes of state needs.
- *A backend + database.* Directly contradicts *"no login or user accounts... single-session tool"* and the brief's instruction to avoid infrastructure.

**Consequences.** State is per-browser-profile and per-origin — not shared between devices or users. That is consistent with the brief's single-session framing (A6). `localStorage` is synchronous and size-limited (~5 MB), both irrelevant at this scale.

---

## 6. LKR as the only currency

**Status:** Accepted. **Traces to:** A2, A4, C4. Brief: *"All amounts are in Sri Lankan Rupees (LKR)"* and *"Assume a single currency (LKR)."*

**Decision.** LKR is the only currency. No currency field on any entity, no selector, no exchange rates. Money is stored as integer **cents**, where 1 LKR = 100 cents. Display format is `Rs. 1,234.56` — grouped thousands, always exactly two decimal places, via `Intl.NumberFormat('en-LK')` with a fixed fallback.

**Why.** The brief states it twice. Modelling a currency dimension would add a field to every amount and a compatibility check to every operation, with no requirement behind it — inventing scope the brief excluded.

The **cent** is the atomic unit because the brief's own rounding example demands it: *"an extra cent (i.e., a fraction of a rupee)"*, and the verification scenario contains Rs. 3,333.33 and Rs. 3,333.34. Two-decimal precision is therefore a requirement, not a display preference. (The LKR cent is not in everyday circulation; the brief nonetheless specifies this precision, and the brief governs — recorded as contradiction C4.)

**Alternatives rejected.**
- *A currency-tagged `Money` type.* Correct in a real product; unnecessary abstraction against an explicit single-currency instruction.
- *Whole rupees only.* Would make the brief's scenario (3,333.33 / 3,333.34) unrepresentable and defeat the rounding exercise that the brief calls *"the actual point"*.

**Consequences.** All formatting lives in one module. Parsing accepts `1234.5`, `1,234.50`, `Rs. 1234.50`; rejects more than two decimal places rather than silently truncating a user's third digit.

---

## 7. Integer cents for all money

**Status:** Accepted. **Traces to:** A4, AC9, AC20, M8. **Enforced by:** `AGENTS.md` §3.

**Decision.** Every monetary value that is stored, compared, summed, or persisted is a **safe integer number of cents**. Floating-point appears at exactly two boundaries — parsing a typed decimal string into cents, and formatting cents into a display string — both isolated in one module and covered by tests.

**Why.** IEEE-754 binary doubles cannot represent most decimal fractions. `0.1 + 0.2 === 0.30000000000000004`. Summing 0.01 a hundred times does not give 1. The brief's mandatory requirement is that balances reconcile to zero *and not to Rs. 99.99 or Rs. 100.01* (M8) — which is precisely the drift a float accumulator produces. Integer cents make `sum(balances) === 0` an exact, testable, non-negotiable assertion (AC8) rather than a tolerance check.

It also removes the whole category of comparison bugs: `balance === 0` is meaningful for integers and unreliable for floats, so no epsilon tolerance is needed anywhere in the settlement solver — which matters, since the solver's correctness depends on recognising exactly-zero subset sums (§8).

**Parsing rule.** A typed decimal string is parsed by **string manipulation**, not `Math.round(parseFloat(s) * 100)`: split on the decimal separator, pad or reject the fractional part to two digits, then combine as integers. `Math.round(x * 100)` is rejected because the multiplication itself can land on the wrong side of a half — the classic case being values like `1.005`, which is stored as slightly less than 1.005 and rounds down to `100` rather than `101`.

**Percentages (bonus B2), if built,** are stored as integers in **basis points** (1% = 100 bp) for the same reason. A share is then `total × bp / 10000` computed with integer arithmetic and an explicit remainder rule (§8), never as `total * 0.3333`.

**Alternatives rejected.**
- *Floating-point rupees.* Fails M8 by construction.
- *`decimal.js` / `dinero.js`.* Correct, but a dependency and an API to learn for a problem where two-decimal fixed precision is fully served by integers within `Number.MAX_SAFE_INTEGER` (≈ Rs. 90 trillion, bounded by A12).
- *`BigInt`.* Exact, but no ergonomic JSON serialisation, no mixing with `number`, and unnecessary below 2⁵³.

**Consequences.** Every domain function signature speaks in cents. Any code path that reintroduces a float into stored money is a defect, regardless of whether a test currently catches it.

---

## 8. Equal and exact-amount splits

**Status:** Accepted. **Traces to:** M3, M4, AC3, AC4, AC9.

**Decision.** Implement **equal split** (required, M3) and **exact-amount split** as the second method (M4 offers a free choice between percentage and exact amount). Percentage split is bonus B2 and out of the committed scope.

**Why exact amount over percentage.** The brief's own verification scenario is written in exact amounts — *"Carol paid Rs. 10,000, split by exact amount — Alice Rs. 3,333.33, Bob Rs. 3,333.33, Dave Rs. 3,333.34"* — and offers the percentage variant only as a substitute *"if you chose Percentage instead"*. Implementing exact amounts lets the delivered app be checked against the brief's primary worked example without translation. Exact amounts also have no rounding step of their own: the user supplies cents directly, so the only obligation is validating that they sum to the total. That keeps the rounding machinery concentrated in one place — the equal split (§9) — where it can be tested exhaustively.

**Equal split contract.**

```
shares = allocateEqually(totalCents, participantIds)
  base      = floor(totalCents / n)
  remainder = totalCents - base * n        // 0 ≤ remainder < n
  → `remainder` participants receive base + 1; the rest receive base
  → sum(shares) === totalCents, exactly, for every n ≥ 1     (AC9)
```

Which participants receive the extra cent is fixed by §9.

**Exact-amount split contract.** The user supplies a cent amount per participant. The split is valid only if `sum(amounts) === totalCents`. A mismatch is **rejected at entry** with a message naming the discrepancy and its direction; it is never absorbed, rounded away, or redistributed. Per-participant amounts must be non-negative integers, and at least one must be positive.

**Common rules for both.**
- Participants are a non-empty subset of the group (A8).
- The payer need not be a participant (A7) — Carol's expense in the brief's scenario.
- If the payer *is* a participant, they are counted once as payer and once as participant; their net contribution is `paid − ownShare`. This is the "no one is double-counted" check in the brief.
- Balance derivation: `net(p) = Σ(amounts p paid) − Σ(shares assigned to p)`, in cents. Since every split satisfies `sum(shares) === total`, `Σ net(p) === 0` identically — AC8 holds by construction, not by correction.

**Alternatives rejected.**
- *Percentage as the second method.* Adds a second rounding surface (percentage → cents) before the first is proven, and is the brief's secondary example.
- *Shares/weights ("Alice counts double").* Not in the brief. Inventing it is out of scope.
- *Auto-correcting an exact-amount mismatch* by absorbing the difference into the largest share. Silent, untraceable, and contrary to the reconciliation guarantee.

---

## 9. Deterministic remainder-cent allocation

**Status:** Accepted. **Traces to:** M8, AC10, AC11. Brief: *"If Rs. 100 is split three ways, someone ends up with an extra cent... Show how your app handles this so that balances always reconcile to zero."*

**Decision.** When `totalCents` does not divide evenly among *n* participants, the `remainder` extra cents are given, one each, to the **first `remainder` participants in stable group creation order** — the order people were added to the group — restricted to whichever of them are participants in this split.

```
Rs. 100 split 3 ways  →  10,000 cents, base = 3,333, remainder = 1
                      →  3,334 / 3,333 / 3,333   (sum = 10,000 exactly)
```

**Why this rule.**

1. **It is total.** Every cent is assigned. `sum(shares) === total` for all *n* and all totals, with no residue to reconcile afterwards (AC9).
2. **It is deterministic.** The same expense always yields the same shares — across reloads, across machines, and independent of the order the user clicked participants or the order they happen to sit in an array. Determinism is what makes AC10 and AC11 testable at all; a rule keyed to array order would silently change results when the UI re-sorted a list.
3. **It is auditable.** A person can be told exactly why they carry the extra cent, and the rule fits in one sentence in the README.
4. **The bias is bounded and negligible, and the rule is now locked.** The extra cent is at most 1 cent per expense per person — one hundredth of a rupee. Rotating the starting offset (e.g. by a hash of the expense id) would spread the burden across expenses at the cost of a rule that is harder to explain and to verify by hand; that alternative was considered and rejected in favour of the simpler, fully auditable creation-order rule (`PROJECT_SPEC.md` §3.2, A10).

**Negative totals** do not arise (A11: amounts are positive). Should they ever be introduced, `floor` division on negatives changes the sign of the remainder, so the allocator must be re-derived — noted so the invariant is not assumed to survive.

**For percentage splits (bonus B2), if built:** use the **largest-remainder (Hare quota) method** — floor each share, then hand the leftover cents to the participants with the largest fractional remainders, ties broken by stable group creation order. Largest-remainder is chosen over repeated rounding because it, too, is exact by construction: the leftover count always equals the number of participants who can receive one.

**Alternatives rejected.**
- *`toFixed(2)` / round-half-up per share.* Independent rounding does not sum back to the total — the direct cause of the Rs. 99.99 and Rs. 100.01 outcomes the brief names.
- *Dump the whole remainder on the payer.* Concentrates up to *n*−1 cents on one person and is unfair for large groups.
- *Random or "banker's" assignment.* Non-deterministic or non-total; both break AC10.
- *Track a fractional residue and settle it later.* Reintroduces sub-cent state — precisely what integer cents (§7) exists to eliminate.

---

## 10. Exact settlement optimization

**Status:** Accepted. **Traces to:** M7, AC12–AC17. Brief: *"the minimum number of transactions needed to bring everyone's balance to zero (not just a list of every pairwise debt)."*

**Decision.** The Settle Up screen is always produced by an **exact** algorithm. There is no size threshold and no code path that returns a heuristic result as the answer. Every plan the app shows is proven minimal.

**Problem statement.** Given net balances `b₁ … bₙ` (integer cents, `Σ bᵢ = 0`), find the smallest set of transfers that zeroes every balance. Pairwise debts are irrelevant to the answer: only each person's *net* position matters, which is why "every pairwise debt" is not merely verbose but a different, wrong answer to M7.

**The structural fact.** Discard people whose net is 0, leaving *m* people. Any set of transfers that settles a group of *m* mutually-entangled people needs at least *m* − 1 transfers, and *m* − 1 always suffices. If the *m* balances partition into *k* disjoint subsets that **each sum to zero**, the group splits into *k* independent settlements and the true minimum is `m − k`, where *k* is the maximum number of zero-sum parts the balances admit. Finding the answer is therefore a set-partition search — NP-hard in general (it contains subset-sum) — so the honest engineering question is not "avoid exponential work" but "search the exponential space efficiently and always finish with a proof."

**Algorithm — exact recursive backtracking with branch-and-bound and state memoization**, operating directly on the array of non-zero balances (no fixed-width bitmask, so it is not bounded by JS's 32-bit bitwise operators or by `Number`'s 53-bit safe-integer ceiling):

1. Seed an upper bound `best` by running the greedy largest-creditor/largest-debtor pass once (§11) and counting its transactions. This is greedy's *only* role: a starting bound for pruning. It is discarded once the exact search completes and never reaches the UI.
2. Recurse on the current list of non-zero balances. At each call, take the first remaining person `p` (any fixed rule, e.g. first in the array) and try pairing them against every other remaining person `q` with the opposite sign:
   - transfer `min(|p|, |q|)` from the debtor to the creditor,
   - record that transfer,
   - remove whichever of `p`, `q` reached exactly 0 (both, if the transfer zeroed them simultaneously),
   - recurse on the reduced list with the transaction count incremented by one.
3. **Branch-and-bound:** as soon as the running transaction count reaches `best`, abandon that branch — it cannot improve on the best plan already known. Update `best` and the recorded plan whenever a fully-settled branch beats it.
4. **Memoization:** canonicalise a recursion state as the sorted tuple of remaining non-zero balances (values only, not identities) and cache the minimum transaction count found for that shape. Recurring value patterns — duplicate amounts are common in expense-splitting data — collapse onto one cached result instead of being re-explored.
5. Base case: no non-zero balances remain → a fully-settled branch; its transaction count is a candidate for `best`.
6. The winning branch's recorded transfers, replayed in order, **are** the plan: every transfer is a **direct transfer between two original people** (the debtor and creditor active in that step), never a synthetic or intermediate account.

This is the standard exact technique for the "optimal account balancing" problem, generalized with memoization on the value-shape of the remaining state.

**Complexity — stated honestly.** Worst case is exponential in *m* (branching factor up to *m* − 1 at each of up to *m* − 1 levels); there is no polynomial exact algorithm for this problem as far as is known, since it embeds subset-sum. Branch-and-bound (step 3) and memoization (step 4) cut the explored space drastically in practice — most inputs are decided in a small fraction of the naive search tree — but the worst case remains exponential and no bound is imposed on it in code. The expected practical group size for this app is **roughly 2–10 people** (a trip's worth of friends), which the algorithm settles essentially instantly; there is deliberately **no hard participant limit** anywhere in the implementation (M1), so a pathological large input is handled by taking longer to return a proven-minimal answer, not by silently downgrading to an unproven one.

**Determinism.** Where several distinct minimal plans exist, ties are broken, in order: (1) prefer plans composed of **direct debtor-to-creditor transfers with no unnecessary intermediate step** — i.e., among equally-short plans, prefer the one a naïve reading of "who pays whom" would expect; (2) then by **stable group creation order** (the order people were added to the group) at every remaining choice point. The same data therefore always renders the same plan (A13, AC13).

**Output contract.** A list of `{ fromPersonId, toPersonId, amountCents }` with every amount strictly positive, no self-transfers (AC15), and the property that applying every transfer brings all balances to exactly 0 (AC14). There is no `provenMinimal` flag: every returned plan is proven minimal by construction, so no field is needed to qualify it.

**Alternatives rejected.**
- *List every pairwise debt.* Explicitly ruled out by the brief.
- *Greedy alone, or greedy with a size-based fallback to an unproven heuristic.* Not minimal, and a fallback would mean the app sometimes shows an answer it cannot back up — see §11 and `AGENTS.md` §4.
- *Fixed-width bitmask DP (`2^m` masks in a `number`).* Correct at small *m*, but its state space is tied to JS's native integer width and stops being a clean model of "the exact answer, whatever *m* is" — the recursive formulation has no such ceiling.
- *ILP / min-cost flow solver.* A dependency and a heavier model for a problem branch-and-bound search solves exactly at the relevant scale. (Min-cost flow does not model the *count* of transfers as a cost anyway.)

---

## 11. Why greedy settlement alone is insufficient

**Status:** Accepted rationale for §10. **Traces to:** AC12, AC16. **Enforced by:** `AGENTS.md` §4.

The common approach is greedy: repeatedly take the **largest creditor** and the **largest debtor**, transfer `min(credit, debt)`, and repeat. It is appealing — O(n log n), a few lines, and it zeroes at least one person per transfer, so it terminates in at most *m* − 1 transactions.

**That upper bound is the problem.** *m* − 1 is also the *worst-case optimum*. Greedy therefore looks optimal on any group that has no zero-sum subgroup, and it is genuinely optimal in many cases — which is what makes the shortcut so easy to ship unnoticed. Greedy never *seeks* zero-sum subgroups; it finds them only when the largest creditor and largest debtor happen to match exactly. When a zero-sum subgroup exists elsewhere in the group, greedy can cut across it and pay for it with an extra transfer.

**Verified counterexample** (computed by exhaustive search over all 4-, 5- and 6-person integer balance vectors; the smallest failures occur at *m* = 5, and 120 distinct 5-person vectors fail):

| Person | Net balance |
|---|---:|
| Alice | −Rs. 400.00 |
| Bob | −Rs. 300.00 |
| Carol | +Rs. 200.00 |
| Dave | +Rs. 200.00 |
| Erin | +Rs. 300.00 |

*Greedy* — largest debtor Alice (−400) against largest creditor Erin (+300): transfer 300, leaving Alice −100 and Erin settled. Then Bob (−300) against Carol (+200): transfer 200, leaving Bob −100. Then Bob −100 against Dave +200: transfer 100, leaving Dave +100. Then Alice −100 against Dave +100: transfer 100. **4 transactions.**

*Optimal* — the balances partition into two zero-sum groups, `{Bob −300, Erin +300}` and `{Alice −400, Carol +200, Dave +200}`, giving `1 + 2` = **3 transactions**: Bob → Erin Rs. 300.00; Alice → Carol Rs. 200.00; Alice → Dave Rs. 200.00.

Greedy needed 4 because it matched Alice with Erin, destroying the exact Bob/Erin pairing that a partition-aware solver preserves. `m − k` = 5 − 2 = 3.

**Why this matters here specifically.** The brief's own verification scenario (`PROJECT_SPEC.md` §5.1) has balances `+566,667 / −933,333 / +700,000 / −333,334` cents, where greedy and the exact solver **both** return 3 transactions — and exhaustive search confirms greedy is optimal for *every* 4-person case. So **passing the brief's scenario does not demonstrate minimality.** An implementation could ship greedy, pass the brief's check, and still be wrong against M7's stated requirement. That is why the counterexample above is a mandatory test (`TEST_PLAN.md`) and why the exact solver is not optional.

**The honesty rule.** Greedy remains in the codebase for exactly two purposes: seeding the exact search's initial upper bound for branch-and-bound pruning (§10, step 1), and as a differential-testing oracle in tests. It is **never** the source of a result shown in the UI or returned from the settle-up API, at any group size — there is no size threshold above which greedy's own output is surfaced. If greedy's count is ever displayed for debugging or comparison, it is labelled *not proven minimal*, in that language, without softening.

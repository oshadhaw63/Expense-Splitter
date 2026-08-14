# AGENTS.md

Operating rules for coding agents working in this repository

These rules are binding. If a rule conflicts with a user instruction, say so and ask before proceeding.

---

## 1. Read the project documents before editing

Before your first edit in any session, read:

1. `docs/PROJECT_SPEC.md` — what must be built, what is bonus, what is assumed.
2. `docs/DECISIONS.md` — the locked technical decisions and their rationale.
3. `docs/TEST_PLAN.md` — the scenarios the implementation is judged against.

Do not restate or duplicate their content in code comments. If you believe a document is wrong, propose a change to the document first; do not silently implement something that contradicts it.

## 2. Keep domain calculations independent of React

All money, split, balance, and settlement logic lives in a framework-free domain layer (planned: `src/domain/`).

- The domain layer must not import React, React hooks, DOM APIs, `localStorage`, or any UI library.
- Domain functions must be pure: same input → same output, no I/O, no `Date.now()`, no `Math.random()`, no mutation of inputs.
- Anything non-deterministic (id generation, timestamps) is injected by the caller, never read from ambient globals inside the domain layer.
- The UI layer may only call the domain layer; it must never re-derive balances, shares, or settlement transfers on its own.

Rationale: the domain layer must be testable and reviewable without rendering anything.

## 3. Never use floating-point values for stored money

- Every monetary value that is **stored, compared, summed, or persisted** is an integer number of cents (`number` constrained to a safe integer, 1 rupee = 100 cents).
- Floating-point is permitted **only** at two boundaries: parsing a user-typed decimal string into cents, and formatting cents into a display string. Both boundaries live in one dedicated module and are covered by tests.
- Forbidden in domain code: `parseFloat` on money, `0.1 + 0.2`-style arithmetic, `toFixed` for computation, `Math.round(x * 100)` on an unvalidated float, storing rupees as a decimal `number`.
- Never persist a money value as a decimal. `localStorage` payloads store cents as integers.
- Percentages (bonus feature) are also stored as integers in basis points (1% = 100 bp), not as floats.

## 4. Never describe a greedy result as globally optimal

The settle-up feature always returns a **proven-minimum** number of transactions, computed by exact search (see `docs/DECISIONS.md` §10). There is no size threshold that switches the returned answer to a heuristic.

- A greedy largest-creditor/largest-debtor pass is **not** minimal in general. A machine-verified counterexample is recorded in `docs/TEST_PLAN.md`.
- Greedy may be used only to seed the exact search's initial upper bound for branch-and-bound pruning, and as an oracle in tests. It is never returned as the Settle Up answer, under any group size.
- Never write code comments, UI copy, commit messages, README text, or chat summaries that call a greedy result "optimal", "minimal", "the fewest possible", or equivalent.
- Do not weaken or delete an optimality test to make a build pass. If an optimality test fails, the solver is wrong.
- Do not add a hard cap on group or non-zero-balance count that changes which algorithm answers the query. Large inputs may simply take longer — that is honest; a silently-downgraded answer is not.

## 5. Run relevant tests after changes

- After changing domain code, run the domain test suite and report the actual result, including failures.
- After changing UI code, run the affected component tests.
- Never claim a test passed without running it. Never report "should pass". Paste or summarise real output.
- If you cannot run tests, say so explicitly instead of implying they were run.
- Do not mark a task complete while a test you touched is failing or skipped.

## 6. Avoid unrelated changes

- Change only what the current task requires.
- No opportunistic refactors, dependency bumps, formatting sweeps, renames, or file moves outside the task's scope.
- Do not reformat files you did not otherwise need to edit.
- Do not add dependencies without being asked. If a dependency seems necessary, propose it and wait.
- If you notice an unrelated defect, report it in your response; do not fix it in the same change.

## 7. Never commit or push

- Do not run `git commit`, `git push`, `git merge`, `git rebase`, `git reset --hard`, `git checkout --`, or `git stash`.
- Do not create branches, tags, or pull requests.
- Do not modify `.git/` or `.gitignore` unless explicitly asked.
- Leave all work in the working tree. The repository owner decides what is committed and when.
- `reference/` is git-ignored on purpose: the assignment PDF must never become a tracked file. Do not add it, un-ignore it, copy it into a tracked path, or paste its full text into a tracked document.

## 8. Never edit or fabricate entries in `docs/PROMPTS.md`

- `docs/PROMPTS.md` is a human-authored record of the prompts actually used. It is owned by the repository owner alone.
- Do not create, edit, append to, reformat, reorder, summarise, "clean up", or delete entries in it — not even to fix a typo.
- Do not invent, reconstruct, or backfill prompts that were not actually issued.
- If asked to update it, decline and explain that the record must be written by the human whose prompts it documents.

---

## Quick checklist before you report done

- [ ] Read the three project documents this session.
- [ ] No React/DOM/storage import inside the domain layer.
- [ ] No float holds or moves money; all stored amounts are integer cents.
- [ ] No text anywhere calls a heuristic result minimal or optimal.
- [ ] Relevant tests actually run; real results reported, failures included.
- [ ] Diff contains nothing outside the task's scope.
- [ ] Nothing committed, pushed, or staged.
- [ ] `docs/PROMPTS.md` untouched.

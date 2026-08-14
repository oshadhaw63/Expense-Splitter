import { type Cents, type PersonId, type Result, type SettleError, type Transfer, err, ok, unsafeCents } from './types'

interface Entry {
  readonly personId: PersonId
  readonly amount: number
}

/** Greedy largest-creditor/largest-debtor pass — used only to seed the exact
 * search's initial upper bound (DECISIONS.md §10 step 1, §11). Never
 * returned as an answer. */
function greedyCount(amounts: readonly number[]): number {
  const remaining = amounts.slice()
  let count = 0
  for (;;) {
    let maxIndex = -1
    let minIndex = -1
    for (let i = 0; i < remaining.length; i++) {
      const value = remaining[i] ?? 0
      if (maxIndex === -1 || value > (remaining[maxIndex] ?? 0)) maxIndex = i
      if (minIndex === -1 || value < (remaining[minIndex] ?? 0)) minIndex = i
    }
    const maxValue = maxIndex === -1 ? 0 : (remaining[maxIndex] ?? 0)
    const minValue = minIndex === -1 ? 0 : (remaining[minIndex] ?? 0)
    if (maxValue <= 0 || minValue >= 0) break
    const amount = Math.min(maxValue, -minValue)
    remaining[maxIndex] = maxValue - amount
    remaining[minIndex] = minValue + amount
    count++
  }
  return count
}

interface SearchState {
  bestCount: number
  bestPlan: Transfer[] | null
}

function dfs(remaining: readonly Entry[], transfers: Transfer[], state: SearchState, canonicalIndex: ReadonlyMap<PersonId, number>): void {
  if (remaining.length === 0) {
    if (transfers.length < state.bestCount) {
      state.bestCount = transfers.length
      state.bestPlan = transfers.slice()
    }
    return
  }
  if (transfers.length >= state.bestCount) {
    return
  }

  const [pivot, ...rest] = remaining
  if (!pivot) return

  for (let i = 0; i < rest.length; i++) {
    const other = rest[i]
    if (!other) continue
    if (pivot.amount > 0 === other.amount > 0) continue // same sign (or one is impossibly zero); not a valid pairing

    const amount = Math.min(Math.abs(pivot.amount), Math.abs(other.amount))
    const transfer: Transfer =
      pivot.amount < 0
        ? { fromPersonId: pivot.personId, toPersonId: other.personId, amountCents: unsafeCents(amount) }
        : { fromPersonId: other.personId, toPersonId: pivot.personId, amountCents: unsafeCents(amount) }

    const newPivotAmount = pivot.amount < 0 ? pivot.amount + amount : pivot.amount - amount
    const newOtherAmount = other.amount < 0 ? other.amount + amount : other.amount - amount

    const next = rest.filter((_, index) => index !== i)
    if (newPivotAmount !== 0) next.push({ personId: pivot.personId, amount: newPivotAmount })
    if (newOtherAmount !== 0) next.push({ personId: other.personId, amount: newOtherAmount })
    // Preserve canonical (stable group creation) order at every choice
    // point, so the first complete plan DFS finds is the deterministic,
    // tie-broken one (DECISIONS.md §10).
    next.sort((a, b) => (canonicalIndex.get(a.personId) ?? 0) - (canonicalIndex.get(b.personId) ?? 0))

    transfers.push(transfer)
    dfs(next, transfers, state, canonicalIndex)
    transfers.pop()
  }
}

/**
 * Computes a proven-minimum settlement plan by exact recursive backtracking
 * with branch-and-bound pruning (DECISIONS.md §10). Greedy seeds only the
 * initial upper bound; the returned plan is always DFS-derived and always
 * proven minimal — there is no participant-count threshold or fallback.
 */
export function settleExact(
  balances: ReadonlyMap<PersonId, Cents>,
  groupOrder: readonly PersonId[],
): Result<readonly Transfer[], SettleError> {
  let sum = 0
  for (const [personId, amount] of balances) {
    if (!Number.isSafeInteger(amount)) {
      return err({ code: 'unsafe-balance', message: 'A balance is not a safe integer.', personId })
    }
    const next = sum + amount
    if (!Number.isSafeInteger(next)) {
      return err({ code: 'unsafe-balance', message: 'Balances are too large to sum safely.', personId })
    }
    sum = next
  }
  if (sum !== 0) {
    return err({ code: 'non-zero-sum', message: 'Balances do not sum to zero; cannot settle.' })
  }

  const canonicalIndex = new Map<PersonId, number>()
  groupOrder.forEach((id, index) => canonicalIndex.set(id, index))

  const nonZero: Entry[] = groupOrder
    .filter((id) => (balances.get(id) ?? unsafeCents(0)) !== 0)
    .map((id) => ({ personId: id, amount: balances.get(id) as number }))

  if (nonZero.length === 0) {
    return ok([])
  }

  const seed = greedyCount(nonZero.map((e) => e.amount))
  // Initialized one above the greedy seed so a DFS-found plan that merely
  // ties greedy's count still counts as a strict improvement and gets
  // recorded — otherwise a tie would never update bestPlan and it could
  // stay null even though an optimal plan exists (ties with greedy are the
  // common case; DECISIONS.md §11 notes greedy is already optimal on every
  // 4-person case).
  const state: SearchState = { bestCount: seed + 1, bestPlan: null }
  dfs(nonZero, [], state, canonicalIndex)

  return ok(state.bestPlan ?? [])
}

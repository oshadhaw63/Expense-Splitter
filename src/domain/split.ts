import {
  type EqualSplitError,
  type EqualSplitInput,
  type EqualSplitOutput,
  type EqualSplitShare,
  type ExactSplitError,
  type ExactSplitInput,
  type ExactSplitOutput,
  type ExactSplitShare,
  type PersonId,
  type Result,
  err,
  ok,
  unsafeCents,
} from './types'

/**
 * Divides totalCents evenly among participantIds (DECISIONS.md §9). Which
 * participants receive the remainder cent(s) is decided by groupOrder — the
 * caller's stable group creation order — not by participantIds' own order,
 * so shuffling the selection can never change the allocation.
 *
 * Validation order: empty participants → duplicate participants →
 * duplicate group-order entries → participants unknown to the group →
 * non-positive total. The two group-order checks are new (Codex review
 * finding 2) and sit right after the participant-shape checks they protect,
 * since canonicalisation below assumes both lists are duplicate-free and
 * that every participant is present in groupOrder.
 */
export function splitEqually(input: EqualSplitInput): Result<EqualSplitOutput, EqualSplitError> {
  const { totalCents, groupOrder, participantIds } = input

  if (participantIds.length === 0) {
    return err({ code: 'empty-participants', message: 'Select at least one participant.' })
  }

  const participantSet = new Set<PersonId>()
  for (const personId of participantIds) {
    if (participantSet.has(personId)) {
      return err({ code: 'duplicate-participants', message: 'Participant is listed more than once.', personId })
    }
    participantSet.add(personId)
  }

  const groupSet = new Set<PersonId>()
  for (const personId of groupOrder) {
    if (groupSet.has(personId)) {
      return err({
        code: 'duplicate-group-order',
        message: 'The group order lists the same person more than once.',
        personId,
      })
    }
    groupSet.add(personId)
  }

  for (const personId of participantIds) {
    if (!groupSet.has(personId)) {
      return err({ code: 'unknown-participant', message: 'Participant is not part of the group.', personId })
    }
  }

  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return err({ code: 'non-positive-total', message: 'The expense total must be a positive amount.' })
  }

  // Canonicalize: derive the participating subset's order from groupOrder
  // rather than from participantIds, so selection order never affects who
  // receives the remainder cent(s).
  const canonicalParticipants = groupOrder.filter((personId) => participantSet.has(personId))

  const count = canonicalParticipants.length
  const base = Math.floor(totalCents / count)
  const remainder = totalCents - base * count

  const shares: EqualSplitShare[] = canonicalParticipants.map((personId, index) => ({
    personId,
    amountCents: unsafeCents(index < remainder ? base + 1 : base),
  }))

  return ok({ totalCents, shares })
}

/**
 * Validates an exact-amount split: every participant must have exactly one
 * non-negative share, no one outside the split may have a share, and the
 * shares must sum exactly to totalCents. Never rounds, redistributes, or
 * otherwise repairs a mismatched split (DECISIONS.md §8).
 */
export function splitExactly(input: ExactSplitInput): Result<ExactSplitOutput, ExactSplitError> {
  const { totalCents, participantIds, amountsCents } = input

  if (participantIds.length === 0) {
    return err({ code: 'empty-participants', message: 'Select at least one participant.' })
  }

  const participantSet = new Set<PersonId>()
  for (const personId of participantIds) {
    if (participantSet.has(personId)) {
      return err({ code: 'duplicate-participants', message: 'Participant is listed more than once.', personId })
    }
    participantSet.add(personId)
  }

  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return err({ code: 'non-positive-total', message: 'The expense total must be a positive amount.' })
  }

  for (const personId of amountsCents.keys()) {
    if (!participantSet.has(personId)) {
      return err({
        code: 'unexpected-share',
        message: 'An amount was given for someone not in the split.',
        personId,
      })
    }
  }

  const shares: ExactSplitShare[] = []
  let sum = 0
  for (const personId of participantIds) {
    const amount = amountsCents.get(personId)
    if (amount === undefined) {
      return err({ code: 'missing-share', message: 'Every participant needs an amount.', personId })
    }
    if (!Number.isSafeInteger(amount) || amount < 0) {
      return err({
        code: 'invalid-share-amount',
        message: 'Each amount must be zero or a positive whole number of cents.',
        personId,
      })
    }

    // Prove the running total stays a safe integer before committing this
    // addition. candidateSum is a plain, unbranded number checked here and
    // never stored as Cents or returned if it turns out to be unsafe — only
    // a verified-safe value is ever assigned back to `sum`.
    const candidateSum = sum + amount
    if (!Number.isSafeInteger(candidateSum)) {
      return err({
        code: 'share-sum-overflow',
        message: 'Adding this amount would exceed the safe integer range for the running total.',
        personId,
      })
    }
    sum = candidateSum

    shares.push({ personId, amountCents: amount })
  }

  if (sum === 0) {
    return err({ code: 'no-positive-share', message: 'At least one participant must have a positive amount.' })
  }

  if (sum !== totalCents) {
    // Both operands are proven safe integers at this point (totalCents by
    // the non-positive-total check above, sum by the incremental check
    // above), and the difference of two non-negative safe integers can
    // never itself be unsafe, so no further proof is needed before this
    // subtraction.
    const diffCents = unsafeCents(Math.abs(totalCents - sum))
    const direction = sum < totalCents ? 'short' : 'over'
    return err({
      code: 'sum-mismatch',
      message: `Amounts are ${direction} by ${diffCents} cent(s).`,
      direction,
      diffCents,
    })
  }

  return ok({ totalCents, shares })
}

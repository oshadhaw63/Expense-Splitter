import { describe, expect, it } from 'vitest'
import { splitEqually, splitExactly } from './split'
import { asPersonId, unsafeCents } from './types'
import type { Cents, PersonId } from './types'

const alice = asPersonId('alice')
const bob = asPersonId('bob')
const carol = asPersonId('carol')
const dave = asPersonId('dave')

function cents(n: number): Cents {
  return unsafeCents(n)
}

describe('splitEqually', () => {
  it("splits Rs. 100.00 three ways per the brief's own example", () => {
    const result = splitEqually({
      totalCents: cents(10_000),
      groupOrder: [alice, bob, carol],
      participantIds: [alice, bob, carol],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.shares).toEqual([
      { personId: alice, amountCents: 3_334 },
      { personId: bob, amountCents: 3_333 },
      { personId: carol, amountCents: 3_333 },
    ])
    const sum = result.value.shares.reduce((total, s) => total + s.amountCents, 0)
    expect(sum).toBe(10_000)
  })

  it('splits evenly with no remainder', () => {
    const result = splitEqually({
      totalCents: cents(1_200_000),
      groupOrder: [alice, bob, carol, dave],
      participantIds: [alice, bob, carol, dave],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.shares.map((s) => s.amountCents)).toEqual([300_000, 300_000, 300_000, 300_000])
  })

  it('gives the remainder to the first participants in group creation order, regardless of selection order', () => {
    const groupOrder = [alice, bob, carol]
    const forward = splitEqually({ totalCents: cents(10_000), groupOrder, participantIds: [alice, bob, carol] })
    const reversed = splitEqually({ totalCents: cents(10_000), groupOrder, participantIds: [carol, bob, alice] })
    const shuffled = splitEqually({ totalCents: cents(10_000), groupOrder, participantIds: [bob, alice, carol] })

    expect(forward.ok && forward.value.shares).toEqual(reversed.ok && reversed.value.shares)
    expect(forward.ok && forward.value.shares).toEqual(shuffled.ok && shuffled.value.shares)
    // The extra cent always lands on alice, because alice is first in
    // groupOrder — never on whichever participant happened to be listed
    // first in the caller's selection.
    expect(forward.ok && forward.value.shares[0]?.personId).toBe(alice)
    expect(reversed.ok && reversed.value.shares[0]?.personId).toBe(alice)
    expect(shuffled.ok && shuffled.value.shares[0]?.personId).toBe(alice)
  })

  it('canonicalizes a partial selection by group order, not by the order the subset was passed in', () => {
    const groupOrder = [alice, bob, carol, dave]
    // Dave and Bob only (brief's E3 shape), selection order reversed
    // relative to groupOrder, and a total with a remainder so the
    // recipient of the extra cent is observable.
    const result = splitEqually({ totalCents: cents(601), groupOrder, participantIds: [dave, bob] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Bob precedes Dave in groupOrder, so Bob (not Dave) is listed first
    // and receives the extra cent, regardless of selection order.
    expect(result.value.shares).toEqual([
      { personId: bob, amountCents: 301 },
      { personId: dave, amountCents: 300 },
    ])
  })

  it('conserves the total across a range of participant counts', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 10, 13]) {
      const ids = Array.from({ length: n }, (_, i) => asPersonId(`p${i}`))
      const result = splitEqually({ totalCents: cents(10_007), groupOrder: ids, participantIds: ids })
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      const sum = result.value.shares.reduce((total, s) => total + s.amountCents, 0)
      expect(sum).toBe(10_007)
    }
  })

  it('rejects an empty participant list', () => {
    const result = splitEqually({ totalCents: cents(1_000), groupOrder: [alice], participantIds: [] })
    expect(!result.ok && result.error.code).toBe('empty-participants')
  })

  it('rejects duplicate participants', () => {
    const result = splitEqually({
      totalCents: cents(1_000),
      groupOrder: [alice, bob],
      participantIds: [alice, bob, alice],
    })
    expect(!result.ok && result.error.code).toBe('duplicate-participants')
  })

  it('rejects a duplicate entry in groupOrder itself', () => {
    const result = splitEqually({
      totalCents: cents(1_000),
      groupOrder: [alice, bob, alice],
      participantIds: [alice, bob],
    })
    expect(!result.ok && result.error.code).toBe('duplicate-group-order')
  })

  it('rejects a participant who is not part of the group', () => {
    const result = splitEqually({
      totalCents: cents(1_000),
      groupOrder: [alice, bob],
      participantIds: [alice, carol],
    })
    expect(!result.ok && result.error.code).toBe('unknown-participant')
  })

  it('rejects a zero total', () => {
    const result = splitEqually({ totalCents: cents(0), groupOrder: [alice], participantIds: [alice] })
    expect(!result.ok && result.error.code).toBe('non-positive-total')
  })

  it('rejects a negative total', () => {
    const result = splitEqually({ totalCents: cents(-100), groupOrder: [alice], participantIds: [alice] })
    expect(!result.ok && result.error.code).toBe('non-positive-total')
  })

  it('does not mutate the groupOrder or participantIds input', () => {
    const groupOrder: readonly PersonId[] = [alice, bob, carol]
    const groupCopy = [...groupOrder]
    const participantIds: readonly PersonId[] = [carol, alice]
    const participantsCopy = [...participantIds]
    splitEqually({ totalCents: cents(10_000), groupOrder, participantIds })
    expect(groupOrder).toEqual(groupCopy)
    expect(participantIds).toEqual(participantsCopy)
  })
})

describe('splitExactly', () => {
  it("accepts the brief's own scenario (Carol pays 1,000,000, split among Alice/Bob/Dave)", () => {
    const result = splitExactly({
      totalCents: cents(1_000_000),
      participantIds: [alice, bob, dave],
      amountsCents: new Map([
        [alice, cents(333_333)],
        [bob, cents(333_333)],
        [dave, cents(333_334)],
      ]),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.shares).toEqual([
      { personId: alice, amountCents: 333_333 },
      { personId: bob, amountCents: 333_333 },
      { personId: dave, amountCents: 333_334 },
    ])
  })

  it('rejects shares that are short of the total, reporting the direction and the difference', () => {
    const result = splitExactly({
      totalCents: cents(1_000_000),
      participantIds: [alice, bob, dave],
      amountsCents: new Map([
        [alice, cents(333_333)],
        [bob, cents(333_333)],
        [dave, cents(333_333)],
      ]),
    })
    expect(!result.ok && result.error.code).toBe('sum-mismatch')
    if (!result.ok && result.error.code === 'sum-mismatch') {
      expect(result.error.direction).toBe('short')
      expect(result.error.diffCents).toBe(1)
    }
  })

  it('rejects shares that are over the total, reporting the direction and the difference', () => {
    const result = splitExactly({
      totalCents: cents(1_000_000),
      participantIds: [alice, bob, dave],
      amountsCents: new Map([
        [alice, cents(333_334)],
        [bob, cents(333_334)],
        [dave, cents(333_334)],
      ]),
    })
    expect(!result.ok && result.error.code).toBe('sum-mismatch')
    if (!result.ok && result.error.code === 'sum-mismatch') {
      expect(result.error.direction).toBe('over')
      expect(result.error.diffCents).toBe(2)
    }
  })

  it('rejects a negative share', () => {
    const result = splitExactly({
      totalCents: cents(1_000),
      participantIds: [alice, bob],
      amountsCents: new Map([
        [alice, cents(-500)],
        [bob, cents(1_500)],
      ]),
    })
    expect(!result.ok && result.error.code).toBe('invalid-share-amount')
  })

  it('rejects a non-integer (unsafe) share', () => {
    const result = splitExactly({
      totalCents: cents(1_000),
      participantIds: [alice, bob],
      amountsCents: new Map([
        [alice, cents(500.5)],
        [bob, cents(499.5)],
      ]),
    })
    expect(!result.ok && result.error.code).toBe('invalid-share-amount')
  })

  it('rejects a missing share for a selected participant', () => {
    const result = splitExactly({
      totalCents: cents(1_000),
      participantIds: [alice, bob],
      amountsCents: new Map([[alice, cents(1_000)]]),
    })
    expect(!result.ok && result.error.code).toBe('missing-share')
  })

  it('rejects a share supplied for someone outside the split', () => {
    const result = splitExactly({
      totalCents: cents(1_000),
      participantIds: [alice],
      amountsCents: new Map([
        [alice, cents(1_000)],
        [bob, cents(0)],
      ]),
    })
    expect(!result.ok && result.error.code).toBe('unexpected-share')
  })

  it('rejects all-zero shares as having no positive amount', () => {
    const result = splitExactly({
      totalCents: cents(1_000),
      participantIds: [alice, bob],
      amountsCents: new Map([
        [alice, cents(0)],
        [bob, cents(0)],
      ]),
    })
    expect(!result.ok && result.error.code).toBe('no-positive-share')
  })

  it('accepts a zero share alongside a positive one', () => {
    const result = splitExactly({
      totalCents: cents(1_000),
      participantIds: [alice, bob],
      amountsCents: new Map([
        [alice, cents(1_000)],
        [bob, cents(0)],
      ]),
    })
    expect(result.ok).toBe(true)
  })

  it('rejects an empty participant list', () => {
    const result = splitExactly({ totalCents: cents(1_000), participantIds: [], amountsCents: new Map() })
    expect(!result.ok && result.error.code).toBe('empty-participants')
  })

  it('rejects duplicate participants', () => {
    const result = splitExactly({
      totalCents: cents(1_000),
      participantIds: [alice, alice],
      amountsCents: new Map([[alice, cents(1_000)]]),
    })
    expect(!result.ok && result.error.code).toBe('duplicate-participants')
  })

  it('rejects a zero total', () => {
    const result = splitExactly({
      totalCents: cents(0),
      participantIds: [alice],
      amountsCents: new Map([[alice, cents(0)]]),
    })
    expect(!result.ok && result.error.code).toBe('non-positive-total')
  })

  it('does not mutate the participantIds or amountsCents input', () => {
    const ids: readonly PersonId[] = [alice, bob]
    const idsCopy = [...ids]
    const amounts = new Map([
      [alice, cents(500)],
      [bob, cents(500)],
    ])
    const amountsCopy = new Map(amounts)
    splitExactly({ totalCents: cents(1_000), participantIds: ids, amountsCents: amounts })
    expect(ids).toEqual(idsCopy)
    expect(amounts).toEqual(amountsCopy)
  })

  describe('safe-integer accumulation (Codex review finding 1)', () => {
    it('rejects individually-safe shares whose combined sum would be unsafe (the reported example)', () => {
      const result = splitExactly({
        totalCents: cents(1),
        participantIds: [alice, bob],
        amountsCents: new Map([
          [alice, cents(9_000_000_000_000_000)],
          [bob, cents(9_000_000_000_000_000)],
        ]),
      })
      expect(Number.isSafeInteger(9_000_000_000_000_000)).toBe(true)
      expect(!result.ok && result.error.code).toBe('share-sum-overflow')
      if (!result.ok && result.error.code === 'share-sum-overflow') {
        expect(result.error.personId).toBe(bob)
      }
    })

    it('never brands an unsafe running total as Cents (no NaN/Infinity/unsafe value leaks into the error)', () => {
      const result = splitExactly({
        totalCents: cents(1),
        participantIds: [alice, bob],
        amountsCents: new Map([
          [alice, cents(9_000_000_000_000_000)],
          [bob, cents(9_000_000_000_000_000)],
        ]),
      })
      expect(result.ok).toBe(false)
      // The error carries no diffCents/amount field at all for this code —
      // asserting the discriminant is enough to prove no unsafe number was
      // smuggled through in an unexpected field.
      if (!result.ok) {
        expect(Object.keys(result.error)).toEqual(['code', 'message', 'personId'])
      }
    })

    it('rejects an overflow that only appears on the third of three otherwise-safe shares', () => {
      const result = splitExactly({
        totalCents: cents(1),
        participantIds: [alice, bob, carol],
        amountsCents: new Map([
          [alice, cents(1)],
          [bob, cents(1)],
          [carol, cents(9_007_199_254_740_991)],
        ]),
      })
      expect(!result.ok && result.error.code).toBe('share-sum-overflow')
      if (!result.ok && result.error.code === 'share-sum-overflow') {
        expect(result.error.personId).toBe(carol)
      }
    })

    it('accepts the largest permitted safe accumulation when the split is otherwise valid', () => {
      // Two shares that sum to exactly Number.MAX_SAFE_INTEGER — the
      // largest accumulation the safe-integer range permits.
      const half = 4_503_599_627_370_495
      const otherHalf = 4_503_599_627_370_496
      expect(half + otherHalf).toBe(Number.MAX_SAFE_INTEGER)

      const result = splitExactly({
        totalCents: cents(Number.MAX_SAFE_INTEGER),
        participantIds: [alice, bob],
        amountsCents: new Map([
          [alice, cents(half)],
          [bob, cents(otherHalf)],
        ]),
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        const sum = result.value.shares.reduce((total, s) => total + s.amountCents, 0)
        expect(sum).toBe(Number.MAX_SAFE_INTEGER)
      }
    })
  })
})

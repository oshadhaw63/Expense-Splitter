import { useEffect, useMemo, useState } from 'react'
import { addPerson } from './domain/person'
import { addExpense, deleteExpense, editExpense } from './domain/expense'
import { calculateBalances } from './domain/balances'
import { settleExact } from './domain/settle'
import { formatMoney, parseMoney } from './domain/money'
import { asExpenseId, asPersonId, unsafeCents } from './domain/types'
import type { Cents, Expense, ExpenseSplitInput, Person, PersonId } from './domain/types'
import { clearState, loadState, saveState } from './storage'

let nextId = 1
function freshId(prefix: string): string {
  nextId += 1
  return `${prefix}_${Date.now()}_${nextId}`
}

export default function App() {
  const [people, setPeople] = useState<readonly Person[]>([])
  const [expenses, setExpenses] = useState<readonly Expense[]>([])
  const [loadWarning, setLoadWarning] = useState<string | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)

  const [personName, setPersonName] = useState('')
  const [personError, setPersonError] = useState<string | undefined>(undefined)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [payerId, setPayerId] = useState('')
  const [amountText, setAmountText] = useState('')
  const [participantIds, setParticipantIds] = useState<readonly string[]>([])
  const [splitKind, setSplitKind] = useState<'equal' | 'exact'>('equal')
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({})
  const [expenseError, setExpenseError] = useState<string | undefined>(undefined)

  useEffect(() => {
    const state = loadState()
    setPeople(state.people)
    setExpenses(state.expenses)
    setLoadWarning(state.warning)
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    saveState(people, expenses)
  }, [people, expenses, loaded])

  const balancesResult = useMemo(() => calculateBalances(people, expenses), [people, expenses])
  const balances = balancesResult.ok ? balancesResult.value : new Map<PersonId, Cents>()

  const groupOrder = useMemo(() => people.map((p) => p.id), [people])
  const settleResult = balancesResult.ok ? settleExact(balancesResult.value, groupOrder) : undefined
  const transfers = settleResult && settleResult.ok ? settleResult.value : []

  function handleAddPerson(e: React.FormEvent) {
    e.preventDefault()
    const result = addPerson(people, asPersonId(freshId('p')), personName)
    if (!result.ok) {
      setPersonError(result.error.message)
      return
    }
    setPeople(result.value)
    setPersonName('')
    setPersonError(undefined)
  }

  function resetExpenseForm() {
    setEditingId(null)
    setDescription('')
    setPayerId('')
    setAmountText('')
    setParticipantIds([])
    setSplitKind('equal')
    setExactAmounts({})
    setExpenseError(undefined)
  }

  function startEdit(expense: Expense) {
    setEditingId(expense.id)
    setDescription(expense.description)
    setPayerId(expense.payerId)
    setAmountText((expense.totalCents / 100).toFixed(2))
    setExpenseError(undefined)
    if (expense.split.kind === 'equal') {
      setSplitKind('equal')
      setParticipantIds(expense.split.participantIds)
      setExactAmounts({})
    } else {
      setSplitKind('exact')
      setParticipantIds(expense.split.shares.map((s) => s.personId))
      const amounts: Record<string, string> = {}
      for (const share of expense.split.shares) {
        amounts[share.personId] = (share.amountCents / 100).toFixed(2)
      }
      setExactAmounts(amounts)
    }
  }

  function toggleParticipant(id: string) {
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  function handleSubmitExpense(e: React.FormEvent) {
    e.preventDefault()
    setExpenseError(undefined)

    const amountResult = parseMoney(amountText)
    if (!amountResult.ok) {
      setExpenseError(`Amount: ${amountResult.error.message}`)
      return
    }
    if (amountResult.value <= 0) {
      setExpenseError('Amount: the expense total must be greater than zero.')
      return
    }
    if (!payerId) {
      setExpenseError('Choose who paid.')
      return
    }
    if (participantIds.length === 0) {
      setExpenseError('Select at least one participant.')
      return
    }

    let split: ExpenseSplitInput
    if (splitKind === 'equal') {
      split = { kind: 'equal', participantIds: participantIds.map(asPersonId) }
    } else {
      const shares = []
      for (const id of participantIds) {
        const raw = exactAmounts[id] ?? ''
        const parsed = parseMoney(raw === '' ? '0' : raw)
        if (!parsed.ok) {
          setExpenseError(`Amount for a participant: ${parsed.error.message}`)
          return
        }
        shares.push({ personId: asPersonId(id), amountCents: parsed.value })
      }
      split = { kind: 'exact', shares }
    }

    const input = {
      description: description.trim() || '(no description)',
      payerId: asPersonId(payerId),
      totalCents: amountResult.value,
      split,
    }

    if (editingId) {
      const result = editExpense(people, expenses, asExpenseId(editingId), input)
      if (!result.ok) {
        setExpenseError(result.error.message)
        return
      }
      setExpenses(result.value)
    } else {
      const result = addExpense(people, expenses, asExpenseId(freshId('e')), input)
      if (!result.ok) {
        setExpenseError(result.error.message)
        return
      }
      setExpenses(result.value)
    }
    resetExpenseForm()
  }

  function handleDelete(id: string) {
    const result = deleteExpense(expenses, asExpenseId(id))
    if (result.ok) {
      setExpenses(result.value)
      if (editingId === id) resetExpenseForm()
    }
  }

  function personName_(id: string): string {
    return people.find((p) => p.id === id)?.name ?? id
  }

  function handleReset() {
    const confirmed = window.confirm('Reset all data? This removes every person and expense and cannot be undone.')
    if (!confirmed) return
    clearState()
    setPeople([])
    setExpenses([])
    resetExpenseForm()
    setPersonName('')
    setPersonError(undefined)
    setLoadWarning(undefined)
  }

  const allSettled = transfers.length === 0 && balancesResult.ok

  return (
    <main className="app">
      <div className="row header-row">
        <h1>Expense Splitter</h1>
        <button type="button" className="btn btn-danger" onClick={handleReset}>
          Reset all data
        </button>
      </div>
      {loadWarning && <p className="warning">{loadWarning}</p>}

      <section className="card">
        <h2>
          <span className="step">1</span> People
        </h2>
        <form onSubmit={handleAddPerson} className="row">
          <input
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            placeholder="Name"
            aria-label="Person name"
          />
          <button type="submit" className="btn btn-primary">
            Add person
          </button>
        </form>
        {personError && <p className="error">{personError}</p>}
        <ul className="chip-list">
          {people.map((p) => (
            <li key={p.id} className="chip">
              {p.name}
            </li>
          ))}
          {people.length === 0 && <li className="muted">No people yet.</li>}
        </ul>
      </section>

      <section className="card">
        <h2>
          <span className="step">2</span> {editingId ? 'Edit expense' : 'Add an expense'}
        </h2>
        <form onSubmit={handleSubmitExpense} className="expense-form">
          <label>
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dinner" />
          </label>

          <label>
            Amount (LKR)
            <input value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="1234.56" />
          </label>

          <label>
            Paid by
            <select value={payerId} onChange={(e) => setPayerId(e.target.value)} disabled={people.length === 0}>
              <option value="">Choose payer…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend>Split between</legend>
            {people.length === 0 && <p className="muted">Add people first.</p>}
            {people.map((p) => (
              <label key={p.id} className="checkbox">
                <input
                  type="checkbox"
                  checked={participantIds.includes(p.id)}
                  onChange={() => toggleParticipant(p.id)}
                />
                {p.name}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Split method</legend>
            <label className="checkbox">
              <input
                type="radio"
                name="splitKind"
                checked={splitKind === 'equal'}
                onChange={() => setSplitKind('equal')}
              />
              Equal
            </label>
            <label className="checkbox">
              <input
                type="radio"
                name="splitKind"
                checked={splitKind === 'exact'}
                onChange={() => setSplitKind('exact')}
              />
              Exact amount
            </label>
          </fieldset>

          {splitKind === 'equal' && (
            <p className="hint">
              If the total doesn't divide evenly, the extra cent(s) go to the first participant(s) in the order
              people were added, so every rupee is always accounted for.
            </p>
          )}

          {splitKind === 'exact' && participantIds.length > 0 && (
            <fieldset>
              <legend>Exact amounts</legend>
              {participantIds.map((id) => (
                <label key={id} className="row">
                  {personName_(id)}
                  <input
                    value={exactAmounts[id] ?? ''}
                    onChange={(e) => setExactAmounts((prev) => ({ ...prev, [id]: e.target.value }))}
                    placeholder="0.00"
                  />
                </label>
              ))}
            </fieldset>
          )}

          {expenseError && <p className="error">{expenseError}</p>}

          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={people.length === 0}>
              {editingId ? 'Save changes' : 'Add expense'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={resetExpenseForm}>
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>
          <span className="step">3</span> Expenses
        </h2>
        {expenses.length === 0 && <p className="muted">No expenses logged yet.</p>}
        <ul className="expense-list">
          {expenses.map((exp) => (
            <li key={exp.id} className="expense-item">
              <div>
                <div className="expense-title">
                  <span>{exp.description}</span>
                  <span className="split-badge">{exp.split.kind}</span>
                </div>
                <div className="muted">
                  {formatMoney(exp.totalCents)} paid by {personName_(exp.payerId)}
                </div>
                <div className="muted">
                  {exp.split.kind === 'equal'
                    ? exp.split.participantIds.map(personName_).join(', ')
                    : exp.split.shares.map((s) => `${personName_(s.personId)} ${formatMoney(s.amountCents)}`).join(', ')}
                </div>
              </div>
              <div className="row">
                <button type="button" className="btn btn-secondary" onClick={() => startEdit(exp)}>
                  Edit
                </button>
                <button type="button" className="btn btn-danger" onClick={() => handleDelete(exp.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>
          <span className="step">4</span> Balances
        </h2>
        {!balancesResult.ok && <p className="error">{balancesResult.error.message}</p>}
        {people.length === 0 && <p className="muted">Add people to see balances.</p>}
        <ul className="balance-list">
          {people.map((p) => {
            const value = balances.get(p.id) ?? unsafeCents(0)
            return (
              <li key={p.id}>
                <span>{p.name}</span>
                {value === 0 ? (
                  <span className="pill pill-muted">settled up</span>
                ) : value > 0 ? (
                  <span className="pill pill-positive">is owed {formatMoney(value)}</span>
                ) : (
                  <span className="pill pill-negative">owes {formatMoney(unsafeCents(-value))}</span>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <h2>
          <span className="step">5</span> Settle Up
        </h2>
        {settleResult && !settleResult.ok && <p className="error">{settleResult.error.message}</p>}
        {allSettled && <p className="positive">Everyone is settled up — no payments needed.</p>}
        {transfers.length > 0 && (
          <ul className="transfer-list">
            {transfers.map((t, i) => (
              <li key={i}>
                <span>
                  {personName_(t.fromPersonId)} <span className="transfer-arrow">→</span> {personName_(t.toPersonId)}
                </span>
                <span className="pill pill-muted">{formatMoney(t.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

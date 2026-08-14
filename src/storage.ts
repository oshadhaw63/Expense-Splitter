import type { Expense, Person } from './domain/types'

const KEY = 'expense-splitter/v1'

interface StoredState {
  readonly version: 1
  readonly people: readonly Person[]
  readonly expenses: readonly Expense[]
}

export function saveState(people: readonly Person[], expenses: readonly Expense[]): void {
  const payload: StoredState = { version: 1, people, expenses }
  localStorage.setItem(KEY, JSON.stringify(payload))
}

export function loadState(): { people: readonly Person[]; expenses: readonly Expense[]; warning?: string } {
  const raw = localStorage.getItem(KEY)
  if (!raw) return { people: [], expenses: [] }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.people) || !Array.isArray(parsed.expenses)) {
      return { people: [], expenses: [], warning: 'Saved data was invalid and has been reset.' }
    }
    return { people: parsed.people, expenses: parsed.expenses }
  } catch {
    return { people: [], expenses: [], warning: 'Saved data was corrupt and has been reset.' }
  }
}

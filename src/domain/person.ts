import { type AddPersonError, type Person, type PersonId, type Result, err, ok } from './types'

/**
 * Adds a person to the group. Names are trimmed before storage and compared
 * case-insensitively for duplicates (PROJECT_SPEC.md A10). Returns a new
 * array in creation order; never mutates `people`.
 */
export function addPerson(people: readonly Person[], id: PersonId, rawName: string): Result<readonly Person[], AddPersonError> {
  const name = rawName.trim()

  if (name.length === 0) {
    return err({ code: 'empty-name', message: 'Enter a name.' })
  }

  for (const person of people) {
    if (person.id === id) {
      return err({ code: 'duplicate-id', message: 'That person id is already in use.' })
    }
    if (person.name.trim().toLowerCase() === name.toLowerCase()) {
      return err({ code: 'duplicate-name', message: `${name} is already in the group.` })
    }
  }

  return ok([...people, { id, name }])
}

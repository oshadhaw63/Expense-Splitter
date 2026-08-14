import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

const domainDir = fileURLToPath(new URL('.', import.meta.url))

// Bare identifiers that are forbidden wherever they appear — including as
// the `.name` of a PropertyAccessExpression, since the TS AST types that
// member name as an Identifier too, so `globalThis.localStorage` is caught
// by this same rule without a separate "qualified access" check.
const FORBIDDEN_IDENTIFIERS = new Set(['window', 'document', 'localStorage', 'sessionStorage'])

// Anything importing (or re-exporting from) React or a React-based UI
// library. AGENTS.md §2 names React specifically; this also catches
// react-dom and any package whose name contains "react".
const FORBIDDEN_MODULE_PATTERN = /react/i

interface Violation {
  readonly rule: string
}

/** Walks a TS/TSX source's AST looking for the forms AGENTS.md §2 forbids in the domain layer. */
function checkPurity(sourceText: string, fileName: string): Violation[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const violations: Violation[] = []

  function flagModuleSpecifier(specifier: ts.Expression | undefined, rule: string) {
    if (specifier && ts.isStringLiteral(specifier) && FORBIDDEN_MODULE_PATTERN.test(specifier.text)) {
      violations.push({ rule })
    }
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      flagModuleSpecifier(node.moduleSpecifier, 'forbidden-import')
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      flagModuleSpecifier(node.moduleSpecifier, 'forbidden-reexport')
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      violations.push({ rule: 'dynamic-import' })
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      violations.push({ rule: 'commonjs-require' })
    } else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Date' &&
      node.name.text === 'now'
    ) {
      violations.push({ rule: 'date-now' })
    } else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Math' &&
      node.name.text === 'random'
    ) {
      violations.push({ rule: 'math-random' })
    } else if (ts.isIdentifier(node) && FORBIDDEN_IDENTIFIERS.has(node.text)) {
      violations.push({ rule: 'forbidden-global' })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

async function collectProductionSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectProductionSourceFiles(fullPath)))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

describe('domain layer purity (AGENTS.md §2)', () => {
  it('contains no forbidden import, dynamic import, require, DOM/storage global, Date.now, or Math.random in any production module, scanned recursively', async () => {
    const files = await collectProductionSourceFiles(domainDir)
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const content = await readFile(file, 'utf-8')
      const violations = checkPurity(content, file)
      expect(violations, `${file} matched: ${violations.map((v) => v.rule).join(', ')}`).toEqual([])
    }
  })
})

describe('purity checker — detects each forbidden form (fixtures)', () => {
  const fixtures: ReadonlyArray<readonly [string, string]> = [
    ['a named import from react', `import { useState } from 'react'`],
    ['a side-effect import of react', `import 'react'`],
    ['an import from react-dom', `import { createRoot } from 'react-dom'`],
    ['a re-export from react', `export { useState } from 'react'`],
    ['a dynamic import', `import('react')`],
    ['a dynamic import of a non-react module', `import('some-module')`],
    ['a CommonJS require', `const mod = require('react')`],
    ['bare localStorage access', `localStorage.getItem('x')`],
    ['qualified localStorage access via globalThis', `globalThis.localStorage.getItem('x')`],
    ['bare sessionStorage access', `sessionStorage.setItem('x', 'y')`],
    ['a bare window reference', `window.alert('x')`],
    ['a bare document reference', `document.title`],
    ['Date.now()', `const t = Date.now()`],
    ['a bare Date.now reference', `const f = Date.now`],
    ['Math.random()', `const r = Math.random()`],
  ]

  it.each(fixtures)('detects %s', (_label, source) => {
    const violations = checkPurity(source, 'fixture.ts')
    expect(violations.length).toBeGreaterThan(0)
  })

  it('does not flag ordinary pure code', () => {
    const violations = checkPurity('export function add(a: number, b: number): number {\n  return a + b\n}', 'fixture.ts')
    expect(violations).toEqual([])
  })

  it('does not flag unrelated Math or Date usage', () => {
    const violations = checkPurity(
      'const x = Math.floor(1.5)\nconst y = Math.abs(-1)\nconst d = new Date(2024, 0, 1)',
      'fixture.ts',
    )
    expect(violations).toEqual([])
  })
})

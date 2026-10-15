// The public repo's CI: the internal CI checks are in gitea-workflow.test.ts, which the public repo does not have.
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const github = parse(readFileSync('.github/workflows/test.yml', 'utf8'))
const steps: any[] = github.jobs.test.steps
const php = steps.find((step) => String(step.uses).startsWith('shivammathur/setup-php@'))

describe('GitHub workflow of the public repo', () => {
  it('runs on push and pull_request', () => {
    expect(github.on).toEqual(['push', 'pull_request'])
  })

  it('sets up PHP 8.1 and the latest PHP with composer, and Node', () => {
    expect(github.jobs.test.strategy.matrix.php).toEqual(['8.1', 'latest'])
    expect(php.with['php-version']).toBe('${{ matrix.php }}')
    expect(php.with.tools).toBe('composer')
    expect(steps.some((step) => String(step.uses).startsWith('actions/setup-node@'))).toBe(true)
    expect(steps.some((step) => String(step.run).includes('pnpm'))).toBe(true)
  })

  it('ends with a frozen install and the tests', () => {
    expect(steps.slice(-2).map((step) => step.run)).toEqual(['pnpm install --frozen-lockfile', 'pnpm test'])
  })
})

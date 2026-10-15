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
  })

  it('sets up pnpm before setup-node, which caches the pnpm store', () => {
    const pnpmIndex = steps.findIndex((step) => String(step.uses).startsWith('pnpm/action-setup@v4'))
    const nodeIndex = steps.findIndex((step) => String(step.uses).startsWith('actions/setup-node@'))
    expect(pnpmIndex).toBeGreaterThanOrEqual(0)
    expect(pnpmIndex).toBeLessThan(nodeIndex)
    expect(steps[nodeIndex].with).toEqual({ 'node-version': 'lts/*', cache: 'pnpm' })
    expect(steps.some((step) => String(step.run).includes('corepack prepare'))).toBe(false)
  })

  it('ends with a frozen install and the tests', () => {
    expect(steps.slice(-2).map((step) => step.run)).toEqual(['pnpm install --frozen-lockfile', 'pnpm test'])
  })
})

describe('Gitea workflows survive a slow network', () => {
  const storeCache = (job: any) => job.steps.find((step: any) => step.uses === 'actions/cache@v4' && step.with.key.startsWith('pnpm-'))

  it('publish restores and saves the pnpm store before the release step', () => {
    const publish = parse(readFileSync('.gitea/workflows/publish.yml', 'utf8')).jobs.publish
    const cache = storeCache(publish)
    expect(cache.with).toEqual({
      path: '${{ steps.pnpm-store.outputs.path }}',
      key: "pnpm-${{ hashFiles('pnpm-lock.yaml') }}",
      'restore-keys': 'pnpm-',
    })
    expect(publish.steps.indexOf(cache)).toBeLessThan(publish.steps.findIndex((step: any) => step.name === 'release'))
  })

  it('test jobs fail on an empty pnpm store path before the cache step', () => {
    const jobs = parse(readFileSync('.gitea/workflows/test.yml', 'utf8')).jobs
    for (const job of [jobs.test, jobs['public-tree']]) {
      const lookup = job.steps.find((step: any) => step.id === 'pnpm-store')
      expect(lookup.run).toContain('test -n "$store"')
      expect(job.steps.indexOf(lookup)).toBeLessThan(job.steps.indexOf(storeCache(job)))
    }
  })

  it('.npmrc sets the fetch retries and timeouts', () => {
    const settings = Object.fromEntries(
      readFileSync('.npmrc', 'utf8').split('\n').filter(Boolean).map((line) => line.split('=')),
    )
    expect(settings).toEqual({
      'fetch-retries': '5',
      'fetch-retry-mintimeout': '10000',
      'fetch-retry-maxtimeout': '120000',
      'fetch-timeout': '300000',
    })
  })
})

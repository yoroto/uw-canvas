import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { describeChange, fingerprintOf, mergeFingerprint } from '../src/shared/importance/fingerprint'
import { SeenStore } from '../src/main/store/seenStore'
import { makeAssignment } from './helpers'

describe('describeChange', () => {
  const base = makeAssignment({ workflowState: 'graded', score: 9, gradedAt: '2026-10-20T00:00:00Z', commentCount: 1, lastCommentId: 'c1' })
  const seen = fingerprintOf(base)

  it('is null when nothing changed or there is no record', () => {
    expect(describeChange(base, seen)).toBeNull()
    expect(describeChange(base, undefined)).toBeNull()
  })

  it('detects a new comment as feedback', () => {
    expect(describeChange({ ...base, commentCount: 2, lastCommentId: 'c2' }, seen)).toBe('feedback')
    expect(describeChange({ ...base, lastCommentId: 'c9' }, seen)).toBe('feedback')
  })

  it('detects grade, score and state changes as grade', () => {
    expect(describeChange({ ...base, score: 10 }, seen)).toBe('grade')
    expect(describeChange({ ...base, grade: 'A' }, seen)).toBe('grade')
    expect(describeChange({ ...base, gradedAt: '2026-10-25T00:00:00Z' }, seen)).toBe('grade')
    expect(describeChange({ ...base, workflowState: 'submitted' }, seen)).toBe('grade')
  })

  it('prefers feedback when both changed', () => {
    expect(describeChange({ ...base, score: 1, commentCount: 5, lastCommentId: 'c5' }, seen)).toBe('feedback')
  })

  it('does not count unknown comments as a change, on either side', () => {
    expect(describeChange({ ...base, commentCount: null, lastCommentId: null }, seen)).toBeNull()
    expect(describeChange(base, { ...seen, commentCount: null, lastCommentId: null })).toBeNull()
  })
})

describe('mergeFingerprint', () => {
  const prev = { state: 'graded', gradedAt: null, score: 1, grade: null, commentCount: 3, lastCommentId: 'c3' }

  it('takes the current fingerprint when comments are known', () => {
    const cur = { ...prev, commentCount: 4, lastCommentId: 'c4' }
    expect(mergeFingerprint(prev, cur)).toEqual(cur)
  })

  it('keeps the old comment info when the new one is unknown', () => {
    const cur = { ...prev, score: 2, commentCount: null, lastCommentId: null }
    expect(mergeFingerprint(prev, cur)).toEqual({ ...cur, commentCount: 3, lastCommentId: 'c3' })
  })
})

describe('SeenStore', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'seen-'))
    file = join(dir, 'nested', 'seen.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const item = makeAssignment({ id: 'a', commentCount: 0 })

  it('records new items silently, so the first run flags nothing', () => {
    const store = new SeenStore(file)
    const seen = store.reconcile([item])
    expect(seen[item.key]).toEqual(fingerprintOf(item))
    expect(describeChange(item, seen[item.key])).toBeNull()
  })

  it('flags a later change until it is marked seen, and persists across restarts', () => {
    new SeenStore(file).reconcile([item])

    const store = new SeenStore(file) // "restart"
    const changed = { ...item, workflowState: 'graded', score: 7 }
    let seen = store.reconcile([changed])
    expect(describeChange(changed, seen[item.key])).toBe('grade')

    seen = store.markSeen([item.key])
    expect(describeChange(changed, seen[item.key])).toBeNull()

    seen = new SeenStore(file).reconcile([changed])
    expect(describeChange(changed, seen[item.key])).toBeNull()
  })

  it('keeps flagging if the change is not marked seen before a restart', () => {
    new SeenStore(file).reconcile([item])
    const changed = { ...item, commentCount: 1, lastCommentId: 'c1' }
    new SeenStore(file).reconcile([changed])
    const seen = new SeenStore(file).reconcile([changed])
    expect(describeChange(changed, seen[item.key])).toBe('feedback')
  })

  it('learns comments silently when they were unknown at first', () => {
    const unknown = { ...item, commentCount: null, lastCommentId: null }
    const store = new SeenStore(file)
    store.reconcile([unknown])
    const known = { ...item, commentCount: 2, lastCommentId: 'c2' }
    const seen = store.reconcile([known])
    expect(describeChange(known, seen[item.key])).toBeNull()
  })

  it('ignores keys it has not listed and leaves a clean file', () => {
    const store = new SeenStore(file)
    store.reconcile([item])
    store.markSeen(['unknown-key'])
    const onDisk = JSON.parse(readFileSync(file, 'utf8'))
    expect(onDisk.version).toBe(1)
    expect(Object.keys(onDisk.seen)).toEqual([item.key])
  })

  it('recovers from a corrupt file', () => {
    new SeenStore(file).reconcile([item])
    writeFileSync(file, '{not json')
    const seen = new SeenStore(file).reconcile([item])
    expect(Object.keys(seen)).toEqual([item.key])
  })
})

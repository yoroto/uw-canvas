import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AssignmentView, Fingerprint } from '../../shared/assignments/types'
import { fingerprintOf, mergeFingerprint } from '../../shared/importance/fingerprint'

type SeenMap = Record<string, Fingerprint>

interface FileShape {
  version: 1
  seen: SeenMap
}

/**
 * Remembers, per assignment, what the user has already seen, in a small JSON
 * file. Anything not yet recorded is recorded silently (so the first launch
 * flags nothing); a record only changes when the user marks the item seen.
 */
export class SeenStore {
  private seen: SeenMap
  /** Fingerprints from the latest `reconcile`, used by `markSeen`. */
  private current: SeenMap = {}

  constructor(private readonly file: string) {
    this.seen = this.load()
  }

  /** Records unseen keys silently and returns the seen map to compare against. */
  reconcile(items: readonly AssignmentView[]): SeenMap {
    let dirty = false
    this.current = {}
    for (const item of items) {
      const cur = fingerprintOf(item)
      this.current[item.key] = cur
      const rec = this.seen[item.key]
      if (!rec) {
        this.seen[item.key] = cur
        dirty = true
      } else if (rec.commentCount === null && cur.commentCount !== null) {
        // Comments were unknown when recorded; learn them without flagging.
        this.seen[item.key] = { ...rec, commentCount: cur.commentCount, lastCommentId: cur.lastCommentId }
        dirty = true
      }
    }
    if (dirty) this.save()
    return { ...this.seen }
  }

  /** Marks the latest known state of these assignments as seen. */
  markSeen(keys: readonly string[]): SeenMap {
    let dirty = false
    for (const key of keys) {
      const cur = this.current[key]
      if (!cur) continue
      this.seen[key] = mergeFingerprint(this.seen[key], cur)
      dirty = true
    }
    if (dirty) this.save()
    return { ...this.seen }
  }

  private load(): SeenMap {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<FileShape>
      if (raw?.version === 1 && raw.seen && typeof raw.seen === 'object') return raw.seen
    } catch {
      // missing or corrupt: start empty, everything is baselined silently
    }
    return {}
  }

  private save(): void {
    const data: FileShape = { version: 1, seen: this.seen }
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(data))
    renameSync(tmp, this.file)
  }
}

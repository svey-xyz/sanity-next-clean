import {stegaClean} from '@sanity/client/stega'

/**
 * Editor-configured default ordering for archive blocks (issue #16, pattern
 * from vsc-website). The schema mixin lives in
 * `studio/src/schemaTypes/objects/shared.ts` (`sortFields`); each archive
 * block stores `sortField` + `sortDirection`, applied here after the GROQ
 * resolution (GROQ `order()` cannot take a field name from document data).
 *
 * Hand-picked sources keep the editor's manual order — callers skip sorting
 * for `source == "picked"` (the Studio hides the controls there too).
 */
export type ArchiveSortConfig = {
  sortField?: string | null
  sortDirection?: string | null
}

/** Per-block map of sortable field → comparable value. */
type Getters<T> = Record<string, (item: T) => string | number | null | undefined>

/** ISO datetime → epoch ms; unparseable/missing → NaN (handled as "sorts last"). */
export const toTime = (value: string | null | undefined): number =>
  value ? Date.parse(value) : NaN

/**
 * The `sortField` value for drag-and-drop custom ordering — the lexorank
 * (`orderRank`, @sanity/orderable-document-list) set in the studio's orderable
 * Projects list. A lexorank has ONE inherent (ascending) order, so
 * `sortDirection` is ignored and the studio hides the direction control for it
 * (`sortFields` in studio/src/schemaTypes/objects/shared.ts).
 */
export const CUSTOM_SORT_FIELD = 'custom'

/**
 * Lexoranks compare as plain code-unit strings — no locale/numeric collation
 * (`localeCompare` could reorder ranks). Unranked documents (created before
 * the orderable list existed) sink to the end; sort stability keeps their
 * relative order. Ranks are CMS strings used in logic → stega-cleaned.
 */
export const compareOrderRank = (
  a: string | null | undefined,
  b: string | null | undefined,
): number => {
  const rankA = a ? stegaClean(a) : ''
  const rankB = b ? stegaClean(b) : ''
  if (!rankA || !rankB) return Number(!rankA) - Number(!rankB)
  return rankA < rankB ? -1 : rankA > rankB ? 1 : 0
}

/**
 * Stable sort of `items` by the block's configured field/direction.
 * Values are compared with `localeCompare` for strings and numerically
 * otherwise; nullish/unparseable values sort last in either direction.
 * Unknown/unset `sortField` returns the input untouched. Both config values
 * are CMS strings used in logic, so they are stega-cleaned (CLAUDE.md).
 */
export function applyArchiveSort<T>(
  items: readonly T[],
  config: ArchiveSortConfig,
  getters: Getters<T>,
): T[] {
  const field = stegaClean(config.sortField ?? undefined)
  const get = field ? getters[field] : undefined
  if (!get) return [...items]

  // Custom (lexorank) order: inherent direction, code-unit comparison.
  if (field === CUSTOM_SORT_FIELD) {
    return [...items].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      return compareOrderRank(
        typeof va === 'string' ? va : null,
        typeof vb === 'string' ? vb : null,
      )
    })
  }

  const direction = stegaClean(config.sortDirection ?? undefined) === 'asc' ? 1 : -1

  return [...items].sort((a, b) => {
    const va = get(a)
    const vb = get(b)
    const aNull = va === null || va === undefined || (typeof va === 'number' && Number.isNaN(va))
    const bNull = vb === null || vb === undefined || (typeof vb === 'number' && Number.isNaN(vb))
    if (aNull && bNull) return 0
    if (aNull) return 1 // nullish always last
    if (bNull) return -1
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb, undefined, {sensitivity: 'base'}) * direction
    }
    return (Number(va) - Number(vb)) * direction
  })
}

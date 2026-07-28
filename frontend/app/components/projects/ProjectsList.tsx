'use client'

import {useMemo, useState, useSyncExternalStore} from 'react'

import {stegaClean} from '@sanity/client/stega'

import ProjectCard, {type ProjectCardItem} from './ProjectCard'
import FeaturedProjectCard from './FeaturedProjectCard'
import {saveProjectNavContext} from './nav-context'
// Direct module import (not the `blocks` barrel) — the barrel would pull the
// server-only block components into this client module graph.
import {compareOrderRank} from '@/app/components/blocks/archiveSort'
import Reveal from '@/app/components/motion/Reveal'
import {cn} from '@/lib/utils'

type Project = ProjectCardItem
/** Shared shape of the `categories` / `tech` reference projections (`{_id, title, slug}`). */
type Taxon = {_id: string; title: string | null; slug: string | null}

const ALL = '__all__'

/**
 * Values of the visitor sort control. `'custom'` is the drag-and-drop order
 * from the studio's orderable Projects list (`orderRank` lexorank) — offered
 * only when the data actually carries ranks (or the editor default is
 * `custom`), so the control never shows a do-nothing option.
 */
export type SortKey = 'created' | 'updated' | 'custom'

type Props = {
  projects: Project[]
  /** Show the "filter by category" radio group. Default `true`. */
  showFilter?: boolean
  /** Show the "filter by tech" radio group. Independent of `showFilter`. Default `true`
   *  (only rendered when there is more than one tech to filter by). */
  showTechFilter?: boolean
  /** Show the "sort by" select. Default `true`. When `false`, the incoming order is preserved
   *  (so a hand-picked / pre-ordered selection isn't re-sorted). */
  showSort?: boolean
  /** Initial value of the sort control (editor default from the archive block's
   *  `sortField`, issue #16 — `'custom'` maps the drag-and-drop studio order).
   *  Only meaningful with `showSort`; the SSR render uses it too, so first
   *  paint matches the server order. Default `'created'`. */
  initialSort?: SortKey
  /** Grid columns at the widest breakpoint. Default `3`. */
  columns?: 2 | 3
  /** Heading tag for the cards. Omit to use each card's own default (regular `h3`, featured `h2`). */
  headingLevel?: 'h2' | 'h3'
  /** Wrapper override (defaults to `mt-8`). */
  className?: string
}

// 3-col layout reuses the original breakpoints; 2-col caps at `sm`.
const gridColsClass: Record<2 | 3, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
}
const featuredSpanClass: Record<2 | 3, string> = {
  2: 'sm:col-span-2',
  3: 'sm:col-span-2 lg:col-span-3',
}

// --- Hydration-safe mount flag (no setState-in-effect). Mirrors `ThemeToggle`:
// SSR + first paint get the server snapshot (`false`) so the markup is fully
// deterministic — ALL cards in newest-first order, no filter/sort applied — and
// the interactive state only engages once hydrated. Avoids the React 19
// `react-hooks/set-state-in-effect` lint rule and any hydration mismatch / CLS.
const noopSubscribe = () => () => {}
const getMountedSnapshot = () => true
const getServerSnapshot = () => false

/** Parse an ISO datetime to epoch ms; unparseable / missing → 0 (sorts last). */
function toTime(value: string | null | undefined): number {
  if (!value) return 0
  const t = Date.parse(value)
  return Number.isNaN(t) ? 0 : t
}

/**
 * One-shot client-side seed of a filter from the listing URL (`?tag=`/`?tech=`
 * category/tech **slugs**). Read straight from `window` rather than
 * `useSearchParams` on purpose: `useSearchParams` would push the whole card grid
 * to client-only rendering (no SSR HTML → worse CLS/SEO). This runs only in a
 * `useState` lazy initializer, and the `mounted` gate below keeps the first
 * client render unfiltered — so it always matches the server HTML before the
 * seeded filter engages on hydration. SSR returns `ALL`.
 */
function seedFromUrl(param: string): string {
  if (typeof window === 'undefined') return ALL
  return new URLSearchParams(window.location.search).get(param) || ALL
}

type Option = {value: string; title: string}

/**
 * De-duplicate a taxonomy across all projects into `[{value: slug, title}]`,
 * keyed by `slug` (the URL-facing identity), with an "All" pseudo-option first.
 * Entries without a slug are skipped — they can't be deep-linked or matched.
 */
function buildOptions(projects: Project[], pick: (p: Project) => readonly Taxon[] | null | undefined): Option[] {
  const seen = new Map<string, string>()
  for (const p of projects) {
    for (const t of pick(p) ?? []) {
      if (t?.slug && !seen.has(t.slug)) seen.set(t.slug, t.title ?? t.slug)
    }
  }
  return [{value: ALL, title: 'All'}, ...[...seen].map(([value, title]) => ({value, title}))]
}

/** Labelled radio group rendered as a segmented chip control (a11y: `fieldset`/`legend`). */
function RadioFilter({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string
  name: string
  options: Option[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-muted-foreground">{legend}</legend>
      {/* Native radios sharing `name` form the radio group; the <fieldset>/<legend>
          names it. No explicit role needed — the inputs carry the semantics. */}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = value === opt.value
          return (
            <label
              key={opt.value}
              className={cn(
                'cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                'focus-within:outline-none focus-within:ring-1 focus-within:ring-ring',
                checked
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              {opt.title}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * Shared projects root — owns the optional filters (by category + by tech) and
 * sort (created / updated) controls and the responsive card grid. Rendered by the
 * `projectsArchive` page-builder block (controls toggled per the editor's
 * `showFilter` / `showSort` fields); the projects listing is now a normal page
 * carrying that block, not a standalone route. **Does no fetching** — data
 * arrives as props.
 *
 * Deep-linking: when filters are shown, the initial category/tech is seeded from
 * the listing URL's `?tag=`/`?tech=` (slugs) via {@link seedFromUrl}, so clicking
 * a tag or tech chip on a project detail page lands here pre-filtered.
 *
 * Filtering toggles per-card visibility (`block`/`hidden` via `className`) rather
 * than unmounting cards, so Visual-Editing `data-sanity` attrs and the
 * card→detail View-Transition names stay stable. Sorting reorders the DOM (that
 * reorder is what drives the View-Transition reflow animation). With `showSort`
 * off, the incoming prop order is preserved verbatim.
 *
 * SSR-safe default: before hydration (`mounted === false`) every card renders,
 * already in newest-first (`publishedAt desc`) order when sorting is enabled,
 * with no filtering — so the server HTML and the first client render match; the
 * seeded filter engages on mount.
 *
 * a11y: each filter is a labelled radio `fieldset`/`legend`; the sort is a
 * `<label>`-associated `<select>`. The visible result count is announced via an
 * `aria-live="polite"` region.
 */
export default function ProjectsList({
  projects,
  showFilter = true,
  showTechFilter = true,
  showSort = true,
  initialSort = 'created',
  columns = 3,
  headingLevel,
  className,
}: Props) {
  const mounted = useSyncExternalStore(noopSubscribe, getMountedSnapshot, getServerSnapshot)

  // Seed from the URL only when the matching filter is shown; otherwise "All".
  const [activeTag, setActiveTag] = useState<string>(() => (showFilter ? seedFromUrl('tag') : ALL))
  const [activeTech, setActiveTech] = useState<string>(() =>
    showTechFilter ? seedFromUrl('tech') : ALL,
  )
  const [sort, setSort] = useState<SortKey>(initialSort)

  // Unique category / tech options across all projects, keyed by slug.
  const tags = useMemo(() => buildOptions(projects, (p) => p.categories), [projects])
  const techs = useMemo(() => buildOptions(projects, (p) => p.tech), [projects])

  // Effective state: each filter only engages when its own toggle is on +
  // hydrated; otherwise "All".
  const effectiveTag = showFilter && mounted ? activeTag : ALL
  const effectiveTech = showTechFilter && mounted ? activeTech : ALL

  // Sort by the chosen key: newest-first for the datetime sorts, lexorank
  // (code-unit, unranked last) for 'custom'. Stable copy so the source prop
  // order is never mutated (it backs Visual Editing reconciliation upstream).
  // When sorting is disabled, the incoming order is preserved as-is.
  const ordered = useMemo(() => {
    if (!showSort) return projects
    const effectiveSort: SortKey = mounted ? sort : initialSort
    if (effectiveSort === 'custom') {
      return [...projects].sort((a, b) => compareOrderRank(a.orderRank, b.orderRank))
    }
    const key = effectiveSort === 'updated' ? 'updatedAt' : 'publishedAt'
    return [...projects].sort((a, b) => toTime(b[key]) - toTime(a[key]))
  }, [projects, showSort, sort, mounted, initialSort])

  // Offer the curated option only when it can do something (see {@link SortKey}).
  const offerCustomSort = useMemo(
    () => initialSort === 'custom' || projects.some((p) => Boolean(p.orderRank)),
    [projects, initialSort],
  )

  // A card is visible when both the category and tech filters match ("All" passes).
  const isVisible = (p: Project) => {
    const tagOk = effectiveTag === ALL || (p.categories ?? []).some((c) => c?.slug === effectiveTag)
    const techOk = effectiveTech === ALL || (p.tech ?? []).some((t) => t?.slug === effectiveTech)
    return tagOk && techOk
  }

  const visibleCount = mounted ? ordered.filter(isVisible).length : ordered.length
  // Only surface a filter when there's more than one option to choose from.
  const renderTagFilter = showFilter && tags.length > 1
  const renderTechFilter = showTechFilter && techs.length > 1
  const hasFilters = renderTagFilter || renderTechFilter
  const hasControls = hasFilters || showSort

  return (
    <div className={cn('mt-8', className)}>
      {hasControls && (
        <div className="flex flex-col gap-6 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          {/* Filters — labelled radio groups (segmented controls). Each toggle is
              independent: category and tech can be shown together or on their own. */}
          {hasFilters && (
            <div className="flex min-w-0 flex-col gap-5">
              {renderTagFilter && (
                <RadioFilter
                  legend="Filter by category"
                  name="project-tag"
                  options={tags}
                  value={effectiveTag}
                  onChange={setActiveTag}
                />
              )}
              {renderTechFilter && (
                <RadioFilter
                  legend="Filter by tech"
                  name="project-tech"
                  options={techs}
                  value={effectiveTech}
                  onChange={setActiveTech}
                />
              )}
            </div>
          )}

          {/* Sort — labelled native select. */}
          {showSort && (
            <div className="flex shrink-0 flex-col gap-2">
              <label htmlFor="project-sort" className="text-sm font-medium text-muted-foreground">
                Sort by
              </label>
              <select
                id="project-sort"
                value={mounted ? sort : initialSort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {offerCustomSort && <option value="custom">Curated order</option>}
                <option value="created">Newest first (created)</option>
                <option value="updated">Recently updated</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Result count — polite live region. Only meaningful while filtering. */}
      {hasFilters && (
        <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {visibleCount} {visibleCount === 1 ? 'project' : 'projects'}
        </p>
      )}

      <ul
        className={cn('mt-6 grid grid-cols-1 gap-6', gridColsClass[columns])}
        // Snapshot the visible (filtered) projects in rendered (sorted) order
        // when a card link is clicked, so the detail page's prev/next pages
        // through THIS list and its back link can restore it (issue #17).
        // Capture-phase delegation: the synchronous sessionStorage write lands
        // before navigation. Slugs/titles are stega-cleaned — they become
        // hrefs/labels on the detail page.
        onClickCapture={(event) => {
          const anchor = (event.target as HTMLElement).closest?.('a[href]')
          if (!anchor) return
          saveProjectNavContext({
            entries: ordered
              .filter(isVisible)
              .map((p) => ({slug: stegaClean(p.slug), title: stegaClean(p.title)})),
            from: window.location.pathname + window.location.search,
          })
        }}
      >
        {ordered.map((project, i) => {
          const visible = !mounted || isVisible(project)
          const featured = project.featured === true
          return (
            <Reveal
              as="li"
              key={project._id}
              i={i % 8}
              variant="up"
              className={cn(
                visible ? 'block' : 'hidden',
                // featured && featuredSpanClass[columns],
              )}
            >
              {featured ? (
                <FeaturedProjectCard project={project} headingLevel={headingLevel} />
              ) : (
                <ProjectCard project={project} headingLevel={headingLevel} />
              )}
            </Reveal>
          )
        })}
      </ul>

      {ordered.length === 0 && <p className="mt-8 text-muted-foreground">No projects yet.</p>}
    </div>
  )
}

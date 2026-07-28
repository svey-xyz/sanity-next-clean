import {stegaClean} from '@sanity/client/stega'

import {applyArchiveSort, toTime} from './archiveSort'
import type {SortKey} from '@/app/components/projects/ProjectsList'
import ProjectsList from '@/app/components/projects/ProjectsList'
import {type ProjectCardItem} from '@/app/components/projects/ProjectCard'
import Reveal from '@/app/components/motion/Reveal'
import {ExtractPageBuilderType} from '@/sanity/lib/types'

type Props = {
  block: ExtractPageBuilderType<'projectsArchive'>
  index: number
  pageId: string
  pageType: string
}

/**
 * Projects-archive page-builder block (SVE-40). A thin server wrapper around the
 * shared {@link ProjectsList} root. This block IS the projects listing — a page
 * designated the Projects archive (`page.archive`) carries exactly one of these.
 * The block owns only its `heading`/`subheading`; the cards, grid, and the
 * optional filter/sort controls all live in `ProjectsList`, toggled by the
 * editor's `showFilter` / `showSort` fields.
 *
 * The block's `projects` projection shares `projectFields` with
 * `AllProjectsQueryResult`, so it feeds `ProjectsList` directly. Editor `columns`
 * (2|3) selects the grid width; featured items span the row.
 */
export default function ProjectsArchive({block}: Props) {
  const {heading, subheading, source, projects, limit, columns, category} = block
  // `showFilter`/`showTechFilter`/`showSort` may predate the deployed TypeGen
  // output — read them via the same `'x' in block` idiom used for `background` in
  // `BlockRenderer`. A `category` constraint narrows the grid to one tag, so the
  // *category* filter is suppressed even if a stale `showFilter: true` lingers
  // (hidden Studio fields keep their stored value). The tech filter is
  // independent of the category constraint.
  const showFilter = 'showFilter' in block && block.showFilter === true && !category
  const showTechFilter = 'showTechFilter' in block && block.showTechFilter === true
  const showSort = 'showSort' in block && block.showSort === true

  // Editor-configured default ordering (sortField/sortDirection, issue #16) —
  // hand-picked sources keep the manual order. Applied before the 'latest'
  // limit so the limit selects from the sorted set.
  const picked = stegaClean(source) === 'picked'
  const sortField = stegaClean(block.sortField ?? undefined)
  const all = picked
    ? ((projects ?? []) as ProjectCardItem[])
    : (applyArchiveSort(projects ?? [], block, {
        publishedAt: (p) => toTime(p.publishedAt),
        updatedAt: (p) => toTime(p.updatedAt ?? p.publishedAt),
        title: (p) => p.title,
        // Drag-and-drop order from the studio's orderable Projects list —
        // `applyArchiveSort` special-cases 'custom' (code-unit lexorank
        // comparison, inherent direction, unranked last).
        custom: (p) => p.orderRank,
      }) as ProjectCardItem[])
  // Seed the interactive sort control from the editor default where it maps
  // ('custom' is a first-class control option; a 'title' default simply
  // starts the control on 'created' if the user engages it).
  const initialSort: SortKey =
    sortField === 'custom' ? 'custom' : sortField === 'updatedAt' ? 'updated' : 'created'
  // GROQ caps 'latest' at 24; apply the editor's exact limit here.
  const shown = stegaClean(source) === 'latest' ? all.slice(0, limit ?? 6) : all
  const cols = columns === 2 ? 2 : 3

  return (
    <section className="container my-12 lg:my-16">
      <header className="max-w-3xl">
        {heading && (
          <Reveal as="h2" className="text-2xl md:text-3xl lg:text-4xl">
            {heading}
          </Reveal>
        )}
        {subheading && (
          <Reveal i={1} as="p" className="mt-3 text-lg leading-8 text-muted-foreground">
            {subheading}
          </Reveal>
        )}
      </header>

      <ProjectsList
        projects={shown}
        showFilter={showFilter}
        showTechFilter={showTechFilter}
        showSort={showSort}
        initialSort={initialSort}
        columns={cols}
        headingLevel="h3"
      />
    </section>
  )
}

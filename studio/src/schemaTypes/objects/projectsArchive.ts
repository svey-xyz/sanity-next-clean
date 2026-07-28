import {defineArrayMember, defineField, defineType} from 'sanity'
import {ThLargeIcon} from '@sanity/icons/ThLarge'

import {sortFields} from './shared'

/**
 * Projects Archive — renders a grid of projects. Source modes:
 *  - `latest`  newest N (limit), optionally filtered by category
 *  - `all`     every project, optionally filtered by category
 *  - `picked`  an explicit, ordered list of projects
 * Content is resolved in `getPageQuery` (the page builder renders client-side
 * for Visual Editing, so blocks can't fetch on their own).
 * Mirrors `postsArchive`. The rich listing UI lands in SVE-40.
 */
export const projectsArchive = defineType({
  name: 'projectsArchive',
  title: 'Projects Archive',
  type: 'object',
  icon: ThLargeIcon,
  fields: [
    defineField({name: 'heading', title: 'Heading', type: 'string'}),
    defineField({name: 'subheading', title: 'Subheading', type: 'string'}),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      initialValue: 'latest',
      options: {
        list: [
          {title: 'Latest projects', value: 'latest'},
          {title: 'All projects', value: 'all'},
          {title: 'Hand-picked', value: 'picked'},
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'limit',
      title: 'Number of projects',
      type: 'number',
      initialValue: 6,
      validation: (Rule) => Rule.min(1).max(24).integer(),
      hidden: ({parent}) => parent?.source !== 'latest',
    }),
    defineField({
      name: 'category',
      title: 'Filter by category',
      type: 'reference',
      to: [{type: 'category'}],
      description: 'Optional. Only applies to Latest / All.',
      hidden: ({parent}) => parent?.source === 'picked',
    }),
    defineField({
      name: 'projects',
      title: 'Projects',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'project'}]})],
      hidden: ({parent}) => parent?.source !== 'picked',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const parent = context.parent as {source?: string}
          if (parent?.source === 'picked' && (!value || value.length === 0)) {
            return 'Pick at least one project'
          }
          return true
        }),
    }),
    defineField({
      name: 'columns',
      title: 'Columns',
      type: 'number',
      initialValue: 3,
      options: {
        list: [
          {title: 'Two', value: 2},
          {title: 'Three', value: 3},
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
    }),
    defineField({
      name: 'showFilter',
      title: 'Show category filter',
      type: 'boolean',
      initialValue: false,
      description: 'Render the interactive “filter by category” controls above the grid.',
      // A `category` constraint narrows the grid to one tag, leaving nothing to
      // filter — so the toggle only applies when no category is set.
      hidden: ({parent}) => Boolean(parent?.category),
    }),
    defineField({
      name: 'showTechFilter',
      title: 'Show tech filter',
      type: 'boolean',
      initialValue: false,
      description:
        'Render the interactive “filter by tech” controls above the grid. Independent of the category filter and of any category constraint.',
    }),
    defineField({
      name: 'showSort',
      title: 'Show sort control',
      type: 'boolean',
      initialValue: false,
      description:
        'Render the “sort by” control (newest / recently updated) above the grid. When off, the editor’s order is preserved.',
    }),
    ...sortFields({
      fields: [
        {title: 'Published date', value: 'publishedAt'},
        {title: 'Last updated', value: 'updatedAt'},
        {title: 'Title', value: 'title'},
        // The drag-and-drop order of the studio's Projects list
        // (@sanity/orderable-document-list `orderRank`). Direction control
        // hides for this — the rank has one inherent order.
        {title: 'Custom order', value: 'custom'},
      ],
      initialField: 'publishedAt',
      directionlessFields: ['custom'],
    }),
  ],
  preview: {
    select: {heading: 'heading', source: 'source'},
    prepare({heading, source}) {
      return {
        title: heading || 'Projects Archive',
        subtitle: `Projects Archive · ${source || 'latest'}`,
      }
    },
  },
})

import {RocketIcon} from '@sanity/icons/Rocket'
import {orderRankField, orderRankOrdering} from '@sanity/orderable-document-list'
import {format, parseISO} from 'date-fns'
import {defineArrayMember, defineField, defineType} from 'sanity'
import type {Project} from '../../../sanity.types'

/**
 * Project schema. Routable document (`/projects/:slug`) for portfolio-style
 * work. Mirrors `post` for the editorial bits (slug, cover image, body) and
 * adds project-specific metadata (website / repo links, taxonomies, featured
 * flag, visibility toggle). Two separate taxonomies:
 *   - `categories` → `category` docs: general topical tags for grouping /
 *     filtering the listing (e.g. Client Work, Open Source, Portfolio Site).
 *   - `tech` → `technology` docs: the stack a project was built with.
 * `hidden` lets a project be kept in the dataset but withheld from the public
 * frontend (listing, sitemap, static params, and the detail route).
 * Learn more: https://www.sanity.io/docs/schema-types
 */

export const project = defineType({
  name: 'project',
  title: 'Project',
  icon: RocketIcon,
  type: 'document',
  orderings: [orderRankOrdering],
  fields: [
    // Hidden lexorank managed by the drag-and-drop Projects list in the studio
    // structure (@sanity/orderable-document-list). Read by the projects
    // archive's 'custom' sort on the frontend (blocks/archiveSort.ts).
    orderRankField({type: 'project'}),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'A slug is required for the project to show up in the preview',
      options: {
        source: 'title',
        maxLength: 96,
        isUnique: (value, context) => context.defaultIsUnique(value, context),
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 3,
      description: 'Short summary used in listings and as the meta description.',
    }),
    defineField({
      name: 'coverImage',
      title: 'Cover Image',
      type: 'image',
      options: {
        hotspot: true,
        aiAssist: {
          imageDescriptionField: 'alt',
        },
      },
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alternative text',
          description: 'Important for SEO and accessibility.',
          validation: (rule) => {
            // Custom validation to ensure alt text is provided if the image is present. https://www.sanity.io/docs/validation
            return rule.custom((alt, context) => {
              const document = context.document as Project
              if (document?.coverImage?.asset?._ref && !alt) {
                return 'Required'
              }
              return true
            })
          },
        },
      ],
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated at',
      type: 'datetime',
      description: 'When the project itself was last meaningfully updated.',
    }),
    defineField({
      name: 'website',
      title: 'Website',
      type: 'url',
      description: 'Live URL for the project, if any.',
      validation: (rule) => rule.uri({scheme: ['http', 'https']}),
    }),
    defineField({
      name: 'repo',
      title: 'Repository',
      type: 'url',
      description: 'Source repository URL, if any.',
      validation: (rule) => rule.uri({scheme: ['http', 'https']}),
    }),
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      description: 'General tags for grouping / filtering (e.g. Client Work, Open Source).',
      of: [defineArrayMember({type: 'reference', to: [{type: 'category'}]})],
    }),
    defineField({
      name: 'tech',
      title: 'Tech',
      type: 'array',
      description: 'The stack this project was built with. References the Technology taxonomy.',
      of: [defineArrayMember({type: 'reference', to: [{type: 'technology'}]})],
    }),
    defineField({
      name: 'featured',
      title: 'Featured',
      type: 'boolean',
      description: 'Highlight this project in featured listings.',
      initialValue: false,
    }),
    defineField({
      name: 'hidden',
      title: 'Hidden',
      type: 'boolean',
      description:
        'Hide from the public site — excluded from the projects listing, sitemap, and detail route. Still editable here and visible in Presentation/draft preview.',
      initialValue: false,
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'blockContent',
    }),
    defineField({
      name: 'ogImage',
      title: 'Open Graph image',
      type: 'image',
      description: 'Optional social-share image. Falls back to the cover image if unset.',
      options: {hotspot: true},
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alternative text',
          description: 'Important for SEO and accessibility.',
        },
      ],
    }),
  ],
  // List preview configuration. https://www.sanity.io/docs/previews-list-views
  preview: {
    select: {
      title: 'title',
      featured: 'featured',
      hidden: 'hidden',
      publishedAt: 'publishedAt',
      media: 'coverImage',
    },
    prepare({title, media, featured, hidden, publishedAt}) {
      const subtitles = [
        hidden && 'Hidden',
        featured && 'Featured',
        publishedAt && format(parseISO(publishedAt), 'LLL d, yyyy'),
      ].filter(Boolean)

      return {title, media, subtitle: subtitles.join(' · ')}
    },
  },
})

import {defineArrayMember, defineField, defineType} from 'sanity'
import {Progress75Icon} from '@sanity/icons'

import {backgroundField} from './shared'

/**
 * Scores — animated radial-progress metrics (Lighthouse-style). Each item's arc
 * fills 0→`value` with a counting-up center number; rendered by
 * `frontend/app/components/Scores.tsx`. Unlike `stats` (plain big-number row),
 * Scores is the animated count-up variant. Arc fill = `value / (max ?? 100)`;
 * leave `max` unset for 0–100 percentages, set it for "37 / 50" ratios.
 */
export const scores = defineType({
  name: 'scores',
  title: 'Scores',
  type: 'object',
  icon: Progress75Icon,
  fields: [
    defineField({name: 'heading', title: 'Heading', type: 'string'}),
    defineField({
      name: 'caption',
      title: 'Caption',
      type: 'blockContentTextOnly',
      description: 'Optional supporting copy shown under the heading.',
    }),
    defineField({
      name: 'items',
      title: 'Scores',
      type: 'array',
      validation: (Rule) => Rule.min(1).error('Add at least one score.'),
      of: [
        defineArrayMember({
          type: 'object',
          name: 'score',
          fields: [
            defineField({
              name: 'label',
              title: 'Label',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'value',
              title: 'Value',
              type: 'number',
              description: 'The score to display. 0–100 unless a Max is set.',
              validation: (Rule) => Rule.required().min(0).max(100),
            }),
            defineField({
              name: 'max',
              title: 'Max',
              type: 'number',
              description: 'Optional denominator for the arc. Defaults to 100.',
              validation: (Rule) => Rule.min(1),
            }),
          ],
          preview: {
            select: {label: 'label', value: 'value', max: 'max'},
            prepare({label, value, max}) {
              const denom = typeof max === 'number' ? ` / ${max}` : ''
              const score = typeof value === 'number' ? `${value}${denom}` : 'No value'
              return {title: label || 'Score', subtitle: score}
            },
          },
        }),
      ],
    }),
    backgroundField,
  ],
  preview: {
    select: {heading: 'heading', count: 'items'},
    prepare({heading, count}) {
      const n = Array.isArray(count) ? count.length : 0
      return {title: heading || 'Scores', subtitle: `Scores · ${n} metric${n === 1 ? '' : 's'}`}
    },
  },
})

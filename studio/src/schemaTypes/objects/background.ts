import {defineField, defineType} from 'sanity'
import {ControlsIcon} from '@sanity/icons'

/**
 * Reusable `background` object — an optional animated WebGL shader background
 * (via `@svey-xyz/simple-shader-component`) attachable per page-builder block
 * (through the shared mixin in `./shared.ts`) and on the `page` document itself.
 *
 * Consumed by `frontend/app/components/shader/ShaderBackground.tsx`. The
 * `preset` keys mirror `frontend/app/components/shader/registry.ts`; keep them
 * in sync when adding presets. Frontend gracefully no-ops when `type === 'none'`
 * and renders a static gradient under reduced motion.
 */
export const background = defineType({
  name: 'background',
  title: 'Background',
  type: 'object',
  icon: ControlsIcon,
  fields: [
    defineField({
      name: 'type',
      title: 'Background type',
      type: 'string',
      initialValue: 'none',
      options: {
        list: [
          {title: 'None', value: 'none'},
          {title: 'Animated shader', value: 'shader'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'preset',
      title: 'Shader preset',
      type: 'string',
      initialValue: 'gradient',
      description: 'GLSL preset from the frontend shader registry.',
      options: {
        list: [{title: 'Flowing gradient', value: 'gradient'}],
        layout: 'radio',
      },
      hidden: ({parent}) => parent?.type !== 'shader',
    }),
    defineField({
      name: 'speed',
      title: 'Speed',
      type: 'number',
      initialValue: 1,
      description: 'Animation rate multiplier (scales u_time).',
      validation: (Rule) => Rule.min(0).max(10),
      hidden: ({parent}) => parent?.type !== 'shader',
    }),
    defineField({
      name: 'intensity',
      title: 'Intensity',
      type: 'number',
      initialValue: 1,
      description: 'Effect strength.',
      validation: (Rule) => Rule.min(0).max(4),
      hidden: ({parent}) => parent?.type !== 'shader',
    }),
    defineField({
      name: 'colorSource',
      title: 'Color source',
      type: 'string',
      initialValue: 'theme',
      options: {
        list: [
          {title: 'Theme accent', value: 'theme'},
          {title: 'Custom', value: 'custom'},
        ],
        layout: 'radio',
      },
      hidden: ({parent}) => parent?.type !== 'shader',
    }),
    defineField({
      name: 'customColor',
      title: 'Custom color',
      type: 'string',
      description: 'Hex color (e.g. #ff5500), used when color source is Custom.',
      validation: (Rule) =>
        Rule.regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
          name: 'hex color',
          invert: false,
        }).warning('Use a hex color like #ff5500'),
      hidden: ({parent}) => parent?.type !== 'shader' || parent?.colorSource !== 'custom',
    }),
    defineField({
      name: 'opacity',
      title: 'Opacity',
      type: 'number',
      initialValue: 1,
      description: 'Background opacity (0–1).',
      validation: (Rule) => Rule.min(0).max(1),
      hidden: ({parent}) => parent?.type !== 'shader',
    }),
  ],
})

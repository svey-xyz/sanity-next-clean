'use client'

import {type PortableTextBlock} from 'next-sanity'
import {useEffect, useRef, useState, useSyncExternalStore} from 'react'

import PortableText from '@/app/components/PortableText'
import Reveal from '@/app/components/Reveal'
import {cn} from '@/lib/utils'
import {ExtractPageBuilderType} from '@/sanity/lib/types'

type Props = {
  block: ExtractPageBuilderType<'scores'>
  index: number
  pageId: string
  pageType: string
}

type ScoreItem = NonNullable<ExtractPageBuilderType<'scores'>['items']>[number]

// Reduced-motion as a hydration-safe external store (mirrors ShaderBackground.tsx):
// server snapshot assumes motion-OK; the client snapshot reflects the live query.
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia(REDUCED_MOTION_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
function getReducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}
function getReducedMotionServerSnapshot(): boolean {
  return false
}

// SVG radial gauge geometry. viewBox is 100×100; the arc is a stroked circle whose
// dash offset animates to reveal `progress` (0–1) of the path.
const SIZE = 100
const STROKE = 9
const RADIUS = (SIZE - STROKE) / 2 // leave room for the stroke width
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const COUNT_UP_MS = 1000

/** Ease-out cubic — fast start, gentle settle, for the count-up + arc reveal. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * One radial gauge with its own rAF count-up + arc reveal, so items stagger
 * independently. Driven by `active` (parent IntersectionObserver); short-circuits
 * to the final value when `reduced` is set.
 *
 * a11y: the true value (`value` of `max`) is always in the DOM as sr-only text, so
 * AT reads the final figure, never the mid-count value. The SVG is aria-hidden.
 */
function ScoreGauge({item, i, active, reduced}: {item: ScoreItem; i: number; active: boolean; reduced: boolean}) {
  const max = item.max && item.max > 0 ? item.max : 100
  const target = Math.min(Math.max(item.value, 0), max)
  const progress = max > 0 ? target / max : 0
  const isPercent = !item.max // no explicit max → percentage-style score
  const ariaValue = isPercent ? `${target} percent` : `${target} of ${max}`

  // Eased progress 0→1, written only inside the rAF callback (never synchronously,
  // which would trip react-hooks/set-state-in-effect). Reduced / out-of-view states
  // are derived at render time, so they need no setState reset.
  const [eased, setEased] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    // Only run the loop when in-view + motion-OK; other states render statically.
    if (reduced || !active) return

    // Count up 0→1, easing out; the first frame yields ~0 so no pre-reset is needed.
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / COUNT_UP_MS, 1)
      setEased(easeOutCubic(t))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [active, reduced])

  // Values resolved at render: reduced → finals; in-view → eased fraction;
  // out-of-view → 0, so re-entry replays the count-up.
  const fraction = reduced ? 1 : active ? eased : 0
  const display = Math.round(target * fraction)
  const fill = progress * fraction

  // Dash offset: full circumference = empty, 0 = full. Animate via `fill`.
  const dashOffset = CIRCUMFERENCE * (1 - fill)

  return (
    <Reveal
      as="li"
      i={i}
      variant="scale"
      className="group/score flex flex-col items-center gap-3 text-center"
    >
      <div className="relative h-32 w-32">
        {/* Decorative gauge — the accessible value lives in the text below. */}
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-full w-full -rotate-90"
          aria-hidden="true"
          focusable="false"
        >
          {/* Track (neutral, low-emphasis). */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-border"
          />
          {/* Progress arc — `--primary` token (AAA, theme-aware). Dash offset is
              already final under reduced motion, so no stroke transition needed. */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className="stroke-primary"
          />
        </svg>
        {/* Center number — counts up (aria-hidden); the sr-only value below is what AT reads. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-2xl font-semibold tabular-nums text-foreground transition-transform duration-300 will-change-transform motion-safe:group-hover/score:scale-110"
        >
          {display}
          {isPercent && <span className="ml-0.5 text-base text-muted-foreground">%</span>}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground">
        {item.label}
        {/* Real, final numeric value, always in the DOM for screen readers. */}
        <span className="sr-only">
          {': '}
          {ariaValue}
        </span>
      </p>
    </Reveal>
  )
}

const colClass: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4',
}

/**
 * Scores — Lighthouse-style radial-progress metrics. Each arc fills 0→value with a
 * center number that counts up when the section enters the viewport, resetting on
 * exit so it replays on re-entry (IntersectionObserver on the section).
 *
 * Motion / a11y: final values are always in the DOM (sr-only per item); the arc and
 * counter are aria-hidden. Reduced motion shows finals immediately via a
 * hydration-safe store. Colors use tokens (no hex), AAA in both themes.
 */
export default function Scores({block}: Props) {
  const {heading, caption, items} = block
  const list = items ?? []

  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  )

  const sectionRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    // Reduced motion shows finals immediately; no observer needed.
    if (reduced) return
    const el = sectionRef.current
    if (!el) return

    const io = new IntersectionObserver(
      (entries) => {
        // Toggle on enter/exit so the count-up replays on re-entry.
        setActive(entries[0]?.isIntersecting ?? false)
      },
      {threshold: 0.35},
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduced])

  if (list.length === 0) return null

  const cols = Math.min(Math.max(list.length, 1), 4)

  return (
    <section ref={sectionRef} className="container my-12 lg:my-16">
      <header className="max-w-3xl">
        {heading && (
          <Reveal as="h2" className="text-2xl md:text-3xl lg:text-4xl">
            {heading}
          </Reveal>
        )}
        {caption && caption.length > 0 && (
          <Reveal i={1} className="mt-3 max-w-2xl text-lg leading-8 text-muted-foreground">
            <PortableText className="prose-sm max-w-none" value={caption as PortableTextBlock[]} />
          </Reveal>
        )}
      </header>

      <ul className={cn('mt-10 grid justify-items-center gap-8', colClass[cols])}>
        {list.map((item, i) => (
          <ScoreGauge key={item._key} item={item} i={i} active={active} reduced={reduced} />
        ))}
      </ul>
    </section>
  )
}

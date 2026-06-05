'use client'

import {useSyncExternalStore} from 'react'
import {useTheme} from '@teispace/next-themes'
import {MoonIcon, SunIcon} from '@heroicons/react/24/solid'

import {Button} from '@/components/ui/button'
import {cn} from '@/lib/utils'

/**
 * Single light↔dark theme toggle (replaces the 3-way `ModeToggle` dropdown).
 *
 * The explicit "System" option is intentionally dropped from the UI: the app
 * still resolves to the OS preference on first load via `defaultTheme="system"`
 * in `app/layout.tsx`, and this control sets an explicit `light`/`dark`
 * thereafter.
 *
 * Icon-only, so it carries an action-reflecting `aria-label` (+ `sr-only` text).
 * The Sun/Moon swap keys off the `dark` class on <html> (provider
 * `attribute="class"`); `motion-reduce:transition-none` honours reduced motion
 * per docs/A11Y.md, and the provider's `disableTransitionOnChange` suppresses the
 * color-token transition during the switch.
 */
// Hydration-safe mount flag. `useSyncExternalStore` returns the server snapshot
// (`false`) during SSR/first paint and the client snapshot (`true`) once
// hydrated, without a synchronous setState inside an effect — which the React 19
// `react-hooks/set-state-in-effect` rule (Next 16 / eslint-plugin-react-hooks v6)
// flags as cascading-render-prone. No subscription is needed; the value never
// changes after mount, so the subscribe callback is a no-op.
const noopSubscribe = () => () => {}
const getMountedSnapshot = () => true
const getServerSnapshot = () => false

export default function ThemeToggle({className}: {className?: string}) {
  const {resolvedTheme, setTheme} = useTheme()
  const mounted = useSyncExternalStore(noopSubscribe, getMountedSnapshot, getServerSnapshot)

  // Pre-mount the resolved theme is unknown (no `window` during SSR/first paint).
  // Reserve the 9×9 slot with an inert placeholder so the footer doesn't shift
  // on hydration and we never flash the wrong icon.
  if (!mounted) {
    return <div className={cn('size-5', className)} aria-hidden="true" />
  }

  const isDark = resolvedTheme === 'dark'
  const next = isDark ? 'light' : 'dark'
  const label = `Switch to ${next} mode`

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('relative cursor-pointer group', className)}
      onClick={() => setTheme(next)}
      aria-label={label}
    >
      <SunIcon
        className={cn('block dark:hidden transform rotate-0 dark:-rotate-180 duration-150 delay-100',
          'transition-[scale,rotate,transform] motion-reduce:transition-none motion-reduce:group-hover:scale-100',
          'group-hover:scale-[1.1] group-hover:-rotate-10 group-active:scale-[0.9]'
        )}
        aria-hidden="true"
      />
      <MoonIcon
        className={cn('absolute hidden dark:block transform rotate-90 dark:rotate-0 duration-150 delay-100',
          'transition-[scale,rotate,transform] motion-reduce:transition-none motion-reduce:group-hover:scale-100',
          'group-hover:scale-[1.1] group-hover:rotate-10 group-active:scale-[0.9]'
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </Button>
  )
}

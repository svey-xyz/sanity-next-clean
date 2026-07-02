'use client'

import {useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react'

import {
  defaultShaderPreset,
  isShaderPreset,
  shaderPresets,
  type ShaderPresetName,
} from './registry'

// SVE-42 hardened build (>=1.2.0): the wrapper's effect now destroys the
// Shader on unmount/args-change (Strict-Mode-safe — no more duplicate
// instances on one canvas), `setUniform` binds its program before writing
// (no more silently dropped u_time writes), and the `paused` prop pauses the
// loop in place without tearing down the WebGL context. Module scope is
// SSR-safe, so static imports are fine in this client component.
import {Shader, type ShaderArgs} from '@svey-xyz/simple-shader-component'
import {SimpleShaderCanvas} from '@svey-xyz/simple-shader-component/react'

export type ShaderBackgroundProps = {
  preset?: string | null
  speed?: number | null
  intensity?: number | null
  colorSource?: 'theme' | 'custom' | null
  customColor?: string | null
  opacity?: number | null
}

// `@svey-xyz/simple-shader-component@1.3.0` ships a broken ESM build: its core
// entry does `export {U as MethodName, F as domHandler, …}` but `U`/`F` are
// tree-shaken away and never defined, so `import {MethodName}` resolves to
// `undefined` at runtime. `MethodName.INIT` then throws on every render of this
// (dynamically-imported) client component — the rerender loop. A `declare enum`
// doesn't fix it: `declare` is type-only and emits no runtime value, so it left
// `MethodName` undefined too. Define the hook-stage selectors as a real runtime
// object; values mirror the core's `runHooks(n)` lifecycle dispatch. (`Shader`
// is exported correctly, so it can still be imported from the package.)
const MethodName = {
  TOUCH: 0,
  INIT: 1,
  LOOP: 2,
  RENDER: 3,
  RESIZE: 4,
  INPUT: 5,
} as const

/** RGB in the 0–1 range that GLSL `vec3` uniforms expect. */
type Rgb = readonly [number, number, number]

const FALLBACK_RGB: Rgb = [1, 0.33, 0] // brand-ish accent if a read fails

// --- Reduced-motion as an external store (hydration-safe, no setState-in-effect,
// matching the `useSyncExternalStore` pattern used elsewhere in this repo). The
// server snapshot is `false` (assume motion-OK during SSR; the canvas is
// client-only anyway) and the client snapshot reflects the live media query.
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

/**
 * Resolve the accent color the shader should paint with, normalized to 0–1 rgb.
 * `theme` reads the Tailwind `@theme` `--primary` HSL channel triplet off
 * `<html>` (the source of truth in `globals.css`); `custom` parses the author's
 * hex/rgb string. Done lazily on the client only — never during SSR.
 */
function readThemeRgb(): Rgb {
  if (typeof window === 'undefined') return FALLBACK_RGB
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary-accent').trim()
  const parsed = hslChannelsToRgb(raw)
  return parsed ?? FALLBACK_RGB
}

/** Parse a Tailwind/shadcn HSL channel triplet like "0 0% 9%" → 0–1 rgb. */
function hslChannelsToRgb(value: string): Rgb | null {
  if (!value) return null
  const m = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
  if (!m) return null
  const h = parseFloat(m[1])
  const s = parseFloat(m[2]) / 100
  const l = parseFloat(m[3]) / 100
  return hslToRgb(h, s, l)
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return [r + m, g + m, b + m]
}

/** Parse an author `customColor` (#rgb/#rrggbb or rgb()/named) → 0–1 rgb. */
function parseCustomColor(value: string | null | undefined): Rgb | null {
  if (!value) return null
  const v = value.trim()
  const hex = v.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ]
  }
  // Fall back to letting the browser resolve named/rgb()/hsl() colors.
  if (typeof window !== 'undefined') {
    const probe = document.createElement('span')
    probe.style.color = v
    probe.style.display = 'none'
    document.body.appendChild(probe)
    const computed = getComputedStyle(probe).color
    document.body.removeChild(probe)
    const rgb = computed.match(/(\d+)\D+(\d+)\D+(\d+)/)
    if (rgb) {
      return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255]
    }
  }
  return null
}

/**
 * `ShaderBackground` — full-bleed animated WebGL background, positioned behind
 * its `relative` parent's content. Driven by a GLSL preset from `./registry`.
 *
 * Accessibility / motion:
 *   - `aria-hidden` wrapper, `pointer-events-none`, removed from the tab order;
 *     the canvas never receives focus and is invisible to assistive tech.
 *   - Under `prefers-reduced-motion: reduce` the WebGL canvas is **not mounted**
 *     at all — a static CSS gradient using the same color renders instead.
 *
 * Performance / correctness (package >=1.2.0):
 *   - `args` is memoized on stable primitives so the wrapper doesn't tear down
 *     and recreate the Shader (rAF loop + listeners + GL context) on every
 *     parent re-render under Visual Editing. Recreation is now *safe* (the
 *     wrapper destroys the old instance), just wasteful.
 *   - Offscreen / hidden-tab → the loop is paused in place via the `paused`
 *     prop (IntersectionObserver + `visibilitychange`) without unmounting, so
 *     resuming doesn't recreate the WebGL context.
 */
export default function ShaderBackground({
  preset,
  speed,
  intensity,
  colorSource,
  customColor,
  opacity,
}: ShaderBackgroundProps) {
  const presetName: ShaderPresetName = isShaderPreset(preset) ? preset : defaultShaderPreset
  const speedValue = typeof speed === 'number' && speed > 0 ? speed : 1
  const intensityValue = typeof intensity === 'number' && intensity >= 0 ? intensity : 1
  const resolvedOpacity =
    typeof opacity === 'number' ? Math.min(Math.max(opacity, 0), 1) : 1

  const wrapperRef = useRef<HTMLDivElement>(null)

  // Live shader handle so theme-recolor can re-push u_color without re-creating
  // the Shader (which would require touching the memoized `args`).
  const shaderRef = useRef<Shader | null>(null)

  // Resolved 0–1 rgb the canvas paints with; also used by the static fallback.
  const [color, setColor] = useState<Rgb>(FALLBACK_RGB)

  // Reduced-motion gate (client-only, hydration-safe via external store). When
  // reduced, we render the static gradient and never mount the canvas.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  )

  // Visibility gate (offscreen / hidden tab) — pauses the loop when false.
  const [visible, setVisible] = useState(true)

  // Reduced motion swaps the canvas for the static gradient entirely (no GL
  // context at all); plain offscreen/hidden just pauses in place.
  const mountCanvas = !reducedMotion

  // --- Resolve + track the paint color (theme var or custom string) ---
  useEffect(() => {
    const update = () => {
      if (colorSource === 'custom') {
        setColor(parseCustomColor(customColor) ?? FALLBACK_RGB)
      } else {
        setColor(readThemeRgb())
      }
    }
    update()

    if (colorSource === 'custom') return

    // Theme toggle flips a class on <html> (next-themes attribute="class"); a
    // MutationObserver re-reads the accent var so the shader recolors live.
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [colorSource, customColor])

  // Mirror of `color` for the stable INIT hook below: when the wrapper
  // (re)creates the Shader (mount, `args` change), the hook reads the freshest
  // resolved color from this ref without `args` having to depend on `color`.
  const colorRef = useRef<Rgb>(color)

  // Push the latest color into the live shader without rebuilding `args` (so the
  // Shader is never re-instantiated on recolor). Also re-fires when the canvas
  // (re)mounts — `SimpleShaderCanvas` is a child, so its effect creates the
  // Shader (and INIT captures `shaderRef`) before this parent effect runs.
  useEffect(() => {
    colorRef.current = color
    if (!mountCanvas) return
    shaderRef.current?.setUniform({name: 'u_bgColour', type: 'vec3', value: [...color]})
  }, [color, mountCanvas])

  // --- Offscreen / hidden-tab visibility gate (drives the `paused` prop) ---
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    let onScreen = true
    const computeVisible = () => setVisible(onScreen && !document.hidden)

    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0]?.isIntersecting ?? true
        computeVisible()
      },
      {rootMargin: '128px'},
    )
    io.observe(el)

    const onVisibility = () => computeVisible()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // --- Memoized ShaderArgs ---
  // Keyed ONLY on stable primitives (preset / speed / intensity). The color is
  // NOT baked in here — it's pushed via the `setUniform` effect above — so a
  // recolor never changes `args`' identity. Since 1.2.0 an identity change is
  // handled safely (the wrapper destroys the old instance before creating a
  // new one), but it still tears down the WebGL context — avoid per-render churn.
  // Per-instance noise seed so multiple backgrounds on one page don't render
  // identical patterns. useState's lazy initializer runs exactly once per
  // mount — a deliberate one-time random, never re-derived on re-render.
  const [posSeed] = useState(
    () => new Float32Array([Math.random() * 1000, Math.random() * 1000]),
  )

  const args = useMemo<ShaderArgs>(() => {
    const def = shaderPresets[presetName]
    return {
      vertShader: def.vert,
      fragShader: def.frag,
      // Inert defaults so the program links and renders before the first
      // hook/effect fires. `u_bgColour` is deliberately ABSENT: init() applies
      // these defaults *after* INIT hooks run, so a default here would clobber
      // the color the INIT hook pushes. The color flows only through the INIT
      // hook (creation) + the recolor effect (theme/custom changes).
      uniforms: [
				{ name: 'u_time', type: 'float', value: 0.0 },
				{ name: 'u_posSeed', type: 'vec2', value: posSeed },
      ],
      hooks: [
        {
          // Capture the live instance for the recolor effect and seed the
          // DOM-resolved color. Reads `colorRef` (not `color`) so this closure
          // stays identity-stable while always pushing the freshest value.
          methodName: MethodName.INIT,
          hook: (shader: Shader) => {
            shaderRef.current = shader
            shader.setUniform({
              name: 'u_bgColour',
              type: 'vec3',
              value: [...colorRef.current],
            })
          },
        },
        {
          // Drive time every frame; `speedValue` scales the rate.
          methodName: MethodName.LOOP,
          hook: (shader: Shader) => {
            shader.setUniform({
              name: 'u_time',
              type: 'float',
              value: shader.getElapsedTime() * speedValue,
            })
          },
        }
      ],
    }
    // `intensityValue` is intentionally NOT consumed yet (no current preset
    // declares u_intensity); add it back to args + deps when a preset uses it.
  }, [presetName, speedValue, posSeed])

  // Static gradient (reduced motion, or pre-canvas paint). Uses the resolved
  // color so the fallback matches the animated version's hue.
  const [r, g, b] = color
  const cssColor = `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`
  const gradient = `radial-gradient(120% 120% at 30% 20%, ${cssColor} 0%, transparent 55%), radial-gradient(100% 100% at 80% 80%, ${cssColor} 0%, transparent 50%)`

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-hidden"
      style={{opacity: resolvedOpacity}}
    >
      {mountCanvas ? (
        <SimpleShaderCanvas
          args={args}
          paused={!visible}
          className="absolute inset-0 block h-full w-full min-h-full min-w-full"
        />
      ) : (
        // Static CSS gradient fallback — reduced motion or offscreen.
        <div
					className="absolute inset-0 block h-full w-full min-h-full min-w-full"
          style={{backgroundImage: gradient, opacity: 0.6}}
        />
      )}
    </div>
  )
}

/**
 * GLSL preset registry for `ShaderBackground`.
 *
 * Each preset is a self-contained **WebGL1 / GLSL ES 1.00** program: a vertex
 * shader that forwards the hardcoded full-screen-quad attribute `a_position`
 * (vec2, clip space) plus a fragment shader that paints using a small set of
 * driver uniforms fed by `ShaderBackground`:
 *
 *   - `u_time`       (float)  elapsed seconds * speed   — LOOP hook
 *   - `u_resolution` (vec2)   canvas pixel size         — INIT + RESIZE hooks
 *   - `u_color`      (vec3)   theme/custom accent, 0–1  — pushed by the component
 *   - `u_intensity`  (float)  effect strength multiplier
 *
 * `@svey-xyz/simple-shader-component@1.1.1` runs on `getContext("webgl")` (no
 * `webgl2`), so shaders MUST stay GLSL ES 1.00: `attribute`/`varying`, a
 * `precision` qualifier in the fragment stage, and `gl_FragColor` output. The
 * geometry is a hardcoded quad drawn as two triangles, so `a_position` already
 * spans the viewport in clip space — we map it to UV in the fragment shader.
 *
 * Keep presets GPU-cheap (a handful of noise octaves, no loops over textures).
 * Add new presets by extending `shaderPresets` with another `{vert, frag,
 * uniforms}` entry keyed by name, then surfacing the key in the Studio
 * `background.preset` list.
 */

export type ShaderPresetUniform = {
  name: string
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'int'
  /** Default value used until the component overrides it (e.g. u_color, u_time). */
  value: number | number[] | Float32Array
}

export type ShaderPreset = {
  vert: string
  frag: string
  /** Static defaults; the component appends/overrides u_time, u_resolution, u_color, u_intensity. */
  uniforms: ShaderPresetUniform[]
}

/**
 * Shared vertex shader — the geometry is a fixed full-screen quad, so every
 * preset just passes the clip-space position straight through and hands the
 * fragment stage a 0–1 UV (`v_uv`) derived from it.
 */
const fullScreenVert = /* glsl */ `
  attribute vec3 a_position;

	void main() {
		gl_Position = vec4(a_position, 1.0);
	}
`

/**
 * Preset #1 — "gradient": a slow, unbranded flowing gradient driven by two
 * octaves of classic 2D Perlin noise (Ashima/McGuire-style, public-domain
 * implementation) drifting over time. Paints the theme/custom accent over a
 * transparent base — a deliberately generic placeholder for template
 * consumers to replace with their own presets. Cheap: 2 noise evals per
 * fragment.
 */
const gradientFrag = /* glsl */ `
	precision mediump float;
	uniform float u_time;
	uniform vec2 u_posSeed;
	uniform vec3 u_bgColour;

	vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }

	vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }

	vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

	vec2 fade(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

	float cnoise(vec2 P) {
			vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
			vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
			Pi = mod289(Pi);
			vec4 ix = Pi.xzxz;
			vec4 iy = Pi.yyww;
			vec4 fx = Pf.xzxz;
			vec4 fy = Pf.yyww;

			vec4 i = permute(permute(ix) + iy);

			vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
			vec4 gy = abs(gx) - 0.5;
			vec4 tx = floor(gx + 0.5);
			gx = gx - tx;

			vec2 g00 = vec2(gx.x, gy.x);
			vec2 g10 = vec2(gx.y, gy.y);
			vec2 g01 = vec2(gx.z, gy.z);
			vec2 g11 = vec2(gx.w, gy.w);

			vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
			g00 *= norm.x;
			g01 *= norm.y;
			g10 *= norm.z;
			g11 *= norm.w;

			float n00 = dot(g00, vec2(fx.x, fy.x));
			float n10 = dot(g10, vec2(fx.y, fy.y));
			float n01 = dot(g01, vec2(fx.z, fy.z));
			float n11 = dot(g11, vec2(fx.w, fy.w));

			vec2 fade_xy = fade(Pf.xy);
			vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
			float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
			return 2.2 * n_xy;
	}

	void main() {
		vec2 p = (gl_FragCoord.xy + u_posSeed.xy) * 0.0009;
		float t = u_time * 0.03;

		float n = cnoise(p + vec2(t, -t * 0.7));
		n += 0.5 * cnoise(p * 2.1 - vec2(t * 0.6, t));

		// Map the noise to a soft coverage ramp of the accent colour.
		float v = smoothstep(-1.2, 1.4, n);
		float a = mix(0.15, 0.85, v);

		// The canvas context is premultiplied-alpha (WebGL default), so RGB must
		// be multiplied by A here. Straight alpha gets composited as
		// rgb + (1-a)*page — washing toward white on light themes and collapsing
		// every layer to full-strength colour on dark ones.
		gl_FragColor = vec4(u_bgColour * a, a);
	}
`

export const shaderPresets = {
  gradient: {
    vert: fullScreenVert,
    frag: gradientFrag,
    // Component-driven uniforms (u_time, u_resolution, u_color, u_intensity) are
    // appended by ShaderBackground; these are inert defaults so the program
    // links and renders something sane before the first hook fires.
    uniforms: [
			{ name: 'u_time', type: 'float', value: 0.0 },
			{ name: 'u_posSeed', type: 'vec2', value: new Float32Array([Math.random() * 1000, Math.random() * 1000]) },
			{ name: 'u_bgColour', type: 'vec3', value: new Float32Array([0.329, 0.208, 0.4]) },
    ],
  },
} satisfies Record<string, ShaderPreset>

export type ShaderPresetName = keyof typeof shaderPresets

export const defaultShaderPreset: ShaderPresetName = 'gradient'

/** Narrowing helper so callers can validate an author-supplied preset string. */
export function isShaderPreset(name: string | undefined | null): name is ShaderPresetName {
  return !!name && Object.prototype.hasOwnProperty.call(shaderPresets, name)
}

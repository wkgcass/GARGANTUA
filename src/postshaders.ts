/**
 * Post-processing shaders: HDR bloom (bright-pass + gaussian blur) and final
 * composite (ACES tone mapping, chromatic aberration, vignette, film grain).
 */

/* ---------------- bright pass + blur ---------------- */
export const BRIGHT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
uniform sampler2D uTex;
uniform float uThreshold;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  c = max(c - uThreshold, 0.0);
  /* soft knee */
  c = c / (1.0 + c);
  outColor = vec4(c, 1.0);
}
`;

export const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
uniform sampler2D uTex;
uniform vec2  uDir;      /* (1/w,0) or (0,1/h) */
uniform float uRadius;   /* texel spread   */
void main() {
  vec2 uv = vUv;
  vec2 o = uDir * uRadius;
  vec3 s = texture(uTex, uv).rgb * 0.227027;
  s += texture(uTex, uv + o * 1.384615).rgb * 0.316216;
  s += texture(uTex, uv - o * 1.384615).rgb * 0.316216;
  s += texture(uTex, uv + o * 3.230769).rgb * 0.070270;
  s += texture(uTex, uv - o * 3.230769).rgb * 0.070270;
  outColor = vec4(s, 1.0);
}
`;

/* ---------------- final composite ---------------- */
export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

uniform sampler2D uScene;   /* HDR raytrace  */
uniform sampler2D uBloom;   /* blurred bloom */
uniform float uExposure;
uniform float uBloomAmt;
uniform float uCAAmount;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uGradK;       /* keep-out radius of grading (unused) */
uniform int   uDebugView;

/* ACES filmic (Narkowicz) */
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  vec3 sceneColEarly = texture(uScene, uv).rgb;
  float luminanceEarly = dot(sceneColEarly, vec3(0.2126, 0.7152, 0.0722));

  /* chromatic aberration: per-channel radial offsets in HDR space */
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  vec3 col;
  if (uDebugView == 9) {
    /* debug: chromatic aberration disabled */
    col = texture(uScene, uv).rgb;
  } else {
    vec2 off = c * (uCAAmount * (0.7 + r2 * 2.2));
    col.r = texture(uScene, uv + off).r;
    col.g = texture(uScene, uv).g;
    col.b = texture(uScene, uv - off).b;
  }

  /* HDR bloom */
  vec3 bloom = texture(uBloom, uv).rgb;
  col += bloom * uBloomAmt;

  /* exposure + ACES */
  col *= uExposure;
  col = aces(col);

  /* vignette */
  float vig = 1.0 - uVignette * smoothstep(0.35, 0.95, length(c) * 1.35);
  col *= vig;

  /* film grain (subtle, proportional to luminance so shadows stay clean) */
  if (uGrain > 0.001) {
    float g = (hash12(uv * vec2(1920.0, 1080.0) + fract(uTime) * 437.58) - 0.5) * uGrain;
    col += g * (0.25 + 0.75 * luminanceEarly);
  }

  /* gamma */
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  outColor = vec4(col, 1.0);
}
`;
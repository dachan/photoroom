// GLSL ES 3.00 shaders for the develop pipeline. Kept as strings so the WebGL2
// renderer can compile them; a WebGPU backend would port these to WGSL.

// Fullscreen triangle; no attributes needed (gl_VertexID trick).
export const VERTEX_SRC = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 pos = vec2(
    (gl_VertexID == 1) ? 3.0 : -1.0,
    (gl_VertexID == 2) ? 3.0 : -1.0
  );
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

// Ingest pass: read the 16-bit integer source texture, normalize to linear
// float 0..1, write into a filterable RGBA16F texture.
export const INGEST_FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
in vec2 vUv;
out vec4 outColor;
uniform usampler2D uSource;
void main() {
  uvec4 raw = texture(uSource, vUv);
  vec3 linear = vec3(raw.rgb) / 65535.0;
  outColor = vec4(linear, 1.0);
}
`;

// Develop pass: lens correction (geometric + vignette) in linear light, then
// exposure / white balance, sRGB encode, then contrast / saturation / vibrance
// in display space.
export const DEVELOP_FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uImage;
uniform float uExposure;   // stops
uniform float uContrast;   // -1..1
uniform vec3  uWbGain;     // per-channel linear multiplier
uniform float uSaturation; // -1..1
uniform float uVibrance;   // -1..1
uniform float uAspect;     // width / height

// Manual (Brown-model) lens correction.
uniform int   uLensMode; // 0 = off, 1 = manual, 2 = embedded spline
uniform float uK1;
uniform float uK2;
uniform float uVignette;

// Embedded (in-camera) correction: per-knot factors over rn in [0,1].
uniform int   uNc;
uniform float uDistFactor[16];
uniform float uCaRFactor[16];
uniform float uCaBFactor[16];
uniform float uVigGain[16];
uniform float uDistScale;

// Flip vertically for on-screen preview (canvas display origin differs from the
// GL framebuffer); export reads pixels directly and must not be flipped.
uniform int   uFlipY;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// Linear interpolation across evenly-spaced knots indexed by normalized radius.
float interpKnots(float knots[16], int nc, float rn) {
  float x = clamp(rn, 0.0, 1.0) * float(nc - 1);
  int i = int(floor(x));
  if (i > nc - 2) i = nc - 2;
  if (i < 0) i = 0;
  float t = x - float(i);
  return mix(knots[i], knots[i + 1], t);
}

// Map a normalized-radius point to a source UV given a radial magnification.
vec2 sourceUv(vec2 pn, float maxR, float factor) {
  vec2 srcP = pn * factor * maxR;
  srcP.x /= uAspect;
  return srcP + 0.5;
}

void main() {
  vec2 uv = vUv;
  if (uFlipY == 1) uv.y = 1.0 - uv.y;
  float vignetteGain = 1.0;

  // Radial coordinate normalized so the corner sits at radius ~1.
  vec2 p = (uv - 0.5);
  p.x *= uAspect;
  float maxR = length(vec2(0.5 * uAspect, 0.5));
  vec2 pn = p / maxR;
  float r2 = dot(pn, pn);
  float rn = sqrt(r2);

  vec3 c;

  if (uLensMode == 2) {
    // Embedded per-channel correction: distortion (+ CA) and vignetting.
    float gG = interpKnots(uDistFactor, uNc, rn) * uDistScale;
    float gR = gG * interpKnots(uCaRFactor, uNc, rn);
    float gB = gG * interpKnots(uCaBFactor, uNc, rn);
    vec2 uvR = sourceUv(pn, maxR, gR);
    vec2 uvG = sourceUv(pn, maxR, gG);
    vec2 uvB = sourceUv(pn, maxR, gB);
    c = vec3(texture(uImage, uvR).r, texture(uImage, uvG).g, texture(uImage, uvB).b);
    vignetteGain = interpKnots(uVigGain, uNc, rn);
  } else {
    if (uLensMode == 1) {
      float factor = 1.0 + uK1 * r2 + uK2 * r2 * r2;
      uv = sourceUv(pn, maxR, factor);
      vignetteGain = 1.0 + uVignette * r2;
    }
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      outColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    c = texture(uImage, uv).rgb; // linear
  }

  // Linear-light adjustments.
  c *= exp2(uExposure);
  c *= uWbGain;
  c *= vignetteGain;

  // To display space.
  c = linearToSrgb(c);

  // Contrast around mid-gray.
  c = (c - 0.5) * (1.0 + uContrast) + 0.5;

  // Saturation + vibrance.
  float luma = dot(c, LUMA);
  float sat = uSaturation;
  // Vibrance boosts less-saturated pixels more.
  float pixSat = length(c - vec3(luma));
  sat += uVibrance * (1.0 - clamp(pixSat * 2.0, 0.0, 1.0));
  c = mix(vec3(luma), c, 1.0 + sat);

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

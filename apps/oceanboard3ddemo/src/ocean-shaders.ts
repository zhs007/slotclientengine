export const skyVertexShader = /* glsl */ `
varying vec3 vDirection;

void main() {
  vDirection = normalize(position);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const skyFragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDirection;
varying vec3 vDirection;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 345.45));
  point += dot(point, point + 34.345);
  return fract(point.x * point.y);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.54;
  for (int octave = 0; octave < 4; octave += 1) {
    value += valueNoise(point) * amplitude;
    point = point * 2.07 + vec2(7.1, 3.7);
    amplitude *= 0.48;
  }
  return value;
}

void main() {
  vec3 direction = normalize(vDirection);
  float altitude = clamp(direction.y, 0.0, 1.0);
  float skyMix = pow(altitude, 0.55);
  vec3 horizon = vec3(0.035, 0.36, 0.67);
  vec3 zenith = vec3(0.003, 0.105, 0.43);
  vec3 color = mix(horizon, zenith, skyMix);

  float sunAlignment = max(dot(direction, uSunDirection), 0.0);
  float sunGlow = pow(sunAlignment, 22.0);
  float sunCore = pow(sunAlignment, 1300.0);
  color += vec3(0.64, 0.9, 1.0) * sunGlow * 0.2;
  color += vec3(1.0, 0.98, 0.82) * sunCore * 1.15;

  float longitude = atan(direction.x, -direction.z) / 6.2831853 + 0.5;
  vec2 cloudUv = vec2(longitude * 9.0, direction.y * 19.0);
  float cloudField = fbm(cloudUv + vec2(uTime * 0.003, 0.0));
  float cloudBand = smoothstep(0.012, 0.055, direction.y) *
    (1.0 - smoothstep(0.12, 0.29, direction.y));
  float clouds = smoothstep(0.59, 0.77, cloudField) * cloudBand;
  float cloudShade = smoothstep(0.58, 0.84, fbm(cloudUv * 1.4 + 8.3));
  vec3 cloudColor = mix(vec3(0.68, 0.84, 0.9), vec3(1.0), cloudShade);
  color = mix(color, cloudColor, clouds * 0.14);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const oceanVertexShader = /* glsl */ `
uniform float uTime;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vWaveHeight;

void accumulateWave(
  vec2 point,
  vec2 direction,
  float amplitude,
  float frequency,
  float speed,
  inout float height,
  inout vec2 slope
) {
  vec2 waveDirection = normalize(direction);
  float phase = dot(point, waveDirection) * frequency + uTime * speed;
  height += sin(phase) * amplitude;
  slope += waveDirection * cos(phase) * amplitude * frequency;
}

void main() {
  vec2 point = position.xy;
  float height = 0.0;
  vec2 slope = vec2(0.0);
  accumulateWave(point, vec2(1.0, 0.28), 0.34, 0.19, 0.66, height, slope);
  accumulateWave(point, vec2(-0.34, 1.0), 0.2, 0.37, 0.88, height, slope);
  accumulateWave(point, vec2(0.72, 0.69), 0.105, 0.72, 1.12, height, slope);
  accumulateWave(point, vec2(-0.9, 0.43), 0.055, 1.28, 1.58, height, slope);

  vec3 displaced = vec3(position.xy, position.z + height);
  vec3 localNormal = normalize(vec3(-slope.x, -slope.y, 1.0));
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
  vWaveHeight = height;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const oceanFragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uDeepColor;
uniform vec3 uMidColor;
uniform vec3 uShallowColor;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vWaveHeight;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

vec3 sampleSky(vec3 direction) {
  float altitude = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 horizon = vec3(0.22, 0.69, 0.88);
  vec3 zenith = vec3(0.008, 0.22, 0.58);
  return mix(horizon, zenith, pow(altitude, 0.72));
}

void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float distanceToCamera = length(cameraPosition - vWorldPosition);
  float detailFade = 1.0 - smoothstep(80.0, 420.0, distanceToCamera);

  vec2 point = vWorldPosition.xz;
  vec2 domainWarp = vec2(
    sin(dot(point, vec2(0.105, 0.173)) + uTime * 0.27),
    cos(dot(point, vec2(-0.147, 0.091)) - uTime * 0.21)
  ) * 0.62;
  vec2 warpedPoint = point + domainWarp;
  vec2 detailSlope = vec2(0.0);
  detailSlope += normalize(vec2(0.93, 0.37)) *
    cos(dot(warpedPoint, normalize(vec2(0.93, 0.37))) * 2.15 + uTime * 1.85) * 0.11;
  detailSlope += normalize(vec2(-0.42, 0.91)) *
    cos(dot(warpedPoint, normalize(vec2(-0.42, 0.91))) * 3.8 - uTime * 2.35) * 0.07;
  detailSlope += normalize(vec2(0.65, 0.76)) *
    cos(dot(warpedPoint, normalize(vec2(0.65, 0.76))) * 6.7 + uTime * 2.9) * 0.035;
  vec3 normal = normalize(vWorldNormal + vec3(detailSlope.x, 0.0, detailSlope.y) * detailFade);

  float viewFacing = max(dot(normal, viewDirection), 0.0);
  float fresnel = 0.055 + 0.945 * pow(1.0 - viewFacing, 3.25);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  vec3 reflectedSky = sampleSky(reflectionDirection);

  float depthMix = smoothstep(18.0, 330.0, distanceToCamera);
  vec3 bodyColor = mix(uShallowColor, uMidColor, smoothstep(8.0, 90.0, distanceToCamera));
  bodyColor = mix(bodyColor, uDeepColor, depthMix * 0.82);
  vec3 color = mix(bodyColor, reflectedSky, 0.08 + fresnel * 0.38);
  float slopeEnergy = clamp(length(detailSlope) * 3.2, 0.0, 1.0) * detailFade;
  color = mix(color, reflectedSky, slopeEnergy * 0.075);

  float crest = smoothstep(0.19, 0.5, vWaveHeight) * detailFade;
  color += vec3(0.08, 0.48, 0.62) * crest * 0.2;

  float sunAlignment = max(dot(reflectionDirection, uSunDirection), 0.0);
  float broadGlint = pow(sunAlignment, 22.0);
  float sharpGlint = pow(sunAlignment, 180.0);
  float pathWidth = mix(22.0, 3.2, smoothstep(20.0, 480.0, distanceToCamera));
  float sunPath = exp(-pow(abs(vWorldPosition.x) / pathWidth, 1.45));
  sunPath *= smoothstep(18.0, 62.0, distanceToCamera) *
    (1.0 - smoothstep(410.0, 610.0, distanceToCamera));
  float sparkle = pow(sunAlignment, 420.0);
  vec3 sunColor = vec3(1.0, 0.94, 0.7);
  color += sunColor * sunPath *
    (broadGlint * 0.13 + sharpGlint * 0.52 + sparkle * 1.05);

  float horizonFade = smoothstep(390.0, 610.0, distanceToCamera);
  color = mix(color, vec3(0.16, 0.6, 0.79), horizonFade * 0.72);
  float microVariation = hash21(gl_FragCoord.xy + floor(uTime * 10.0)) - 0.5;
  color += microVariation * 0.008;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

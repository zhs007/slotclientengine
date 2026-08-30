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
  color = mix(color, cloudColor, clouds * 0.32);

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
  accumulateWave(point, vec2(1.0, 0.28), 0.25, 0.17, 0.58, height, slope);
  accumulateWave(point, vec2(-0.34, 1.0), 0.15, 0.34, 0.81, height, slope);
  accumulateWave(point, vec2(0.72, 0.69), 0.09, 0.66, 1.08, height, slope);
  accumulateWave(point, vec2(-0.9, 0.43), 0.045, 1.18, 1.47, height, slope);
  accumulateWave(point, vec2(0.23, 0.97), 0.022, 1.95, 1.91, height, slope);

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
uniform sampler2D uUnderwaterTexture;
uniform sampler2D uWaterHeight;
uniform float uWaterHeightMix;
uniform vec2 uResolution;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vWaveHeight;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

float smootherStep(float edge0, float edge1, float value) {
  float amount = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
  return amount * amount * amount *
    (amount * (amount * 6.0 - 15.0) + 10.0);
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
  vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  float detailFade = 1.0 - smoothstep(360.0, 650.0, distanceToCamera);
  float screenDetail = smootherStep(0.24, 0.78, screenUv.y);
  float farDetailFade = 1.0 - smoothstep(520.0, 680.0, distanceToCamera);

  vec2 point = vWorldPosition.xz;
  mat2 rotateA = mat2(0.94, -0.34, 0.34, 0.94);
  mat2 rotateB = mat2(0.68, 0.73, -0.73, 0.68);
  vec2 heightUvA = rotateA * point * 0.04 +
    vec2(uTime * 0.008, -uTime * 0.005);
  vec2 heightUvB = rotateB * point * 0.092 +
    vec2(-uTime * 0.012, uTime * 0.007);
  float heightA = texture2D(uWaterHeight, heightUvA).r;
  float heightAx = texture2D(uWaterHeight, heightUvA + vec2(0.0028, 0.0)).r;
  float heightAy = texture2D(uWaterHeight, heightUvA + vec2(0.0, 0.0028)).r;
  float heightB = texture2D(uWaterHeight, heightUvB).r;
  float heightBx = texture2D(uWaterHeight, heightUvB + vec2(0.0022, 0.0)).r;
  float heightBy = texture2D(uWaterHeight, heightUvB + vec2(0.0, 0.0022)).r;
  vec2 slopeA = vec2(heightA - heightAx, heightA - heightAy);
  vec2 slopeB = vec2(heightB - heightBx, heightB - heightBy);
  vec2 mappedSlope = slopeA * 1.55 + slopeB * 0.78;
  vec2 proceduralSlope = vec2(
    sin(dot(point, vec2(0.81, 0.59)) * 2.2 + uTime * 1.7),
    cos(dot(point, vec2(-0.47, 0.88)) * 2.7 - uTime * 1.9)
  ) * 0.025;
  float textureNormalMix = uWaterHeightMix * mix(0.08, 1.0, screenDetail) * farDetailFade;
  vec2 detailSlope = mix(proceduralSlope, mappedSlope, textureNormalMix);
  vec3 normal = normalize(vWorldNormal + vec3(detailSlope.x, 0.0, detailSlope.y) * detailFade);

  float viewFacing = max(dot(normal, viewDirection), 0.0);
  float fresnel = 0.025 + 0.975 * pow(1.0 - viewFacing, 4.5);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  vec3 reflectedSky = sampleSky(reflectionDirection);
  float lateralRatio = abs(vWorldPosition.x) / max(distanceToCamera, 1.0);
  float farSideMask = smoothstep(120.0, 360.0, distanceToCamera) *
    smoothstep(0.1, 0.42, lateralRatio);
  reflectedSky = mix(
    reflectedSky,
    vec3(0.025, 0.31, 0.49),
    farSideMask * 0.72
  );

  float depthMix = smoothstep(18.0, 330.0, distanceToCamera);
  vec3 bodyColor = mix(uShallowColor, uMidColor, smoothstep(8.0, 90.0, distanceToCamera));
  bodyColor = mix(bodyColor, uDeepColor, depthMix * 0.82);
  float refractionFade = 1.0 - smoothstep(90.0, 420.0, distanceToCamera);
  vec2 refractionOffset = normal.xz * 0.0065 * refractionFade * (1.0 - fresnel);
  vec3 refractedUnderwater = texture2D(
    uUnderwaterTexture,
    clamp(screenUv + refractionOffset, vec2(0.002), vec2(0.998))
  ).rgb;
  float absorption = 0.1 + depthMix * 0.72;
  vec3 transmittedWater = mix(refractedUnderwater, bodyColor, absorption);
  float reflectionMix = clamp(
    0.035 + fresnel * 0.48 + smoothstep(150.0, 460.0, distanceToCamera) * 0.22,
    0.0,
    0.9
  );
  reflectionMix *= mix(0.5, 1.0, smootherStep(0.24, 0.74, screenUv.y));
  vec3 color = mix(transmittedWater, reflectedSky, reflectionMix);
  float slopeEnergy = clamp(length(detailSlope) * 3.2, 0.0, 1.0) * detailFade;
  color = mix(color, reflectedSky, slopeEnergy * 0.055);

  float crest = smoothstep(0.19, 0.5, vWaveHeight) * detailFade;
  color += vec3(0.08, 0.48, 0.62) * crest * 0.2;

  float sunAlignment = max(dot(reflectionDirection, uSunDirection), 0.0);
  float broadGlint = pow(sunAlignment, 34.0);
  vec2 glitterUv = heightUvB * 1.71 + vec2(uTime * 0.018, -uTime * 0.011);
  float glitterField = texture2D(uWaterHeight, glitterUv).r;
  float sharpGlint = pow(sunAlignment, mix(125.0, 480.0, glitterField));
  float fragmentedGlitter = smoothstep(0.58, 0.88, glitterField);
  float glintDistance = smootherStep(0.34, 0.76, screenUv.y) *
    (1.0 - smoothstep(540.0, 680.0, distanceToCamera));
  vec3 sunColor = vec3(1.0, 0.94, 0.7);
  color += sunColor * glintDistance *
    (broadGlint * 0.14 + sharpGlint * (0.18 + fragmentedGlitter * 0.82) * 1.08);

  float horizonFade = smoothstep(390.0, 610.0, distanceToCamera);
  color = mix(color, vec3(0.045, 0.4, 0.59), horizonFade * 0.46);
  float microVariation = hash21(gl_FragCoord.xy + floor(uTime * 10.0)) - 0.5;
  color += microVariation * 0.008;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const seabedVertexShader = /* glsl */ `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const seabedFragmentShader = /* glsl */ `
uniform float uTime;
uniform sampler2D uCausticTexture;
uniform float uCausticTextureMix;
varying vec3 vWorldPosition;

void main() {
  vec2 point = vWorldPosition.xz;
  mat2 rotateA = mat2(0.88, -0.48, 0.48, 0.88);
  mat2 rotateB = mat2(0.59, 0.81, -0.81, 0.59);
  vec2 uvA = rotateA * point * 0.095 +
    vec2(uTime * 0.016, -uTime * 0.011);
  vec2 uvB = rotateB * point * 0.16 +
    vec2(-uTime * 0.021, uTime * 0.013);
  float fieldA = texture2D(uCausticTexture, uvA).r;
  float fieldB = texture2D(uCausticTexture, uvB).r;
  float ridgeA = smoothstep(0.28, 0.82, fieldA);
  float ridgeB = smoothstep(0.32, 0.86, fieldB);
  float caustic = clamp(
    ridgeA * mix(0.12, 1.0, ridgeB) + ridgeB * 0.1,
    0.0,
    1.0
  ) * uCausticTextureMix;

  float distanceToCamera = length(cameraPosition - vWorldPosition);
  float visibility = 1.0 - smoothstep(58.0, 275.0, distanceToCamera);
  float broadVariation = mix(0.92, 1.04, fieldA);
  vec3 shallowBed = vec3(0.012, 0.285, 0.32);
  vec3 deepBed = vec3(0.003, 0.06, 0.12);
  vec3 color = mix(shallowBed, deepBed, smoothstep(28.0, 285.0, distanceToCamera));
  color *= broadVariation;
  color += vec3(0.22, 0.82, 0.7) * caustic * visibility * 0.78;

  gl_FragColor = vec4(color, 1.0);
}
`;

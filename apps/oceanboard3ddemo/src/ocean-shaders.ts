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
uniform sampler2D uCloudTexture;
uniform float uCloudTextureMix;
uniform sampler2D uSmallCloudTexture;
uniform float uSmallCloudTextureMix;
uniform sampler2D uSkySunlight;
uniform float uSkySunlightMix;
uniform vec2 uResolution;
varying vec3 vDirection;

float sampleSunlightLayer(vec2 uv, float rotation, float scale) {
  vec2 pivot = vec2(0.5, 0.015);
  vec2 localUv = uv - pivot;
  localUv /= scale;
  float sine = sin(rotation);
  float cosine = cos(rotation);
  localUv = mat2(cosine, -sine, sine, cosine) * localUv;
  vec2 layerUv = clamp(localUv + pivot, vec2(0.002), vec2(0.998));
  return texture2D(uSkySunlight, layerUv).r;
}

void main() {
  vec3 direction = normalize(vDirection);
  float altitude = clamp(direction.y, 0.0, 1.0);
  float skyMix = pow(altitude, 0.32);
  vec3 horizon = vec3(0.008, 0.34, 0.69);
  vec3 zenith = vec3(0.001, 0.045, 0.31);
  vec3 color = mix(horizon, zenith, skyMix);
  float horizonHaze = 1.0 - smoothstep(0.0, 0.115, altitude);
  color = mix(color, vec3(0.1, 0.61, 0.82), horizonHaze * 0.42);

  float sunAlignment = max(dot(direction, uSunDirection), 0.0);
  float sunHaze = pow(sunAlignment, 10.0);
  color += vec3(0.25, 0.72, 1.0) * sunHaze * 0.12;

  vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  float topCoordinate = 1.0 - screenUv.y;
  vec2 sunlightUv = vec2(screenUv.x, clamp(topCoordinate / 0.205, 0.0, 1.0));
  float skyRegion = 1.0 - smoothstep(0.195, 0.215, topCoordinate);
  float layerARotation = sin(uTime * 0.45) * 0.12;
  float layerBRotation = sin(uTime * 0.32 + 2.1) * -0.16;
  float layerAScale = 1.055 + sin(uTime * 0.24 + 0.7) * 0.035;
  float layerBScale = 0.955 + cos(uTime * 0.18 + 1.8) * 0.028;
  float sunlightBase = pow(sampleSunlightLayer(sunlightUv, 0.0, 1.0), 1.12);
  float sunlightLayerA = pow(
    sampleSunlightLayer(sunlightUv, layerARotation, layerAScale),
    1.28
  );
  float sunlightLayerB = pow(
    sampleSunlightLayer(sunlightUv, layerBRotation, layerBScale),
    1.38
  );
  float skySunlight = clamp(
    sunlightBase * 0.46 + sunlightLayerA * 0.38 + sunlightLayerB * 0.3,
    0.0,
    1.08
  ) * uSkySunlightMix * skyRegion;
  float sunlightBreath = 0.975 + sin(uTime * 0.3) * 0.025;
  color += vec3(0.86, 0.97, 1.0) * skySunlight * sunlightBreath * 0.82;

  float cloudAzimuth = atan(direction.x, -direction.z);
  float cloudElevation = asin(clamp(direction.y, -1.0, 1.0));
  vec2 cloudUv = vec2(
    cloudAzimuth / 0.64 + 0.5,
    0.79 - cloudElevation / 0.32
  );
  vec4 cloudSample = texture2D(uCloudTexture, cloudUv);
  float cloudFrame =
    smoothstep(0.015, 0.055, cloudUv.x) *
    (1.0 - smoothstep(0.945, 0.985, cloudUv.x));
  float cloudAltitudeMask =
    smoothstep(0.005, 0.035, direction.y) *
    (1.0 - smoothstep(0.34, 0.5, direction.y));
  float cloudAlpha =
    cloudSample.a * cloudFrame * cloudAltitudeMask * uCloudTextureMix;
  vec3 cloudColor = cloudSample.rgb;
  cloudColor += vec3(0.16, 0.11, 0.025) * sunHaze * cloudAlpha;
  color = mix(color, cloudColor, cloudAlpha);

  float smallCloudDrift = sin(uTime * 0.025) * 0.075;
  vec2 smallCloudUv = vec2(
    cloudAzimuth / 0.64 + 0.5 + smallCloudDrift,
    0.92 - cloudElevation / 0.32
  );
  vec4 smallCloudSample = texture2D(uSmallCloudTexture, smallCloudUv);
  float smallCloudFrame =
    smoothstep(0.025, 0.075, smallCloudUv.x) *
    (1.0 - smoothstep(0.925, 0.975, smallCloudUv.x));
  float smallCloudAltitudeMask =
    smoothstep(0.012, 0.04, direction.y) *
    (1.0 - smoothstep(0.31, 0.44, direction.y));
  float smallCloudAlpha =
    smallCloudSample.a *
    smallCloudFrame *
    smallCloudAltitudeMask *
    uSmallCloudTextureMix *
    0.78;
  vec3 smallCloudColor = smallCloudSample.rgb;
  smallCloudColor += vec3(0.13, 0.085, 0.018) * sunHaze * smallCloudAlpha;
  color = mix(color, smallCloudColor, smallCloudAlpha);

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
uniform sampler2D uOceanSunpath;
uniform float uOceanSunpathMix;
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
  vec3 horizon = vec3(0.065, 0.61, 0.86);
  vec3 zenith = vec3(0.004, 0.15, 0.52);
  return mix(horizon, zenith, pow(altitude, 0.72));
}

void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float distanceToCamera = length(cameraPosition - vWorldPosition);
  vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  float detailFade = 1.0 - smoothstep(520.0, 980.0, distanceToCamera);
  float screenDetail = smootherStep(0.24, 0.78, screenUv.y);
  float farDetailFade = 1.0 - smoothstep(330.0, 720.0, distanceToCamera);

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
  float absorption = 0.055 + depthMix * 0.76;
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
  float broadGlint = pow(sunAlignment, 19.0);
  vec2 glitterUv = heightUvB * 1.71 + vec2(uTime * 0.018, -uTime * 0.011);
  float glitterField = texture2D(uWaterHeight, glitterUv).r;
  float lineGlint = pow(sunAlignment, 68.0);
  float glitterDetail = texture2D(
    uWaterHeight,
    heightUvA * 2.73 + vec2(-uTime * 0.023, uTime * 0.015)
  ).r;
  float sharpGlint = pow(sunAlignment, mix(125.0, 480.0, glitterField));
  float fragmentedGlitter = smoothstep(0.56, 0.82, glitterField);
  float sparseGlitter = fragmentedGlitter * smoothstep(0.58, 0.86, glitterDetail);
  float glintDistance = smootherStep(0.34, 0.76, screenUv.y) *
    (1.0 - smoothstep(690.0, 980.0, distanceToCamera));
  vec3 sunColor = vec3(1.0, 0.94, 0.7);
  color += sunColor * glintDistance *
    (broadGlint * 0.13 +
      lineGlint * fragmentedGlitter * 0.24 +
      sharpGlint * sparseGlitter * 1.12);

  float middleWaterZone = smootherStep(0.28, 0.47, screenUv.y) *
    (1.0 - smootherStep(0.79, 0.855, screenUv.y));
  float horizontalWaveA = sin(
    point.y * 0.055 + sin(point.x * 0.021 + uTime * 0.18) * 1.15 -
      uTime * 0.36
  );
  float horizontalWaveB = sin(
    point.y * 0.094 + point.x * 0.013 + uTime * 0.27
  );
  float stylizedWaveRidge = smoothstep(
    0.62,
    0.94,
    horizontalWaveA * 0.72 + horizontalWaveB * 0.28
  );
  float stylizedWaveBreakup = smoothstep(0.46, 0.76, glitterField);
  color += vec3(0.12, 0.57, 0.68) *
    stylizedWaveRidge * stylizedWaveBreakup * middleWaterZone * 0.11;

  float farWaveShape =
    sin(point.x * 0.012 + uTime * 0.14) * 0.58 +
    sin(point.x * 0.027 - uTime * 0.09 + 1.7) * 0.42;
  float horizonFade = smoothstep(
    340.0 + farWaveShape * 34.0,
    900.0 + farWaveShape * 18.0,
    distanceToCamera
  );
  color = mix(color, vec3(0.045, 0.405, 0.62), horizonFade * 0.82);

  float waterDepthUv = clamp((0.845 - screenUv.y) / 0.845, 0.0, 1.0);
  vec2 sunpathDrift = vec2(
    sin(uTime * 0.17) * 0.003,
    cos(uTime * 0.13) * 0.004
  );
  float farPathExpansion = mix(
    0.48,
    1.0,
    smoothstep(0.05, 0.48, waterDepthUv)
  );
  float pathDistanceFade = 1.0 - smoothstep(0.36, 0.54, waterDepthUv);
  vec2 sunpathUv = vec2(
    0.5 +
      (screenUv.x - 0.5) * farPathExpansion +
      detailSlope.x * 0.028,
    waterDepthUv + detailSlope.y * 0.012
  ) + sunpathDrift;
  float authoredPathPrimary = texture2D(
    uOceanSunpath,
    clamp(sunpathUv, vec2(0.002), vec2(0.998))
  ).r * uOceanSunpathMix * pathDistanceFade;
  vec2 sunpathEchoUv = vec2(0.5) +
    (sunpathUv - vec2(0.5)) * vec2(1.035, 0.992) +
    vec2(-sunpathDrift.x * 1.7, sunpathDrift.y * 0.6);
  float authoredPathEcho = texture2D(
    uOceanSunpath,
    clamp(sunpathEchoUv, vec2(0.002), vec2(0.998))
  ).r * uOceanSunpathMix * pathDistanceFade;
  float authoredPath = max(authoredPathPrimary, authoredPathEcho * 0.48);
  float pathBreakup = smoothstep(
    0.38,
    0.7,
    glitterField * 0.62 + glitterDetail * 0.38
  );
  float pathSparkle = pathBreakup * pathBreakup;
  float ridgeFragments = smoothstep(0.2, 0.62, slopeEnergy) *
    smoothstep(0.48, 0.74, max(glitterField, glitterDetail));
  float specularPeaks = smoothstep(
    0.78,
    0.94,
    max(glitterField, glitterDetail)
  );
  float softPath = smoothstep(0.018, 0.34, authoredPath);
  float brightPath = smoothstep(0.18, 0.78, authoredPath);
  float waveFragments = clamp(
    pathBreakup * 0.42 +
      pathSparkle * 0.28 +
      ridgeFragments * 0.34 +
      specularPeaks * 0.52,
    0.0,
    1.0
  );
  float pathEnergy = softPath *
      (0.035 +
        broadGlint * 0.08 +
        lineGlint * fragmentedGlitter * 0.2 +
        sharpGlint * sparseGlitter * 0.48 +
        waveFragments * 0.38) +
    brightPath * (pathSparkle * 0.14 + specularPeaks * 0.22);
  vec3 pathColor = vec3(1.0, 0.84, 0.42);
  color += pathColor * pathEnergy * 0.62;
  color = mix(
    color,
    vec3(1.0, 0.985, 0.86),
    smoothstep(0.24, 0.72, pathEnergy) * 0.08
  );
  float postToneHighlight = clamp(
    softPath * waveFragments * 0.12 +
      brightPath * (pathSparkle * 0.08 + specularPeaks * 0.12),
    0.0,
    0.16
  );

  float microVariation = hash21(gl_FragCoord.xy + floor(uTime * 10.0)) - 0.5;
  color += microVariation * 0.008;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  gl_FragColor.rgb = mix(
    gl_FragColor.rgb,
    vec3(1.0, 0.91, 0.56),
    postToneHighlight
  );
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

float hashSeabed(vec2 point) {
  point = fract(point * vec2(127.1, 311.7));
  point += dot(point, point + 19.19);
  return fract(point.x * point.y);
}

float seabedNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = hashSeabed(cell);
  float b = hashSeabed(cell + vec2(1.0, 0.0));
  float c = hashSeabed(cell + vec2(0.0, 1.0));
  float d = hashSeabed(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

void main() {
  vec2 point = vWorldPosition.xz;
  mat2 rotateA = mat2(0.88, -0.48, 0.48, 0.88);
  mat2 rotateB = mat2(0.59, 0.81, -0.81, 0.59);
  vec2 uvA = rotateA * point * 0.062 +
    vec2(uTime * 0.012, -uTime * 0.008);
  vec2 uvB = rotateB * point * 0.118 +
    vec2(-uTime * 0.017, uTime * 0.011);
  float fieldB = texture2D(uCausticTexture, uvB).r;
  float warpY = texture2D(uCausticTexture, uvB + vec2(0.37, -0.21)).r;
  vec2 warp = vec2(fieldB, warpY) - 0.24;
  float fieldA = texture2D(uCausticTexture, uvA + warp * 0.055).r;
  float ridgeA = smoothstep(0.1, 0.48, fieldA);
  float ridgeB = smoothstep(0.14, 0.56, fieldB);
  float breakup = smoothstep(
    0.27,
    0.72,
    seabedNoise(point * 0.075 + vec2(uTime * 0.018, -uTime * 0.012))
  );
  float caustic = clamp(
    ridgeA * mix(0.24, 1.0, breakup) +
      ridgeB * mix(0.34, 0.12, breakup),
    0.0,
    1.0
  ) * uCausticTextureMix;

  float distanceToCamera = length(cameraPosition - vWorldPosition);
  float visibility = 1.0 - smoothstep(72.0, 245.0, distanceToCamera);
  float broadVariation = mix(0.86, 1.08, seabedNoise(point * 0.035));
  vec3 shallowBed = vec3(0.016, 0.335, 0.325);
  vec3 deepBed = vec3(0.003, 0.06, 0.12);
  vec3 color = mix(shallowBed, deepBed, smoothstep(34.0, 285.0, distanceToCamera));
  color *= broadVariation;
  float pulse = 0.9 + sin(uTime * 0.72 + point.x * 0.035) * 0.1;
  color += vec3(0.23, 0.88, 0.7) * caustic * visibility * pulse * 0.58;

  gl_FragColor = vec4(color, 1.0);
}
`;

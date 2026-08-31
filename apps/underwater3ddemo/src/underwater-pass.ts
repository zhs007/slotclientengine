import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from "three";

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uResolution;
uniform float uTime;
varying vec2 vUv;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

vec3 extractHighlight(vec2 uv) {
  vec3 sampleColor = texture2D(tScene, clamp(uv, 0.0, 1.0)).rgb;
  float energy = max(sampleColor.r, max(sampleColor.g, sampleColor.b));
  return sampleColor * smoothstep(0.92, 1.75, energy);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 fieldUv = uv * vec2(aspect, 1.0);
  float horizontal = sin(
    fieldUv.y * 7.2 + uTime * 0.16 + sin(fieldUv.x * 3.1 - uTime * 0.07)
  );
  float vertical = cos(
    fieldUv.x * 5.4 - uTime * 0.12 + sin(fieldUv.y * 2.7 + uTime * 0.05)
  );
  float edgeFade = smoothstep(0.0, 0.08, uv.x) *
    smoothstep(0.0, 0.08, 1.0 - uv.x) *
    smoothstep(0.0, 0.08, uv.y) *
    smoothstep(0.0, 0.08, 1.0 - uv.y);
  vec2 refractedUv = clamp(
    uv + vec2(horizontal * 0.00014, vertical * 0.00009) * edgeFade,
    0.0,
    1.0
  );
  vec3 color = texture2D(tScene, refractedUv).rgb;

  float depthGrade = smoothstep(0.15, 0.96, uv.y);
  vec3 gradedColor = color * mix(
    vec3(0.86, 0.96, 1.08),
    vec3(0.91, 1.04, 1.11),
    depthGrade
  );
  gradedColor = mix(
    gradedColor,
    gradedColor * vec3(0.82, 1.02, 1.12),
    0.22
  );
  float highlightEnergy = max(color.r, max(color.g, color.b));
  float highlightProtection = smoothstep(0.72, 1.85, highlightEnergy);
  color = mix(gradedColor, color, highlightProtection * 0.88);

  vec2 bloomRadius = vec2(9.0) / max(uResolution, vec2(1.0));
  vec3 highlightBloom = extractHighlight(refractedUv) * 0.18;
  highlightBloom += extractHighlight(refractedUv + vec2(bloomRadius.x, 0.0)) * 0.11;
  highlightBloom += extractHighlight(refractedUv - vec2(bloomRadius.x, 0.0)) * 0.11;
  highlightBloom += extractHighlight(refractedUv + vec2(0.0, bloomRadius.y)) * 0.11;
  highlightBloom += extractHighlight(refractedUv - vec2(0.0, bloomRadius.y)) * 0.11;
  highlightBloom += extractHighlight(refractedUv + bloomRadius) * 0.07;
  highlightBloom += extractHighlight(refractedUv - bloomRadius) * 0.07;
  highlightBloom += extractHighlight(
    refractedUv + vec2(bloomRadius.x, -bloomRadius.y)
  ) * 0.07;
  highlightBloom += extractHighlight(
    refractedUv + vec2(-bloomRadius.x, bloomRadius.y)
  ) * 0.07;
  float surfaceGlowFade = smoothstep(0.56, 0.94, uv.y);
  color += highlightBloom * vec3(1.04, 0.99, 0.88) *
    surfaceGlowFade * 0.34;

  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 saturatedColor = mix(vec3(luminance), color, 1.24);
  vec3 contrastedColor = max(
    (saturatedColor - vec3(0.18)) * 1.09 + vec3(0.18),
    vec3(0.0)
  );
  float hdrHighlight = smoothstep(
    0.9,
    2.2,
    max(color.r, max(color.g, color.b))
  );
  color = mix(contrastedColor, color, hdrHighlight * 0.82);
  color *= mix(1.1, 1.0, hdrHighlight);

  float grain = hash21(gl_FragCoord.xy + floor(uTime * 12.0)) - 0.5;
  color += grain * 0.012;

  vec2 vignetteUv = (uv - 0.5) * vec2(0.78, 1.0);
  float vignette = smoothstep(0.36, 0.73, length(vignetteUv));
  color *= 1.0 - vignette * 0.29;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class UnderwaterPass {
  readonly #target = new WebGLRenderTarget(1, 1, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    type: HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  readonly #scene = new Scene();
  readonly #camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #geometry = new PlaneGeometry(2, 2);
  readonly #material = new ShaderMaterial({
    uniforms: {
      tScene: { value: this.#target.texture },
      uResolution: { value: new Vector2(1, 1) },
      uTime: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  });

  constructor() {
    this.#target.texture.name = "underwater-scene-source";
    this.#target.samples = 2;
    const quad = new Mesh(this.#geometry, this.#material);
    quad.name = "underwater-color-composite";
    this.#scene.add(quad);
  }

  setSize(width: number, height: number): void {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    this.#target.setSize(safeWidth, safeHeight);
    this.#material.uniforms.uResolution.value.set(safeWidth, safeHeight);
  }

  render(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    time: number,
  ): void {
    this.#material.uniforms.uTime.value = time;
    renderer.setRenderTarget(this.#target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.#scene, this.#camera);
  }

  dispose(): void {
    this.#target.dispose();
    this.#geometry.dispose();
    this.#material.dispose();
  }
}

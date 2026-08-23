import {
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
uniform sampler2D tDiffuse;
uniform vec2 uTexelSize;
varying vec2 vUv;

float watercolorLuma(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

float paperNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 fraction = fract(point);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(
    mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), fraction.x),
    mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + 1.0), fraction.x),
    fraction.y
  );
}

void main() {
  vec3 center = texture2D(tDiffuse, vUv).rgb;
  vec3 north = texture2D(tDiffuse, vUv + vec2(0.0, uTexelSize.y)).rgb;
  vec3 south = texture2D(tDiffuse, vUv - vec2(0.0, uTexelSize.y)).rgb;
  vec3 east = texture2D(tDiffuse, vUv + vec2(uTexelSize.x, 0.0)).rgb;
  vec3 west = texture2D(tDiffuse, vUv - vec2(uTexelSize.x, 0.0)).rgb;

  vec3 wash = center * 0.62 + (north + south + east + west) * 0.095;
  float edge = max(
    abs(watercolorLuma(east) - watercolorLuma(west)),
    abs(watercolorLuma(north) - watercolorLuma(south))
  );
  float preserveDetail = smoothstep(0.018, 0.13, edge);
  vec3 color = mix(wash, center, 0.64 + preserveDetail * 0.36);

  float broadGrain = paperNoise(vUv * vec2(31.0, 53.0));
  float fineGrain = paperNoise(gl_FragCoord.xy * 0.7);
  float fibre = sin(gl_FragCoord.y * 0.71 + broadGrain * 7.0) * 0.5 + 0.5;
  float paper = (broadGrain - 0.5) * 0.032 +
    (fineGrain - 0.5) * 0.026 + (fibre - 0.5) * 0.009;
  float pigment = smoothstep(0.12, 0.82, 1.0 - watercolorLuma(color));
  color *= 1.0 + paper - pigment * (fineGrain - 0.5) * 0.035;

  vec3 warmPaper = vec3(1.0, 0.985, 0.945);
  color = mix(color, color * warmPaper, 0.13);
  color *= 1.0 - smoothstep(0.045, 0.2, edge) *
    (0.025 + broadGrain * 0.025);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class WatercolorPass {
  readonly #target = new WebGLRenderTarget(1, 1, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  });
  readonly #camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #scene = new Scene();
  readonly #geometry = new PlaneGeometry(2, 2);
  readonly #texelSize = new Vector2(1, 1);
  readonly #material = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: this.#target.texture },
      uTexelSize: { value: this.#texelSize },
    },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  });

  constructor() {
    this.#target.texture.name = "garden-watercolor-source";
    this.#target.samples = 2;
    const quad = new Mesh(this.#geometry, this.#material);
    quad.name = "watercolor-paper-composite";
    this.#scene.add(quad);
  }

  setSize(width: number, height: number): void {
    const safeWidth = Math.max(Math.floor(width), 1);
    const safeHeight = Math.max(Math.floor(height), 1);
    this.#target.setSize(safeWidth, safeHeight);
    this.#texelSize.set(1 / safeWidth, 1 / safeHeight);
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
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

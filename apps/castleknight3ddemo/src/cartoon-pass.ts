import {
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from "three";
import type { Camera, WebGLRenderer } from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 resolution;
  varying vec2 vUv;

  float cartoonLuma(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    vec2 texel = 1.0 / resolution;
    vec3 center = texture2D(tScene, vUv).rgb;
    vec3 north = texture2D(tScene, vUv + vec2(0.0, texel.y)).rgb;
    vec3 south = texture2D(tScene, vUv - vec2(0.0, texel.y)).rgb;
    vec3 east = texture2D(tScene, vUv + vec2(texel.x, 0.0)).rgb;
    vec3 west = texture2D(tScene, vUv - vec2(texel.x, 0.0)).rgb;

    float lumaEdge = abs(cartoonLuma(north) - cartoonLuma(south)) +
      abs(cartoonLuma(east) - cartoonLuma(west));
    float colorEdge = length(north - south) + length(east - west);
    float outline = smoothstep(0.13, 0.58, lumaEdge + colorEdge * 0.38);

    float luma = cartoonLuma(center);
    vec3 color = mix(vec3(luma), center, 1.09);
    color *= 1.0 - outline * 0.2;

    vec2 vignetteUv = (vUv - 0.5) * vec2(0.76, 1.0);
    float vignette = smoothstep(0.38, 0.72, length(vignetteUv));
    color *= 1.0 - vignette * 0.09;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class CartoonPass {
  readonly #target = new WebGLRenderTarget(1, 1, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: true,
  });
  readonly #scene = new Scene();
  readonly #camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #geometry = new PlaneGeometry(2, 2);
  readonly #material = new ShaderMaterial({
    uniforms: {
      tScene: { value: this.#target.texture },
      resolution: { value: new Vector2(1, 1) },
    },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  });

  constructor() {
    this.#scene.add(new Mesh(this.#geometry, this.#material));
  }

  setSize(width: number, height: number): void {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    this.#target.setSize(safeWidth, safeHeight);
    this.#material.uniforms.resolution.value.set(safeWidth, safeHeight);
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    renderer.setRenderTarget(this.#target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.#scene, this.#camera);
  }

  dispose(): void {
    this.#geometry.dispose();
    this.#material.dispose();
    this.#target.dispose();
  }
}

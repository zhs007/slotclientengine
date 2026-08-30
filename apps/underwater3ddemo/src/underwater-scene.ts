import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  Color,
  FogExp2,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { UnderwaterPass } from "./underwater-pass.js";

const densityFlowTextureUrl = new URL(
  "../assets/textures/water-density-flow.ktx2",
  import.meta.url,
).href;
const surfaceCausticTextureUrl = new URL(
  "../assets/textures/surface-caustic-field.ktx2",
  import.meta.url,
).href;

const waterVolumeVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const waterVolumeFragmentShader = /* glsl */ `
uniform float uTime;
varying vec2 vUv;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

void main() {
  vec3 deepWater = vec3(0.004, 0.055, 0.14);
  vec3 midWater = vec3(0.008, 0.23, 0.43);
  vec3 shallowWater = vec3(0.06, 0.52, 0.68);

  float depth = smoothstep(0.02, 0.74, vUv.y);
  vec3 color = mix(deepWater, midWater, depth);
  color = mix(color, shallowWater, smoothstep(0.72, 1.0, vUv.y));

  float broadHaze = sin(vUv.y * 4.2 + sin(vUv.x * 2.4 + uTime * 0.11));
  float currentA = sin(vUv.x * 5.2 + vUv.y * 2.1 + uTime * 0.18);
  float currentB = sin(vUv.x * -2.8 + vUv.y * 6.1 - uTime * 0.12);
  float currentMask = smoothstep(0.04, 0.22, vUv.y) *
    (1.0 - smoothstep(0.86, 1.0, vUv.y));
  float current = (currentA + currentB) * 0.5 * currentMask;
  color += vec3(0.008, 0.035, 0.052) * broadHaze;
  color += vec3(0.012, 0.045, 0.058) * current;

  float grain = hash21(vUv * vec2(720.0, 1080.0)) - 0.5;
  color += grain * 0.009;
  gl_FragColor = vec4(color, 1.0);
}
`;

const depthHazeVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const depthHazeFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uPhase;
uniform float uDensity;
uniform float uTextureMix;
uniform vec3 uColor;
uniform sampler2D uDensityFlow;
varying vec2 vUv;

float hash21(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
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

void main() {
  vec2 drift = vec2(uTime * 0.024, -uTime * 0.014);
  vec2 point = vUv * vec2(2.6, 3.4) + drift + uPhase;
  float proceduralHaze = valueNoise(point) * 0.62 + valueNoise(point * 2.15 - drift) * 0.38;
  proceduralHaze = smoothstep(0.26, 0.84, proceduralHaze);
  vec2 fieldUv = vUv * vec2(0.78, 1.08) + vec2(uPhase * 0.071) + drift * 0.32;
  vec4 densityFlow = texture2D(uDensityFlow, fieldUv);
  vec2 flow = densityFlow.ba * 2.0 - 1.0;
  float detail = texture2D(
    uDensityFlow,
    fieldUv * 1.83 + flow * 0.075 - drift * 0.41
  ).g;
  float mappedDensity = densityFlow.r * 0.7 + detail * 0.3;
  float mappedHaze = 0.46 + (mappedDensity - 0.5) * 0.42;
  float haze = mix(proceduralHaze, mappedHaze, uTextureMix);
  float edgeFade = smoothstep(0.0, 0.15, vUv.x) *
    smoothstep(0.0, 0.15, 1.0 - vUv.x) *
    smoothstep(0.0, 0.12, vUv.y) *
    smoothstep(0.0, 0.12, 1.0 - vUv.y);
  gl_FragColor = vec4(uColor, haze * edgeFade * uDensity);
}
`;

const ambientLightFieldFragmentShader = /* glsl */ `
uniform float uTime;
varying vec2 vUv;

float hash21(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 center = vec2(
    0.5 + sin(uTime * 0.09) * 0.035,
    0.73 + cos(uTime * 0.072) * 0.018
  );
  vec2 delta = (vUv - center) * vec2(0.68, 1.0);
  float field = exp(-3.8 * dot(delta, delta));
  float variation = hash21(floor(vUv * vec2(24.0, 32.0)) + floor(uTime * 0.4));
  float edgeFade = smoothstep(0.0, 0.18, vUv.x) *
    smoothstep(0.0, 0.18, 1.0 - vUv.x) *
    smoothstep(0.0, 0.14, vUv.y) *
    smoothstep(0.0, 0.14, 1.0 - vUv.y);
  float alpha = field * edgeFade * (0.055 + variation * 0.008);
  gl_FragColor = vec4(vec3(0.17, 0.58, 0.7), alpha);
}
`;

const surfaceLightFieldFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uSurfaceMix;
uniform sampler2D uSurfaceCaustic;
varying vec2 vUv;

void main() {
  vec2 uvA = vUv * vec2(1.08, 0.62) + vec2(uTime * 0.013, -uTime * 0.004);
  vec4 fieldA = texture2D(uSurfaceCaustic, uvA);
  vec2 flow = fieldA.ba * 2.0 - 1.0;
  vec2 uvB = vUv * vec2(1.67, 0.91) + flow * 0.035 +
    vec2(-uTime * 0.009, uTime * 0.003);
  vec4 fieldB = texture2D(uSurfaceCaustic, uvB);
  float ridge = max(fieldA.r * 0.74, fieldB.g * 0.64);
  float shimmer = smoothstep(0.18, 0.86, ridge);

  float upperBand = smoothstep(0.69, 0.93, vUv.y);
  float horizontalFade = smoothstep(0.0, 0.16, vUv.x) *
    smoothstep(0.0, 0.16, 1.0 - vUv.x);
  float broadField = 0.78 + 0.22 * sin(vUv.x * 4.1 + uTime * 0.12);
  float alpha = (0.006 + shimmer * 0.038) * upperBand * horizontalFade *
    broadField * uSurfaceMix;
  vec3 color = mix(vec3(0.2, 0.63, 0.72), vec3(0.62, 0.91, 0.91), shimmer);
  gl_FragColor = vec4(color, alpha);
}
`;

const primaryVolumeLightFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uTextureMix;
uniform float uSurfaceMix;
uniform sampler2D uDensityFlow;
uniform sampler2D uSurfaceCaustic;
varying vec2 vUv;

float hash21(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
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

void main() {
  vec2 apex = vec2(0.53, 1.12);
  float travel = clamp((apex.y - vUv.y) / 1.15, 0.0, 1.0);
  vec2 surfaceUv = vec2(
    apex.x * 1.18 + uTime * 0.008 + travel * 0.047,
    0.42 - uTime * 0.003 + travel * 0.09
  );
  vec4 surfaceField = texture2D(uSurfaceCaustic, surfaceUv);
  float sourceFocus = max(surfaceField.r, surfaceField.g);
  float depthBend = sin(vUv.y * 3.4 - uTime * 0.085) * 0.022 * travel;
  float surfaceBend = (surfaceField.b - 0.5) * 0.05 * travel * uSurfaceMix;
  float center = apex.x + sin(uTime * 0.045) * 0.012 * travel +
    depthBend + surfaceBend;
  float halfWidth = mix(0.09, 0.38, pow(travel, 0.78));
  float normalizedLateral = (vUv.x - center) / max(halfWidth, 0.001);
  float softCore = exp(-2.05 * normalizedLateral * normalizedLateral);
  float broadShoulder = exp(-0.78 * normalizedLateral * normalizedLateral);
  float beam = softCore * 0.68 + broadShoulder * 0.16;
  float verticalFade = smoothstep(0.0, 0.1, travel) *
    (1.0 - smoothstep(0.72, 1.0, travel));
  vec2 noiseUv = vUv * vec2(2.4, 5.2) + vec2(uTime * 0.012, -uTime * 0.018);
  float proceduralDensity = valueNoise(noiseUv) * 0.65 + valueNoise(noiseUv * 2.1) * 0.35;
  vec2 fieldUv = vUv * vec2(0.92, 1.24) + vec2(uTime * 0.004, -uTime * 0.007);
  vec4 densityFlow = texture2D(uDensityFlow, fieldUv);
  vec2 flow = densityFlow.ba * 2.0 - 1.0;
  float detail = texture2D(
    uDensityFlow,
    fieldUv * 2.06 + flow * 0.06 + vec2(-uTime * 0.006, uTime * 0.003)
  ).g;
  float mappedDensity = densityFlow.r * 0.72 + detail * 0.28;
  float density = mix(proceduralDensity, mappedDensity, uTextureMix);
  float focusModulation = mix(1.0, mix(0.88, 1.1, sourceFocus), uSurfaceMix);
  float alpha = beam * verticalFade * mix(0.09, 0.14, density) *
    focusModulation;
  vec3 color = mix(vec3(0.12, 0.48, 0.62), vec3(0.38, 0.78, 0.84), 1.0 - travel);
  gl_FragColor = vec4(color, alpha);
}
`;

interface DepthHazeLayer {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  readonly baseX: number;
  readonly baseY: number;
  readonly phase: number;
  readonly drift: number;
}

export class UnderwaterRenderer {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(49, 1, 0.1, 100);
  readonly #root = new Group();
  readonly #drawingBufferSize = new Vector2();
  readonly #underwaterPass = new UnderwaterPass();
  readonly #animatedMaterials: ShaderMaterial[] = [];
  readonly #depthHazeLayers: DepthHazeLayer[] = [];
  readonly #ktx2Loader: KTX2Loader;
  #densityFlowTexture = new Texture();
  #surfaceCausticTexture = new Texture();
  #densityFlowReady = false;
  #surfaceCausticReady = false;
  #textureLoadError: Error | null = null;
  #destroyed = false;

  constructor(host: HTMLElement) {
    this.#renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.#renderer.domElement.className = "underwater-canvas";
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 0.96;
    this.#renderer.setClearColor(0x021331, 1);
    host.prepend(this.#renderer.domElement);

    this.#ktx2Loader = new KTX2Loader().detectSupport(this.#renderer);
    this.#loadDensityFlowTexture();
    this.#loadSurfaceCausticTexture();

    this.#scene.background = new Color(0x021331);
    this.#scene.fog = new FogExp2(0x052a4d, 0.032);
    this.#scene.add(this.#root);
    this.#createWaterVolume();
    this.#createAmbientLightField();
    this.#createSurfaceLightField();
    this.#createPrimaryVolumeLight();
    this.#createDepthHaze();

    this.#camera.position.set(0, 0.35, 18.8);
    this.#camera.lookAt(0, -0.2, -5.2);
    this.resize(host.clientWidth, host.clientHeight);
    this.#renderer.setAnimationLoop(this.#renderFrame);
  }

  resize(width: number, height: number): void {
    if (this.#destroyed) return;
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    const aspect = safeWidth / safeHeight;
    this.#camera.aspect = aspect;
    this.#camera.fov = aspect < 0.72 ? 49 : aspect < 1.1 ? 45 : 39;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.55));
    this.#renderer.setSize(safeWidth, safeHeight, false);
    this.#renderer.getDrawingBufferSize(this.#drawingBufferSize);
    this.#underwaterPass.setSize(
      this.#drawingBufferSize.x,
      this.#drawingBufferSize.y,
    );
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#renderer.setAnimationLoop(null);

    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    this.#root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of objectMaterials) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.#densityFlowTexture.dispose();
    this.#surfaceCausticTexture.dispose();
    this.#ktx2Loader.dispose();
    this.#underwaterPass.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  readonly #renderFrame = (timeMilliseconds: number): void => {
    if (this.#destroyed) return;
    if (this.#textureLoadError) throw this.#textureLoadError;
    const time = timeMilliseconds / 1000;
    for (const material of this.#animatedMaterials) {
      material.uniforms.uTime.value = time;
      if (material.uniforms.uTextureMix) {
        material.uniforms.uTextureMix.value = this.#densityFlowReady ? 1 : 0;
      }
      if (material.uniforms.uSurfaceMix) {
        material.uniforms.uSurfaceMix.value = this.#surfaceCausticReady ? 1 : 0;
      }
    }

    for (const layer of this.#depthHazeLayers) {
      layer.mesh.position.x =
        layer.baseX + Math.sin(time * layer.drift + layer.phase) * 0.16;
      layer.mesh.position.y =
        layer.baseY + Math.cos(time * layer.drift * 0.73 + layer.phase) * 0.1;
    }

    this.#underwaterPass.render(
      this.#renderer,
      this.#scene,
      this.#camera,
      time,
    );
  };

  #createWaterVolume(): void {
    const material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: waterVolumeVertexShader,
      fragmentShader: waterVolumeFragmentShader,
      depthWrite: false,
      fog: false,
    });
    this.#animatedMaterials.push(material);
    const volume = new Mesh(new PlaneGeometry(72, 38), material);
    volume.name = "water-volume-gradient";
    volume.position.set(0, 0.7, -24);
    this.#root.add(volume);
  }

  #createDepthHaze(): void {
    const geometry = new PlaneGeometry(1, 1);
    const layers = [
      {
        name: "far",
        z: -18.5,
        width: 66,
        height: 36,
        density: 0.065,
        color: 0x063656,
        phase: 0.7,
        drift: 0.09,
      },
      {
        name: "middle",
        z: -10,
        width: 48,
        height: 28,
        density: 0.042,
        color: 0x0b6073,
        phase: 2.3,
        drift: 0.125,
      },
      {
        name: "near",
        z: -2,
        width: 34,
        height: 21,
        density: 0.022,
        color: 0x158493,
        phase: 4.8,
        drift: 0.16,
      },
    ] as const;

    for (const layer of layers) {
      const material = new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: layer.phase },
          uDensity: { value: layer.density },
          uColor: { value: new Color(layer.color) },
          uTextureMix: { value: 0 },
          uDensityFlow: { value: this.#densityFlowTexture },
        },
        vertexShader: depthHazeVertexShader,
        fragmentShader: depthHazeFragmentShader,
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      const mesh = new Mesh(geometry, material);
      mesh.name = `water-depth-haze-${layer.name}`;
      mesh.position.set(0, 0.25, layer.z);
      mesh.scale.set(layer.width, layer.height, 1);
      this.#animatedMaterials.push(material);
      this.#depthHazeLayers.push({
        mesh,
        material,
        baseX: mesh.position.x,
        baseY: mesh.position.y,
        phase: layer.phase,
        drift: layer.drift,
      });
      this.#root.add(mesh);
    }
  }

  #createAmbientLightField(): void {
    const material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: depthHazeVertexShader,
      fragmentShader: ambientLightFieldFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    const field = new Mesh(new PlaneGeometry(58, 34), material);
    field.name = "broad-underwater-ambient-light";
    field.position.set(0, 0.55, -15.5);
    this.#animatedMaterials.push(material);
    this.#root.add(field);
  }

  #createSurfaceLightField(): void {
    const material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSurfaceMix: { value: 0 },
        uSurfaceCaustic: { value: this.#surfaceCausticTexture },
      },
      vertexShader: depthHazeVertexShader,
      fragmentShader: surfaceLightFieldFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    const field = new Mesh(new PlaneGeometry(42, 25), material);
    field.name = "dynamic-surface-light-field";
    field.position.set(0, 0.8, -4.5);
    this.#animatedMaterials.push(material);
    this.#root.add(field);
  }

  #createPrimaryVolumeLight(): void {
    const material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTextureMix: { value: 0 },
        uSurfaceMix: { value: 0 },
        uDensityFlow: { value: this.#densityFlowTexture },
        uSurfaceCaustic: { value: this.#surfaceCausticTexture },
      },
      vertexShader: depthHazeVertexShader,
      fragmentShader: primaryVolumeLightFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    const light = new Mesh(new PlaneGeometry(46, 28), material);
    light.name = "surface-modulated-primary-volume-light";
    light.position.set(0, 0.55, -6);
    this.#animatedMaterials.push(material);
    this.#root.add(light);
  }

  #loadDensityFlowTexture(): void {
    this.#ktx2Loader.load(
      densityFlowTextureUrl,
      (texture) => {
        if (this.#destroyed) {
          texture.dispose();
          return;
        }
        const placeholder = this.#densityFlowTexture;
        this.#configureDataTexture(texture, "water-density-flow-data");
        this.#densityFlowTexture = texture;
        this.#replaceTextureUniform("uDensityFlow", texture);
        placeholder.dispose();
        this.#densityFlowReady = true;
      },
      undefined,
      (cause) => {
        this.#textureLoadError = new Error(
          `Failed to load underwater density/flow texture: ${densityFlowTextureUrl}`,
          { cause },
        );
      },
    );
  }

  #loadSurfaceCausticTexture(): void {
    this.#ktx2Loader.load(
      surfaceCausticTextureUrl,
      (texture) => {
        if (this.#destroyed) {
          texture.dispose();
          return;
        }
        const placeholder = this.#surfaceCausticTexture;
        this.#configureDataTexture(texture, "surface-caustic-field-data");
        this.#surfaceCausticTexture = texture;
        this.#replaceTextureUniform("uSurfaceCaustic", texture);
        placeholder.dispose();
        this.#surfaceCausticReady = true;
      },
      undefined,
      (cause) => {
        this.#textureLoadError = new Error(
          `Failed to load underwater surface caustic texture: ${surfaceCausticTextureUrl}`,
          { cause },
        );
      },
    );
  }

  #configureDataTexture(texture: Texture, name: string): void {
    texture.name = name;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = NoColorSpace;
    texture.generateMipmaps = false;
    texture.anisotropy = Math.min(
      8,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    texture.needsUpdate = true;
  }

  #replaceTextureUniform(uniformName: string, texture: Texture): void {
    for (const material of this.#animatedMaterials) {
      if (material.uniforms[uniformName]) {
        material.uniforms[uniformName].value = texture;
      }
    }
  }
}

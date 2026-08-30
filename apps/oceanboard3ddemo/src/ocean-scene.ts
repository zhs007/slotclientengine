import {
  ACESFilmicToneMapping,
  BackSide,
  Color,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { clampOceanPixelRatio, getOceanCameraProfile } from "./ocean-config.js";
import {
  oceanFragmentShader,
  oceanVertexShader,
  skyFragmentShader,
  skyVertexShader,
} from "./ocean-shaders.js";

const sunDirection = new Vector3(0.045, 0.155, -1).normalize();

export class OceanSurfaceRenderer {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(48, 1, 0.1, 1100);
  readonly #skyMaterial: ShaderMaterial;
  readonly #oceanMaterial: ShaderMaterial;
  readonly #sky: Mesh<SphereGeometry, ShaderMaterial>;
  #destroyed = false;

  constructor(host: HTMLElement) {
    this.#renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.#renderer.domElement.className = "ocean-canvas";
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 0.86;
    this.#renderer.setClearColor(0x0e95d3, 1);
    host.prepend(this.#renderer.domElement);

    this.#skyMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
      },
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: BackSide,
      depthWrite: false,
      toneMapped: true,
    });
    this.#sky = new Mesh(new SphereGeometry(760, 48, 24), this.#skyMaterial);
    this.#sky.name = "procedural-ocean-sky";
    this.#scene.add(this.#sky);

    this.#oceanMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
        uDeepColor: { value: new Color(0x005998) },
        uMidColor: { value: new Color(0x008fbe) },
        uShallowColor: { value: new Color(0x00b5c9) },
      },
      vertexShader: oceanVertexShader,
      fragmentShader: oceanFragmentShader,
      toneMapped: true,
    });
    const ocean = new Mesh(
      new PlaneGeometry(520, 720, 160, 196),
      this.#oceanMaterial,
    );
    ocean.name = "gerstner-style-ocean-surface";
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.z = -330;
    ocean.frustumCulled = false;
    this.#scene.add(ocean);

    this.#camera.position.set(0, 5.8, 14);
    this.resize(host.clientWidth, host.clientHeight);
    this.#renderer.setAnimationLoop(this.#renderFrame);
  }

  resize(width: number, height: number): void {
    if (this.#destroyed) return;
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    const aspect = safeWidth / safeHeight;
    const profile = getOceanCameraProfile(aspect);
    this.#camera.aspect = aspect;
    this.#camera.fov = profile.fov;
    this.#camera.lookAt(0, profile.lookY, profile.lookZ);
    this.#camera.updateProjectionMatrix();
    this.#renderer.setPixelRatio(
      clampOceanPixelRatio(window.devicePixelRatio || 1),
    );
    this.#renderer.setSize(safeWidth, safeHeight, false);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#renderer.setAnimationLoop(null);
    this.#scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  readonly #renderFrame = (timeMilliseconds: number): void => {
    if (this.#destroyed) return;
    const time = timeMilliseconds / 1000;
    this.#skyMaterial.uniforms.uTime.value = time;
    this.#oceanMaterial.uniforms.uTime.value = time;
    this.#sky.position.copy(this.#camera.position);
    this.#renderer.render(this.#scene, this.#camera);
  };
}

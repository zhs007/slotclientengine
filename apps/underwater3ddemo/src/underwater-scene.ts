import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type Material,
} from "three";
import { BUBBLES, PARTICLES } from "./config.js";
import { createBubblePlacements, type BubblePlacement } from "./layout.js";
import { createRandom, randomBetween } from "./random.js";
import { SymbolField } from "./symbols.js";
import { UnderwaterPass } from "./underwater-pass.js";

const backdropVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const backdropFragmentShader = /* glsl */ `
uniform float uTime;
varying vec2 vUv;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

void main() {
  vec3 deep = vec3(0.004, 0.075, 0.19);
  vec3 middle = vec3(0.01, 0.3, 0.56);
  vec3 surface = vec3(0.08, 0.77, 0.93);
  vec3 color = mix(deep, middle, smoothstep(0.02, 0.72, vUv.y));
  color = mix(color, surface, smoothstep(0.72, 1.0, vUv.y));
  float bloom = 1.0 - smoothstep(0.0, 0.42, distance(vUv, vec2(0.52, 1.08)));
  color += vec3(0.13, 0.72, 0.9) * bloom * 0.66;
  float band = sin(vUv.y * 54.0 + sin(vUv.x * 13.0 + uTime * 0.13)) * 0.5 + 0.5;
  color += vec3(0.01, 0.09, 0.13) * band * smoothstep(0.56, 0.96, vUv.y) * 0.14;
  color += (hash21(vUv * vec2(620.0, 940.0)) - 0.5) * 0.018;
  gl_FragColor = vec4(color, 1.0);
}
`;

const surfaceVertexShader = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vWave;

void main() {
  vUv = uv;
  vec3 transformed = position;
  float wave = sin(position.x * 1.35 + uTime * 0.72) * 0.17 +
    sin(position.y * 2.1 - uTime * 0.54) * 0.1;
  transformed.z += wave;
  vWave = wave;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const surfaceFragmentShader = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vWave;

void main() {
  float lineA = abs(sin(vUv.x * 38.0 + sin(vUv.y * 13.0 + uTime * 0.7) * 2.3));
  float lineB = abs(sin(vUv.y * 29.0 - uTime * 0.55 + sin(vUv.x * 17.0)));
  float cells = pow(max(0.0, 1.0 - abs(lineA - lineB)), 8.0);
  float horizon = smoothstep(0.1, 0.96, vUv.y);
  vec3 color = mix(vec3(0.025, 0.3, 0.6), vec3(0.18, 0.78, 0.94), horizon);
  color += vec3(0.34, 0.86, 1.0) * cells * 0.34;
  float alpha = 0.1 + cells * 0.18 + abs(vWave) * 0.12;
  gl_FragColor = vec4(color, alpha);
}
`;

const seabedVertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vUv = uv;
  vec3 transformed = position;
  transformed.z += sin(position.x * 0.72) * 0.13 + cos(position.y * 0.48) * 0.12;
  vPosition = transformed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const seabedFragmentShader = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vPosition;

float caustic(vec2 point) {
  float first = sin(point.x * 18.0 + sin(point.y * 11.0 + uTime * 0.8) * 2.2);
  float second = sin(point.y * 21.0 - uTime * 0.7 + sin(point.x * 9.0) * 2.0);
  return pow(max(0.0, 1.0 - abs(first - second)), 9.0);
}

void main() {
  vec3 sandDeep = vec3(0.025, 0.16, 0.24);
  vec3 sandLight = vec3(0.14, 0.39, 0.43);
  vec3 color = mix(sandDeep, sandLight, smoothstep(0.0, 1.0, vUv.y));
  float ripples = sin(vPosition.x * 4.2 + sin(vPosition.y * 1.7)) * 0.5 + 0.5;
  color *= 0.9 + ripples * 0.1;
  color += vec3(0.16, 0.62, 0.68) * caustic(vUv * vec2(2.1, 1.25)) * 0.19;
  gl_FragColor = vec4(color, 1.0);
}
`;

class BubbleField extends InstancedMesh {
  readonly #placements: BubblePlacement[];
  readonly #dummy = new Object3D();

  constructor() {
    const placements = createBubblePlacements();
    super(
      new SphereGeometry(1, 12, 8),
      new MeshPhysicalMaterial({
        color: 0xb5f6ff,
        transparent: true,
        opacity: 0.28,
        roughness: 0.05,
        metalness: 0,
        transmission: 0.64,
        thickness: 0.08,
        ior: 1.33,
        depthWrite: false,
      }),
      placements.length,
    );
    this.name = "rising-bubble-field";
    this.#placements = placements;
    this.frustumCulled = false;
    this.update(0);
  }

  update(time: number): void {
    const span = BUBBLES.maxY - BUBBLES.minY;
    for (let index = 0; index < this.#placements.length; index += 1) {
      const bubble = this.#placements[index];
      const y =
        BUBBLES.minY +
        ((((bubble.y - BUBBLES.minY + time * bubble.speed) % span) + span) %
          span);
      this.#dummy.position.set(
        bubble.x + Math.sin(time * 0.62 + bubble.phase) * 0.16,
        y,
        bubble.z,
      );
      const pulse = 1 + Math.sin(time * 1.8 + bubble.phase) * 0.07;
      this.#dummy.scale.setScalar(bubble.radius * pulse);
      this.#dummy.updateMatrix();
      this.setMatrixAt(index, this.#dummy.matrix);
    }
    this.instanceMatrix.needsUpdate = true;
  }
}

interface LightShaft {
  readonly mesh: Mesh;
  readonly phase: number;
  readonly baseRotation: number;
}

export class UnderwaterRenderer {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(49, 1, 0.1, 100);
  readonly #root = new Group();
  readonly #cameraPointer = new Vector2();
  readonly #cameraOffset = new Vector2();
  readonly #drawingBufferSize = new Vector2();
  readonly #underwaterPass = new UnderwaterPass();
  readonly #symbols = new SymbolField(0x0cea_5eed);
  readonly #bubbles = new BubbleField();
  readonly #lightShafts: LightShaft[] = [];
  readonly #animatedMaterials: ShaderMaterial[] = [];
  readonly #particles: Points;
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
    this.#renderer.toneMappingExposure = 1.08;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.setClearColor(0x031f42, 1);
    host.prepend(this.#renderer.domElement);

    this.#scene.background = new Color(0x031f42);
    this.#scene.fog = new FogExp2(0x063865, 0.027);
    this.#scene.add(this.#root);
    this.#createBackdrop();
    this.#createSurface();
    this.#createLightShafts();
    this.#createSeabed();
    this.#createShipwreck();
    this.#createDistantFish();
    this.#createCaveFrame();
    this.#createCorals();
    this.#particles = this.#createParticles();
    this.#root.add(this.#particles, this.#bubbles, this.#symbols);
    this.#createLighting();

    this.#camera.position.set(0, 0.35, 18.8);
    this.#camera.lookAt(0, -0.2, -5.2);
    this.#renderer.domElement.addEventListener(
      "pointermove",
      this.#onPointerMove,
    );
    this.#renderer.domElement.addEventListener(
      "pointerleave",
      this.#onPointerLeave,
    );
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
    this.#renderer.domElement.removeEventListener(
      "pointermove",
      this.#onPointerMove,
    );
    this.#renderer.domElement.removeEventListener(
      "pointerleave",
      this.#onPointerLeave,
    );
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    this.#root.traverse((object) => {
      if (!(object instanceof Mesh) && !(object instanceof Points)) return;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of objectMaterials) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.#underwaterPass.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  readonly #onPointerMove = (event: PointerEvent): void => {
    const bounds = this.#renderer.domElement.getBoundingClientRect();
    this.#cameraPointer.set(
      ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1,
      ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 - 1,
    );
  };

  readonly #onPointerLeave = (): void => {
    this.#cameraPointer.set(0, 0);
  };

  readonly #renderFrame = (timeMilliseconds: number): void => {
    if (this.#destroyed) return;
    const time = timeMilliseconds / 1000;
    for (const material of this.#animatedMaterials) {
      material.uniforms.uTime.value = time;
    }
    this.#symbols.update(time);
    this.#bubbles.update(time);
    this.#particles.rotation.y = Math.sin(time * 0.08) * 0.035;
    this.#particles.position.y = Math.sin(time * 0.14) * 0.12;
    for (const shaft of this.#lightShafts) {
      shaft.mesh.rotation.z =
        shaft.baseRotation + Math.sin(time * 0.21 + shaft.phase) * 0.055;
      const material = shaft.mesh.material as MeshBasicMaterial;
      material.opacity = 0.035 + Math.sin(time * 0.43 + shaft.phase) * 0.012;
    }
    this.#cameraOffset.lerp(this.#cameraPointer, 0.022);
    this.#camera.position.set(
      this.#cameraOffset.x * 0.34,
      0.35 - this.#cameraOffset.y * 0.2,
      18.8 + this.#cameraOffset.y * 0.22,
    );
    this.#camera.lookAt(this.#cameraOffset.x * 0.22, -0.2, -5.2);
    this.#underwaterPass.render(
      this.#renderer,
      this.#scene,
      this.#camera,
      time,
    );
  };

  #createBackdrop(): void {
    const material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: backdropVertexShader,
      fragmentShader: backdropFragmentShader,
      depthWrite: false,
      fog: false,
    });
    this.#animatedMaterials.push(material);
    const backdrop = new Mesh(new PlaneGeometry(35, 28), material);
    backdrop.name = "water-depth-gradient";
    backdrop.position.set(0, 0.7, -24);
    this.#root.add(backdrop);
  }

  #createSurface(): void {
    const material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: surfaceVertexShader,
      fragmentShader: surfaceFragmentShader,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      fog: false,
    });
    this.#animatedMaterials.push(material);
    const surface = new Mesh(new PlaneGeometry(25, 3.8, 72, 16), material);
    surface.name = "animated-water-surface";
    surface.position.set(0, 11.35, -17.4);
    surface.rotation.x = -0.2;
    this.#root.add(surface);
  }

  #createLightShafts(): void {
    const random = createRandom(0x51a7_2026);
    const geometry = new ConeGeometry(2.1, 17, 20, 1, true);
    for (let index = 0; index < 6; index += 1) {
      const material = new MeshBasicMaterial({
        color: index % 2 === 0 ? 0x6cecff : 0x48bfff,
        transparent: true,
        opacity: 0.04,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      });
      const shaft = new Mesh(geometry, material);
      shaft.name = `volumetric-light-shaft-${index + 1}`;
      shaft.position.set(randomBetween(random, -5.8, 5.8), 3.4, -11.5);
      shaft.scale.x = randomBetween(random, 0.5, 1.2);
      shaft.scale.z = randomBetween(random, 0.45, 0.9);
      const baseRotation = randomBetween(random, -0.1, 0.1);
      shaft.rotation.z = baseRotation;
      this.#lightShafts.push({
        mesh: shaft,
        phase: randomBetween(random, 0, Math.PI * 2),
        baseRotation,
      });
      this.#root.add(shaft);
    }
  }

  #createSeabed(): void {
    const material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: seabedVertexShader,
      fragmentShader: seabedFragmentShader,
      side: DoubleSide,
      fog: false,
    });
    this.#animatedMaterials.push(material);
    const seabed = new Mesh(new PlaneGeometry(31, 18, 40, 26), material);
    seabed.name = "caustic-sand-seabed";
    seabed.position.set(0, -9.8, -7.5);
    seabed.rotation.x = -1.08;
    this.#root.add(seabed);
  }

  #createShipwreck(): void {
    const ship = new Group();
    ship.name = "distant-shipwreck-silhouette";
    ship.position.set(-5.1, 5.15, -18.4);
    ship.rotation.z = -0.08;
    ship.scale.setScalar(1.25);
    const material = new MeshBasicMaterial({ color: 0x03254a, fog: true });
    const hullShape = new Shape();
    hullShape.moveTo(-2.7, 0.45);
    hullShape.lineTo(2.2, 0.45);
    hullShape.lineTo(1.45, -0.58);
    hullShape.lineTo(-1.75, -0.82);
    hullShape.closePath();
    ship.add(new Mesh(new ShapeGeometry(hullShape), material));
    const mastGeometry = new CylinderGeometry(0.055, 0.075, 3.8, 7);
    const beamGeometry = new CylinderGeometry(0.045, 0.045, 2.6, 7);
    for (const x of [-1.15, 0.55]) {
      const mast = new Mesh(mastGeometry, material);
      mast.position.set(x, 1.75, 0);
      const beam = new Mesh(beamGeometry, material);
      beam.position.set(x, 2.45, 0);
      beam.rotation.z = Math.PI / 2;
      ship.add(mast, beam);
    }
    const sailShape = new Shape();
    sailShape.moveTo(-0.95, 2.28);
    sailShape.lineTo(0.2, 2.05);
    sailShape.lineTo(-0.86, 0.98);
    sailShape.closePath();
    const sail = new Mesh(new ShapeGeometry(sailShape), material);
    sail.position.x = -0.12;
    ship.add(sail);
    this.#root.add(ship);
  }

  #createDistantFish(): void {
    const school = new Group();
    school.name = "distant-fish-school";
    const bodyGeometry = new SphereGeometry(0.32, 9, 6);
    const tailGeometry = new ConeGeometry(0.22, 0.4, 3);
    const material = new MeshBasicMaterial({ color: 0x064b72, fog: true });
    const random = createRandom(0xf157_2026);
    for (let index = 0; index < 14; index += 1) {
      const fish = new Group();
      fish.position.set(
        randomBetween(random, 2.5, 7.5),
        randomBetween(random, 4.2, 8.2),
        randomBetween(random, -19.5, -15.5),
      );
      const scale = randomBetween(random, 0.5, 1.15);
      fish.scale.setScalar(scale);
      const body = new Mesh(bodyGeometry, material);
      body.scale.set(1.45, 0.7, 0.28);
      const tail = new Mesh(tailGeometry, material);
      tail.position.x = -0.56;
      tail.rotation.z = Math.PI / 2;
      fish.add(body, tail);
      school.add(fish);
    }
    this.#root.add(school);
  }

  #createCaveFrame(): void {
    const random = createRandom(0xca7e_2026);
    const geometry = new IcosahedronGeometry(1, 1);
    const backMaterial = new MeshStandardMaterial({
      color: 0x06345b,
      roughness: 0.88,
      metalness: 0,
    });
    const frontMaterial = new MeshStandardMaterial({
      color: 0x02192f,
      roughness: 0.94,
      metalness: 0,
    });
    const positions: Array<readonly [number, number, number, number]> = [];
    for (const side of [-1, 1]) {
      for (let index = 0; index < 18; index += 1) {
        positions.push([
          side * randomBetween(random, 6.0, 7.3),
          -9.2 + index * 1.1 + randomBetween(random, -0.35, 0.35),
          randomBetween(random, -5.8, -0.8),
          randomBetween(random, 0.75, 1.6),
        ]);
      }
    }
    for (let index = 0; index < 17; index += 1) {
      positions.push([
        -7.2 + index * 0.9 + randomBetween(random, -0.25, 0.25),
        randomBetween(random, 9.1, 10.2),
        randomBetween(random, -5.4, -1.0),
        randomBetween(random, 0.78, 1.65),
      ]);
    }
    const back = new InstancedMesh(geometry, backMaterial, positions.length);
    const front = new InstancedMesh(
      geometry.clone(),
      frontMaterial,
      positions.length,
    );
    back.name = "cave-frame-mid-rocks";
    front.name = "cave-frame-foreground-rocks";
    const dummy = new Object3D();
    for (let index = 0; index < positions.length; index += 1) {
      const [x, y, z, scale] = positions[index];
      dummy.position.set(x, y, z - 0.8);
      dummy.rotation.set(
        random() * Math.PI,
        random() * Math.PI,
        random() * Math.PI,
      );
      dummy.scale.set(scale * 1.15, scale, scale * 0.78);
      dummy.updateMatrix();
      back.setMatrixAt(index, dummy.matrix);
      dummy.position.set(x * 1.035, y, z + 0.52);
      dummy.scale.multiplyScalar(0.72);
      dummy.updateMatrix();
      front.setMatrixAt(index, dummy.matrix);
    }
    back.instanceMatrix.needsUpdate = true;
    front.instanceMatrix.needsUpdate = true;
    this.#root.add(back, front);
  }

  #createCorals(): void {
    const coralRoot = new Group();
    coralRoot.name = "seabed-coral-accents";
    const random = createRandom(0xc0a1_2026);
    const palettes = [0xff6f61, 0x9b5de5, 0x27c6a8, 0xff9f1c];
    for (const side of [-1, 1]) {
      for (let clusterIndex = 0; clusterIndex < 5; clusterIndex += 1) {
        const cluster = new Group();
        cluster.position.set(
          side * randomBetween(random, 5.4, 7.0),
          randomBetween(random, -9.15, -6.4),
          randomBetween(random, -4.2, -0.4),
        );
        cluster.rotation.z = side * randomBetween(random, -0.2, 0.18);
        const color = palettes[Math.floor(random() * palettes.length)];
        const material = new MeshStandardMaterial({
          color,
          roughness: 0.64,
          emissive: new Color(color).multiplyScalar(0.13),
          emissiveIntensity: 0.5,
        });
        const branches = 3 + Math.floor(random() * 4);
        for (let branchIndex = 0; branchIndex < branches; branchIndex += 1) {
          const height = randomBetween(random, 0.65, 1.55);
          const branch = new Mesh(
            new CylinderGeometry(0.08, 0.15, height, 7),
            material,
          );
          branch.position.set(
            randomBetween(random, -0.38, 0.38),
            height / 2,
            randomBetween(random, -0.2, 0.2),
          );
          branch.rotation.z = randomBetween(random, -0.35, 0.35);
          cluster.add(branch);
        }
        coralRoot.add(cluster);
      }
    }
    this.#root.add(coralRoot);
  }

  #createParticles(): Points {
    const random = createRandom(PARTICLES.seed);
    const positions = new Float32Array(PARTICLES.count * 3);
    for (let index = 0; index < PARTICLES.count; index += 1) {
      const offset = index * 3;
      positions[offset] = randomBetween(random, -10, 10);
      positions[offset + 1] = randomBetween(random, -11, 11);
      positions[offset + 2] = randomBetween(random, -15, 8);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: 0xb7f5ff,
      size: 0.035,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    const particles = new Points(geometry, material);
    particles.name = "suspended-water-particles";
    return particles;
  }

  #createLighting(): void {
    this.#scene.add(
      new HemisphereLight(0x8aeaff, 0x062446, 1.05),
      new AmbientLight(0x2277aa, 0.46),
    );
    const sun = new DirectionalLight(0xb8f8ff, 2.2);
    sun.position.set(-3, 12, 8);
    sun.castShadow = true;
    this.#scene.add(sun);
    const cyanFill = new PointLight(0x29bfff, 14, 24, 1.8);
    cyanFill.position.set(4, 5, 5);
    const sandFill = new PointLight(0x58f0d0, 8, 14, 2);
    sandFill.position.set(-3, -7, 2);
    this.#scene.add(cyanFill, sandFill);
  }
}

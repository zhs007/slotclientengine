import { Application, Assets, Container, Texture } from "pixi.js";
import type { gsap } from "gsap";
import type { CodeAnimationProject } from "../animations/types.js";
import { bindLayerMasks } from "./mask-manager.js";
import { createLayer, type BuiltLayer } from "./layer-factory.js";
import { buildProjectTimeline } from "./timeline.js";

export interface ProjectScene {
  root: Container;
  layers: BuiltLayer[];
}

export async function loadProjectTextures(project: CodeAnimationProject) {
  const pairs = await Promise.all(
    project.layers.map(
      async (layer) =>
        [layer.id, await Assets.load<Texture>(layer.texture)] as const,
    ),
  );
  return new Map(pairs);
}

export function createProjectScene(
  project: CodeAnimationProject,
  textures: Map<string, Texture>,
): ProjectScene {
  const root = new Container();
  const layers = project.layers.map((layer) => {
    const texture = textures.get(layer.id);
    if (!texture) {
      throw new Error(`Missing texture for layer "${layer.id}".`);
    }
    return createLayer(layer, texture);
  });

  for (const layer of layers) {
    root.addChild(layer.container);
  }

  bindLayerMasks(layers);
  return { root, layers };
}

export class AgentAnimationPlayer {
  readonly root = new Container();

  private scene: ProjectScene | null = null;
  private timeline: gsap.core.Timeline | null = null;
  private loop = true;

  constructor(private readonly app: Application) {
    this.app.stage.addChild(this.root);
  }

  async load(project: CodeAnimationProject) {
    this.clear();
    const textures = await loadProjectTextures(project);
    this.scene = createProjectScene(project, textures);
    this.root.addChild(this.scene.root);
    this.timeline = buildProjectTimeline(project, this.scene.layers);
    this.timeline.repeat(this.loop ? -1 : 0);
    this.timeline.play(0);
  }

  play() {
    this.timeline?.play();
  }

  pause() {
    this.timeline?.pause();
  }

  replay() {
    if (!this.timeline) {
      return;
    }
    this.timeline.restart();
  }

  setLoop(loop: boolean) {
    this.loop = loop;
    this.timeline?.repeat(loop ? -1 : 0);
  }

  clear() {
    this.timeline?.kill();
    this.timeline = null;
    this.scene?.root.destroy({ children: true });
    this.scene = null;
    this.root.removeChildren();
  }
}

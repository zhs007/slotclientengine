import type { Application, Container } from "pixi.js";

export interface PixiAnimationInstance {
  root: Container;
  play(): void;
  pause(): void;
  replay(): void;
  setLoop(loop: boolean): void;
  destroy(): void;
}

export interface PixiAnimationModule {
  id: string;
  label: string;
  duration: number;
  create(app: Application): Promise<PixiAnimationInstance>;
}

export type AnimationStatus = "ready" | "todo";

export interface PixiAnimationRegistryEntry {
  id: string;
  label: string;
  status: AnimationStatus;
  module?: PixiAnimationModule;
}

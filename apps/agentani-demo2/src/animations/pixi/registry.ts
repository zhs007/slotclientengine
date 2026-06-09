import { bgAnimation } from "./bg.js";
import type { PixiAnimationRegistryEntry } from "./types.js";

export const animationRegistry: PixiAnimationRegistryEntry[] = [
  { id: "bg", label: "bg", status: "ready", module: bgAnimation },
  { id: "fang", label: "fang", status: "todo" },
  { id: "heart", label: "heart", status: "todo" },
  { id: "mei", label: "mei", status: "todo" },
  { id: "tao", label: "tao", status: "todo" },
  { id: "beach", label: "海滩", status: "todo" },
  { id: "bamboo1", label: "竹子1", status: "todo" },
];

export function getAnimationEntry(id: string) {
  return animationRegistry.find((entry) => entry.id === id) ?? null;
}

export function getReadyAnimation(id: string) {
  const entry = getAnimationEntry(id);
  return entry?.status === "ready" && entry.module ? entry : null;
}

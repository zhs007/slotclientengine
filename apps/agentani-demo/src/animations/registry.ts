import { bgProject } from "./bg.js";
import type { AnimationRegistryEntry } from "./types.js";

export const animationRegistry = [
  {
    id: "bg",
    label: "bg",
    status: "ready",
    project: bgProject,
  },
  { id: "fang", label: "fang", status: "todo" },
  { id: "heart", label: "heart", status: "todo" },
  { id: "mei", label: "mei", status: "todo" },
  { id: "tao", label: "tao", status: "todo" },
  { id: "海滩", label: "海滩", status: "todo" },
  { id: "竹子1", label: "竹子1", status: "todo" },
] satisfies AnimationRegistryEntry[];

export function getReadyAnimation(id: string) {
  const entry = animationRegistry.find((candidate) => candidate.id === id);
  return entry?.status === "ready" ? entry : undefined;
}

import { bamboo1Project } from "./bamboo1.js";
import { beachProject } from "./beach.js";
import { bgProject } from "./bg.js";
import { fangProject } from "./fang.js";
import { heartProject } from "./heart.js";
import { meiProject } from "./mei.js";
import { taoProject } from "./tao.js";
import type { AnimationRegistryEntry } from "./types.js";

export const animationRegistry = [
  {
    id: "bg",
    label: "bg",
    status: "ready",
    project: bgProject,
  },
  { id: "fang", label: "fang", status: "ready", project: fangProject },
  { id: "heart", label: "heart", status: "ready", project: heartProject },
  { id: "mei", label: "mei", status: "ready", project: meiProject },
  { id: "tao", label: "tao", status: "ready", project: taoProject },
  { id: "海滩", label: "海滩", status: "ready", project: beachProject },
  { id: "竹子1", label: "竹子1", status: "ready", project: bamboo1Project },
] satisfies AnimationRegistryEntry[];

export function getReadyAnimation(id: string) {
  const entry = animationRegistry.find((candidate) => candidate.id === id);
  return entry?.status === "ready" ? entry : undefined;
}

import type { CodeBlendMode } from "../animations/types.js";

export function mapBlendMode(mode: CodeBlendMode | string) {
  switch (mode) {
    case "add":
      return "add";
    case "multiply":
      return "multiply";
    case "screen":
      return "screen";
    case "normal":
    default:
      return "normal";
  }
}

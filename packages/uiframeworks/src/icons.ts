import {
  CircleDot,
  Menu,
  Minus,
  Plus,
  RefreshCw,
  Volume2,
  VolumeOff,
  Zap,
  createElement as createLucideElement,
} from "lucide";
import { SlotUiConfigError } from "./errors.js";

const SLOT_ICON_NODES = Object.freeze({
  menu: Menu,
  volume: Volume2,
  "volume-off": VolumeOff,
  "refresh-cw": RefreshCw,
  plus: Plus,
  minus: Minus,
  "circle-dot": CircleDot,
  zap: Zap,
});

export type SlotUiIconName = keyof typeof SLOT_ICON_NODES;

export function createSlotIcon(name: SlotUiIconName): SVGElement {
  const iconNode = SLOT_ICON_NODES[name];
  if (!iconNode) {
    throw new SlotUiConfigError(`Unknown slot UI icon: ${String(name)}.`);
  }

  const icon = createLucideElement(iconNode, {
    width: "24",
    height: "24",
    stroke: "currentColor",
    fill: "none",
    "stroke-width": "2.4",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });
  icon.classList.add("slot-ui-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  return icon;
}

import type { Container } from "pixi.js";
import type { RenderObject } from "../presentation/render-object.js";
import type {
  PopupPreparedObject,
  PopupStringNodeHandle,
  PopupStringNodeSelector,
  SingleStatePopupRuntime,
} from "./core/types.js";
import { createSingleStatePopupRuntime } from "./single-state-player.js";

export interface PopupObjectInstanceHandle {
  readonly name: string;
  readonly container: Container;
  readonly textNodes: readonly PopupStringNodeHandle[];
  readonly imageStringNodes: readonly PopupStringNodeHandle[];
  getLayer(name: string): RenderObject;
  getTextNode(selector: PopupStringNodeSelector): PopupStringNodeHandle;
  getImageStringNode(selector: PopupStringNodeSelector): PopupStringNodeHandle;
}

export interface PopupObjectInstanceRuntime {
  readonly container: Container;
  readonly handle: PopupObjectInstanceHandle;
  init(): Promise<void>;
  setActive(active: boolean): void;
  update(deltaSeconds: number): void;
  destroy(): void;
}

export function createPopupObjectInstanceRuntime(options: {
  readonly resource: PopupPreparedObject;
}): PopupObjectInstanceRuntime {
  const runtime = createSingleStatePopupRuntime({
    resource: options.resource.resource,
  });
  let initialized = false;
  let destroyed = false;
  const assertUsable = () => {
    if (destroyed) throw new Error("Popup object instance was destroyed.");
  };
  const handle: PopupObjectInstanceHandle = Object.freeze({
    name: options.resource.manifest.name,
    container: runtime.container,
    get textNodes() {
      assertUsable();
      return runtime.textNodes;
    },
    get imageStringNodes() {
      assertUsable();
      return runtime.imageStringNodes;
    },
    getLayer(name: string) {
      assertUsable();
      return runtime.getLayer(name);
    },
    getTextNode(selector: PopupStringNodeSelector) {
      assertUsable();
      return runtime.getTextNode(selector);
    },
    getImageStringNode(selector: PopupStringNodeSelector) {
      assertUsable();
      return runtime.getImageStringNode(selector);
    },
  });
  return {
    container: runtime.container,
    handle,
    async init() {
      assertUsable();
      if (initialized) return;
      await runtime.init();
      initialized = true;
    },
    setActive(active) {
      assertReady(runtime, initialized);
      if (active === runtime.isPlaying()) return;
      if (active) runtime.start();
      else runtime.dismissImmediately();
    },
    update(deltaSeconds) {
      assertReady(runtime, initialized);
      runtime.update(deltaSeconds);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      runtime.destroy();
    },
  };
}

function assertReady(
  _runtime: SingleStatePopupRuntime,
  initialized: boolean,
): void {
  if (!initialized)
    throw new Error("Popup object instance init() must complete before use.");
}

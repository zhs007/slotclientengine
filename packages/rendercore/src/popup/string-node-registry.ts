import { validateImageStringText } from "../image-string/data/index.js";
import { validatePopupStyledText } from "./styled-text.js";
import type {
  PopupStringNodeHandle,
  PopupStringNodeSelector,
} from "./types.js";

export interface PopupStringNodeTarget {
  setText(text: string): void;
}

export interface PopupStringNodeDefinition {
  readonly kind: "text" | "image-string";
  readonly name: string;
  readonly defaultText: string;
}

export interface PopupStringNodeRegistry {
  readonly textNodes: readonly PopupStringNodeHandle[];
  readonly imageStringNodes: readonly PopupStringNodeHandle[];
  getTextNode(selector: PopupStringNodeSelector): PopupStringNodeHandle;
  getImageStringNode(selector: PopupStringNodeSelector): PopupStringNodeHandle;
  setTarget(name: string, target: PopupStringNodeTarget | null): void;
  setAutomaticText(name: string, text: string): void;
  destroy(): void;
}

export function createPopupStringNodeRegistry(
  definitions: readonly PopupStringNodeDefinition[],
): PopupStringNodeRegistry {
  const names = new Set<string>();
  const entries = definitions.map((definition) => {
    if (names.has(definition.name))
      throw new Error(`popup string node name duplicated: ${definition.name}.`);
    names.add(definition.name);
    return {
      ...definition,
      automaticText: validate(definition.kind, definition.defaultText),
      override: null as string | null,
      target: null as PopupStringNodeTarget | null,
      handle: null as PopupStringNodeHandle | null,
    };
  });
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  let destroyed = false;
  const makeHandles = (kind: "text" | "image-string") =>
    entries
      .filter((entry) => entry.kind === kind)
      .map((entry, index) => {
        const handle: PopupStringNodeHandle = Object.freeze({
          kind,
          name: entry.name,
          index,
          get text() {
            assertUsable();
            return entry.override ?? entry.automaticText;
          },
          get overridden() {
            assertUsable();
            return entry.override !== null;
          },
          setText(text: string) {
            assertUsable();
            const validated = validate(kind, text);
            entry.target?.setText(validated);
            entry.override = validated;
          },
          resetText() {
            assertUsable();
            entry.target?.setText(entry.automaticText);
            entry.override = null;
          },
        });
        entry.handle = handle;
        return handle;
      });
  const textNodes = Object.freeze(makeHandles("text"));
  const imageStringNodes = Object.freeze(makeHandles("image-string"));

  return Object.freeze({
    textNodes,
    imageStringNodes,
    getTextNode(selector: PopupStringNodeSelector) {
      assertUsable();
      return select(textNodes, selector, "text");
    },
    getImageStringNode(selector: PopupStringNodeSelector) {
      assertUsable();
      return select(imageStringNodes, selector, "image-string");
    },
    setTarget(name: string, target: PopupStringNodeTarget | null) {
      assertUsable();
      const entry = byName.get(name);
      if (!entry) throw new Error(`popup string node not found: ${name}.`);
      if (target) target.setText(entry.override ?? entry.automaticText);
      entry.target = target;
    },
    setAutomaticText(name: string, text: string) {
      assertUsable();
      const entry = byName.get(name);
      if (!entry) throw new Error(`popup string node not found: ${name}.`);
      const validated = validate(entry.kind, text);
      if (entry.override === null) entry.target?.setText(validated);
      entry.automaticText = validated;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const entry of entries) entry.target = null;
    },
  });

  function assertUsable() {
    if (destroyed) throw new Error("popup string node registry was destroyed.");
  }
}

function select(
  handles: readonly PopupStringNodeHandle[],
  selector: PopupStringNodeSelector,
  kind: "text" | "image-string",
): PopupStringNodeHandle {
  if (typeof selector === "number") {
    if (
      !Number.isSafeInteger(selector) ||
      selector < 0 ||
      selector >= handles.length
    )
      throw new Error(`popup ${kind} node index out of range: ${selector}.`);
    return handles[selector]!;
  }
  const handle = handles.find(({ name }) => name === selector);
  if (!handle) throw new Error(`popup ${kind} node not found: ${selector}.`);
  return handle;
}

function validate(kind: "text" | "image-string", text: string): string {
  if (kind === "text") return validatePopupStyledText(text);
  validateImageStringText(text);
  return text;
}

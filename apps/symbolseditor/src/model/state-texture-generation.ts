import { extensionOfEditorAssetKey } from "@slotclientengine/editorresource";
import {
  generateSymbolStateTextureRgba,
  type GeneratedSymbolStateTextureId,
  type SymbolStateTexturePixels,
} from "@slotclientengine/rendercore/symbol/editor";
import {
  addSymbolState,
  moveSymbolState,
  setStateVisual,
  type SymbolEditorProject,
} from "./editor-project.js";

export interface StateTextureGenerationCodec {
  readonly decode: (bytes: Uint8Array) => Promise<SymbolStateTexturePixels>;
  readonly encodePng: (pixels: SymbolStateTexturePixels) => Promise<Uint8Array>;
}

export type StateTextureGenerationAvailability =
  | {
      readonly ready: true;
      readonly normalPath: string;
      readonly targetKey: string;
    }
  | { readonly ready: false; readonly reason: string };

export function getStateTextureGenerationAvailability(
  project: SymbolEditorProject,
  symbolName: string,
  state: GeneratedSymbolStateTextureId,
): StateTextureGenerationAvailability {
  const symbol = project.symbols.get(symbolName);
  if (!symbol) return { ready: false, reason: `未知 symbol：${symbolName}。` };
  if (symbol.valuePresentation)
    return {
      ready: false,
      reason: "Spine tier normal 没有唯一的 direct normal 图片。",
    };
  const normal = symbol.states.get("normal");
  const normalImagePath =
    normal?.kind === "image"
      ? normal.imagePath
      : (normal?.kind === "spine" || normal?.kind === "vni") &&
          normal.baseVisual?.kind === "image"
        ? normal.baseVisual.imagePath
        : undefined;
  if (normalImagePath === undefined)
    return {
      ready: false,
      reason:
        "只有 direct normal image 或 Spine/VNI normal 的 image base visual 可以生成状态贴图。",
    };
  if (!normalImagePath)
    return { ready: false, reason: "normal 尚未绑定图片。" };
  const record = project.assetLibrary.records.get(normalImagePath);
  if (record?.kind !== "image")
    return {
      ready: false,
      reason: `normal 图片资源不存在或类型错误：${normalImagePath}。`,
    };
  if (record.diagnostics.length)
    return {
      ready: false,
      reason: `normal 图片无效：${record.diagnostics.join("；")}。`,
    };
  return Object.freeze({
    ready: true,
    normalPath: normalImagePath,
    targetKey: generatedStateTextureKey(normalImagePath, state),
  });
}

export async function generateStateTextureImportSource(options: {
  readonly project: SymbolEditorProject;
  readonly symbol: string;
  readonly state: GeneratedSymbolStateTextureId;
  readonly codec: StateTextureGenerationCodec;
}): Promise<{ readonly key: string; readonly bytes: Uint8Array }> {
  const availability = getStateTextureGenerationAvailability(
    options.project,
    options.symbol,
    options.state,
  );
  if (!availability.ready) throw new Error(availability.reason);
  const record = options.project.assetLibrary.records.get(
    availability.normalPath,
  )!;
  const decoded = await options.codec.decode(record.bytes);
  const generated = generateSymbolStateTextureRgba({
    state: options.state,
    width: decoded.width,
    height: decoded.height,
    data: decoded.data,
  });
  const bytes = await options.codec.encodePng(generated);
  return Object.freeze({ key: availability.targetKey, bytes: bytes.slice() });
}

export function applyStateTextureImageBinding(
  project: SymbolEditorProject,
  symbolName: string,
  state: GeneratedSymbolStateTextureId,
  path: string,
): void {
  const symbol = project.symbols.get(symbolName);
  if (!symbol) throw new Error(`未知 symbol：${symbolName}。`);
  const record = project.assetLibrary.records.get(path);
  if (record?.kind !== "image" || record.diagnostics.length)
    throw new Error(`state texture 不是 ready image：${path}。`);
  const added = !symbol.states.has(state);
  if (added) addSymbolState(project, symbolName, state);
  setStateVisual(project, symbolName, state, {
    kind: "image",
    imagePath: path,
  });
  if (added) placeStateByDefinitionOrder(project, symbolName, state);
}

export function isGeneratedStateTextureId(
  value: string,
): value is GeneratedSymbolStateTextureId {
  return value === "spinBlur" || value === "disabled";
}

function generatedStateTextureKey(
  normalPath: string,
  state: GeneratedSymbolStateTextureId,
): string {
  const extension = extensionOfEditorAssetKey(normalPath);
  const stem = normalPath.slice(0, -(extension.length + 1));
  return `${stem}.${state}.png`;
}

function placeStateByDefinitionOrder(
  project: SymbolEditorProject,
  symbolName: string,
  state: GeneratedSymbolStateTextureId,
): void {
  const symbol = project.symbols.get(symbolName)!;
  const definitionOrder = new Map(
    project.stateDefinitions.map((definition, index) => [definition.id, index]),
  );
  const targetOrder = definitionOrder.get(state)!;
  const withoutTarget = symbol.stateOrder.filter(
    (candidate) => candidate !== state,
  );
  const laterIndex = withoutTarget.findIndex(
    (candidate, index) =>
      index > 0 && (definitionOrder.get(candidate) ?? Infinity) > targetOrder,
  );
  const desiredIndex = laterIndex < 0 ? withoutTarget.length : laterIndex;
  while (symbol.stateOrder.indexOf(state) > desiredIndex)
    moveSymbolState(project, symbolName, state, -1);
}

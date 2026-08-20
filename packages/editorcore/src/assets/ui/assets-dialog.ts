import {
  mountEditorAssetsView,
  type EditorAssetsView,
  type MountEditorAssetsViewOptions,
} from "./assets-view.js";

export interface EditorAssetsDialog {
  readonly element: HTMLDialogElement;
  readonly trigger: HTMLButtonElement;
  open(): void;
  close(): void;
  destroy(): void;
}

export interface MountEditorAssetsDialogOptions<TProject> extends Omit<
  MountEditorAssetsViewOptions<TProject>,
  "root"
> {
  readonly root: HTMLElement;
  readonly triggerLabel?: string;
}

export function mountEditorAssetsDialog<TProject>(
  options: MountEditorAssetsDialogOptions<TProject>,
): EditorAssetsDialog {
  let destroyed = false;
  options.root.classList.add("editor-assets-dialog-host");
  options.root.innerHTML = `<button class="editor-assets-dialog-trigger" type="button">${escapeHtml(options.triggerLabel ?? "Assets 管理")}</button>
    <dialog class="editor-assets-dialog" aria-label="${escapeHtml(options.title ?? "Assets")}">
      <div class="editor-assets-dialog-frame">
        <div class="editor-assets-dialog-bar"><strong>${escapeHtml(options.title ?? "Assets")}</strong><button type="button" data-assets-dialog-close aria-label="关闭 Assets">关闭</button></div>
        <div class="editor-assets-dialog-content"></div>
      </div>
    </dialog>`;
  const trigger = required<HTMLButtonElement>(
    options.root,
    ".editor-assets-dialog-trigger",
  );
  const element = required<HTMLDialogElement>(
    options.root,
    ".editor-assets-dialog",
  );
  const content = required<HTMLElement>(
    element,
    ".editor-assets-dialog-content",
  );
  const closeButton = required<HTMLButtonElement>(
    element,
    "[data-assets-dialog-close]",
  );
  const view: EditorAssetsView = mountEditorAssetsView({
    ...options,
    root: content,
  });
  view.setActive(false);

  const open = () => {
    if (destroyed) throw new Error("EditorAssetsDialog 已销毁。");
    view.setActive(true);
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    closeButton.focus();
  };
  const close = () => {
    if (destroyed) return;
    view.setActive(false);
    if (typeof element.close === "function" && element.open) element.close();
    else element.removeAttribute("open");
    trigger.focus();
  };
  const onCancel = (event: Event) => {
    event.preventDefault();
    close();
  };
  trigger.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  element.addEventListener("cancel", onCancel);

  return Object.freeze({
    element,
    trigger,
    open,
    close,
    destroy() {
      if (destroyed) return;
      close();
      destroyed = true;
      trigger.removeEventListener("click", open);
      closeButton.removeEventListener("click", close);
      element.removeEventListener("cancel", onCancel);
      view.destroy();
      options.root.replaceChildren();
      options.root.classList.remove("editor-assets-dialog-host");
    },
  });
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`EditorAssetsDialog 缺少元素：${selector}`);
  return element;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

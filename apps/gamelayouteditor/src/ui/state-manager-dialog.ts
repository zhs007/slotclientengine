import {
  activeVariantIds,
  type EditorProject,
} from "../model/editor-project.js";
import { escapeHtml } from "./ui-markup.js";

export interface StateManagerDialogOptions {
  readonly project: EditorProject;
  readonly selectedModeId: string;
  readonly newModeId: string;
  readonly renameModeId: string;
  readonly feedback: string;
}

export function normalizeStateManagerSelection(
  project: EditorProject,
  selectedModeId: string,
): string {
  return project.gameModes.modes.some((mode) => mode.id === selectedModeId)
    ? selectedModeId
    : project.gameModes.initialMode;
}

export function stateManagerDialogMarkup(
  options: StateManagerDialogOptions,
): string {
  const selectedModeId = normalizeStateManagerSelection(
    options.project,
    options.selectedModeId,
  );
  const selected = options.project.gameModes.modes.find(
    (mode) => mode.id === selectedModeId,
  )!;
  const deleteReason =
    options.project.gameModes.modes.length === 1
      ? "layout 至少必须保留一个游戏模式。"
      : selectedModeId === options.project.gameModes.initialMode
        ? "删除 initial mode 前必须先选择其它 initial mode。"
        : "";

  const rows = options.project.gameModes.modes
    .map((mode) => {
      const initial = mode.id === options.project.gameModes.initialMode;
      const complete = activeVariantIds(options.project).every((variant) => {
        const nodeId = mode.backgroundNodes[variant];
        return Boolean(
          nodeId && options.project.nodes.some((node) => node.id === nodeId),
        );
      });
      return `<button type="button" role="option" data-select-game-mode="${escapeHtml(mode.id)}" aria-selected="${mode.id === selectedModeId}"><span>${escapeHtml(mode.id)}</span><small>${initial ? '<span class="mode-badge">initial</span>' : ""}<span class="mode-readiness ${complete ? "ready" : "incomplete"}">${complete ? "ready" : "incomplete"}</span></small></button>`;
    })
    .join("");

  return `<section class="state-manager"><h2>管理主状态</h2>
    <div class="state-manager-list" role="listbox" aria-label="项目主状态">${rows}</div>
    <div class="state-manager-create"><label>新状态 id<input data-new-game-mode value="${escapeHtml(options.newModeId)}" /></label><button type="button" data-add-game-mode>新建</button></div>
    <p class="state-manager-selected">选中状态：<strong>${escapeHtml(selected.id)}</strong></p>
    <label>重命名为<input data-rename-game-mode-input value="${escapeHtml(options.renameModeId)}" /></label>
    <div class="button-row"><button type="button" data-rename-game-mode>重命名</button><button type="button" data-set-initial-mode ${selectedModeId === options.project.gameModes.initialMode ? "disabled" : ""}>设为 initial</button><button type="button" class="danger" data-delete-game-mode ${deleteReason ? "disabled" : ""}>删除</button></div>
    <output class="state-manager-feedback" data-mode-dialog-feedback aria-live="polite">${escapeHtml([options.feedback, deleteReason].filter(Boolean).join(" · "))}</output>
    <div class="button-row state-manager-footer"><button type="button" data-close-mode-dialog>完成</button></div>
  </section>`;
}

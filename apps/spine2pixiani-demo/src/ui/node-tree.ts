import type { DebugTreeNode } from "../runtime/debug-tree.js";

export type NodeTreePanel = {
  root: HTMLElement;
  setNodes: (nodes: DebugTreeNode[]) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setOnSelect: (handler: (nodeId: string) => void) => void;
};

export function createNodeTreePanel(): NodeTreePanel {
  const root = document.createElement("aside");
  root.className = "panel tree-panel";

  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Scene Graph";

  const title = document.createElement("h2");
  title.className = "tree-title";
  title.textContent = "Node Tree";

  const description = document.createElement("p");
  description.textContent = "骨骼层级和插槽归属直接从 SpineModel 派生，用来定位错位、缺图和挂点问题。";

  const list = document.createElement("div");
  list.className = "tree-list";

  root.append(eyebrow, title, description, list);

  let nodes: DebugTreeNode[] = [];
  let selectedNodeId: string | null = null;
  let onSelect = (_nodeId: string) => {};

  const render = () => {
    list.replaceChildren();

    if (nodes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.textContent = "No debug nodes available.";
      list.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const node of nodes) {
      appendNode(fragment, node, 0);
    }
    list.appendChild(fragment);
  };

  const appendNode = (container: ParentNode, node: DebugTreeNode, depth: number) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tree-node";
    button.style.setProperty("--depth", `${depth}`);
    if (node.id === selectedNodeId) {
      button.classList.add("is-selected");
    }
    button.addEventListener("click", () => onSelect(node.id));

    const badge = document.createElement("span");
    badge.className = `tree-badge tree-badge-${node.type}`;
    badge.textContent = node.type;

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = node.name;

    button.append(badge, label);

    if (node.type === "bone" && (node.meta.slotCount ?? 0) > 0) {
      const meta = document.createElement("span");
      meta.className = "tree-meta";
      meta.textContent = `${node.meta.slotCount} slot${node.meta.slotCount === 1 ? "" : "s"}`;
      button.appendChild(meta);
    }

    if (node.type === "slot" && node.meta.boneName) {
      const meta = document.createElement("span");
      meta.className = "tree-meta";
      meta.textContent = `@ ${node.meta.boneName}`;
      button.appendChild(meta);
    }

    container.appendChild(button);

    for (const child of node.children) {
      appendNode(container, child, depth + 1);
    }
  };

  return {
    root,
    setNodes(nextNodes) {
      nodes = nextNodes;
      render();
    },
    setSelectedNodeId(nodeId) {
      selectedNodeId = nodeId;
      render();
    },
    setOnSelect(handler) {
      onSelect = handler;
      render();
    }
  };
}
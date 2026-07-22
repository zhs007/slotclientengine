import "./styles.css";
import { createImageStringAppShell } from "./ui/app-shell.js";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("缺少 #app 根节点。");
createImageStringAppShell(root);

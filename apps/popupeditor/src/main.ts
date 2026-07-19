import "./styles.css";
import { PopupEditorApp } from "./ui/app-shell.js";
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("popupeditor root #app missing.");
const app = new PopupEditorApp(root);
await app.init();
window.addEventListener("beforeunload", () => app.destroy(), { once: true });

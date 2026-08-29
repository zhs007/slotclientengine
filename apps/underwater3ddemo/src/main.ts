import { UnderwaterRenderer } from "./underwater-scene.js";
import "./styles.css";

function bootstrap(): void {
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app root.");
  const scene = new UnderwaterRenderer(root);
  const resize = () => scene.resize(root.clientWidth, root.clientHeight);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  resize();
  window.addEventListener(
    "beforeunload",
    () => {
      resizeObserver.disconnect();
      scene.destroy();
    },
    { once: true },
  );
}

try {
  bootstrap();
} catch (error) {
  console.error("underwater3ddemo bootstrap failed", error);
  const root = document.getElementById("app");
  if (root) {
    const message = document.createElement("pre");
    message.className = "fatal-error";
    message.textContent =
      error instanceof Error ? error.message : String(error);
    root.replaceChildren(message);
  }
}

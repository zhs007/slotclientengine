import { afterEach } from "vitest";

let objectUrl = 0;
URL.createObjectURL = () => `blob:editorcore-${objectUrl++}`;
URL.revokeObjectURL = () => undefined;

afterEach(() => document.body.replaceChildren());

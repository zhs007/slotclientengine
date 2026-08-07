export type PopupInteractionDispatchResult =
  | { readonly handled: false }
  | {
      readonly handled: true;
      readonly completion?: Promise<void>;
    };

export interface PopupInteractionInputBindingOptions {
  readonly canvas: EventTarget;
  readonly keyboardTarget: EventTarget;
  readonly dispatch: () => PopupInteractionDispatchResult;
  readonly onError: (error: unknown) => void;
}

const UNHANDLED: PopupInteractionDispatchResult = Object.freeze({
  handled: false,
});

export function unhandledPopupInteraction(): PopupInteractionDispatchResult {
  return UNHANDLED;
}

export function handledPopupInteraction(
  completion?: Promise<void>,
): PopupInteractionDispatchResult {
  return Object.freeze({
    handled: true,
    ...(completion ? { completion } : {}),
  });
}

export function bindPopupInteractionInput(
  options: PopupInteractionInputBindingOptions,
): () => void {
  let disposed = false;
  const reportError = (error: unknown) => {
    try {
      options.onError(error);
    } catch {
      // Reporting must not create an unhandled rejection from a handled
      // interaction completion.
    }
  };
  const handle = (event: Event) => {
    if (event.type === "keydown" && "repeat" in event && event.repeat === true)
      return;
    let result: PopupInteractionDispatchResult;
    try {
      result = options.dispatch();
    } catch (error) {
      reportError(error);
      return;
    }
    if (!result.handled) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    if (result.completion) void result.completion.catch(reportError);
  };
  options.canvas.addEventListener("pointerdown", handle, { capture: true });
  options.keyboardTarget.addEventListener("keydown", handle, {
    capture: true,
  });
  return () => {
    if (disposed) return;
    disposed = true;
    options.canvas.removeEventListener("pointerdown", handle, {
      capture: true,
    });
    options.keyboardTarget.removeEventListener("keydown", handle, {
      capture: true,
    });
  };
}

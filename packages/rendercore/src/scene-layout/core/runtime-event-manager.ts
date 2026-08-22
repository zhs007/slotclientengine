import { SceneLayoutError } from "../errors.js";
import type { GameLayoutRuntimeAddress } from "../data/runtime-address.js";
import type {
  GameLayoutRuntimeEvent,
  GameLayoutRuntimeEventListener,
  GameLayoutRuntimeWaitOptions,
} from "./runtime-address.js";

type EventDetail = GameLayoutRuntimeEvent["detail"];

interface EventSubscription {
  readonly registrationSequence: number;
  readonly address: GameLayoutRuntimeAddress;
  readonly listener?: GameLayoutRuntimeEventListener;
  readonly resolve?: (event: GameLayoutRuntimeEvent) => void;
  readonly reject?: (error: Error) => void;
  readonly signal?: AbortSignal;
  abortListener?: () => void;
  readonly bucket: Set<EventSubscription>;
  active: boolean;
}

export interface RuntimeEventAddressMetadata {
  /** Static events contain themselves; exact symbol events contain four
   * precompiled exact/wildcard subscription addresses. */
  readonly dispatchAddresses: readonly GameLayoutRuntimeAddress[];
  readonly interestGroup?: string;
}

export interface RuntimeEventManagerOptions {
  readonly metadata: ReadonlyMap<
    GameLayoutRuntimeAddress,
    RuntimeEventAddressMetadata
  >;
}

export interface RuntimeEventManager {
  bind(
    address: GameLayoutRuntimeAddress,
    listener: GameLayoutRuntimeEventListener,
  ): () => void;
  wait(
    address: GameLayoutRuntimeAddress,
    options?: GameLayoutRuntimeWaitOptions,
  ): Promise<GameLayoutRuntimeEvent>;
  hasInterest(address: GameLayoutRuntimeAddress): boolean;
  hasGroupInterest(group: string): boolean;
  emit(
    address: GameLayoutRuntimeAddress,
    detail?: EventDetail | (() => EventDetail),
  ): void;
  destroy(): void;
}

export function createRuntimeEventManager(
  options: RuntimeEventManagerOptions,
): RuntimeEventManager {
  const buckets = new Map<GameLayoutRuntimeAddress, Set<EventSubscription>>();
  const interestCounts = new Map<GameLayoutRuntimeAddress, number>();
  const groupInterestCounts = new Map<string, number>();
  let eventSequence = 0;
  let registrationSequence = 0;
  let destroyed = false;

  const requireMetadata = (
    address: GameLayoutRuntimeAddress,
  ): RuntimeEventAddressMetadata => {
    if (destroyed)
      throw new SceneLayoutError(
        "Game Layout runtime event manager is destroyed.",
      );
    const metadata = options.metadata.get(address);
    if (!metadata)
      throw new SceneLayoutError(
        `Game Layout runtime address is not an event: ${address}.`,
      );
    return metadata;
  };

  const incrementInterest = (address: GameLayoutRuntimeAddress): void => {
    interestCounts.set(address, (interestCounts.get(address) ?? 0) + 1);
    const group = options.metadata.get(address)?.interestGroup;
    if (group)
      groupInterestCounts.set(group, (groupInterestCounts.get(group) ?? 0) + 1);
  };
  const decrementInterest = (address: GameLayoutRuntimeAddress): void => {
    const next = (interestCounts.get(address) ?? 1) - 1;
    if (next <= 0) interestCounts.delete(address);
    else interestCounts.set(address, next);
    const group = options.metadata.get(address)?.interestGroup;
    if (group) {
      const groupNext = (groupInterestCounts.get(group) ?? 1) - 1;
      if (groupNext <= 0) groupInterestCounts.delete(group);
      else groupInterestCounts.set(group, groupNext);
    }
  };
  const dispose = (subscription: EventSubscription): void => {
    if (!subscription.active) return;
    subscription.active = false;
    subscription.bucket.delete(subscription);
    subscription.signal?.removeEventListener(
      "abort",
      subscription.abortListener!,
    );
    decrementInterest(subscription.address);
  };
  const addSubscription = (
    address: GameLayoutRuntimeAddress,
    fields: Pick<EventSubscription, "listener" | "resolve" | "reject"> & {
      readonly signal?: AbortSignal;
    },
  ): EventSubscription => {
    const bucket = buckets.get(address) ?? new Set<EventSubscription>();
    buckets.set(address, bucket);
    const subscription: EventSubscription = {
      registrationSequence: ++registrationSequence,
      address,
      ...fields,
      bucket,
      active: true,
    };
    if (fields.signal) {
      subscription.abortListener = () => {
        dispose(subscription);
        fields.reject?.(abortError());
      };
      fields.signal.addEventListener("abort", subscription.abortListener, {
        once: true,
      });
    }
    bucket.add(subscription);
    incrementInterest(address);
    return subscription;
  };

  return Object.freeze({
    bind(
      address: GameLayoutRuntimeAddress,
      listener: GameLayoutRuntimeEventListener,
    ) {
      if (typeof listener !== "function")
        throw new SceneLayoutError(
          `Game Layout runtime event listener must be a function: ${address}.`,
        );
      requireMetadata(address);
      const subscription = addSubscription(address, { listener });
      return () => dispose(subscription);
    },
    wait(
      address: GameLayoutRuntimeAddress,
      waitOptions: GameLayoutRuntimeWaitOptions = {},
    ) {
      requireMetadata(address);
      if (waitOptions.signal?.aborted) return Promise.reject(abortError());
      return new Promise<GameLayoutRuntimeEvent>((resolve, reject) => {
        addSubscription(address, {
          resolve,
          reject,
          ...(waitOptions.signal ? { signal: waitOptions.signal } : {}),
        });
      });
    },
    hasInterest(address: GameLayoutRuntimeAddress) {
      if (destroyed) return false;
      const metadata = options.metadata.get(address);
      if (!metadata) return false;
      return metadata.dispatchAddresses.some(
        (candidate) => (interestCounts.get(candidate) ?? 0) > 0,
      );
    },
    hasGroupInterest(group: string) {
      return !destroyed && (groupInterestCounts.get(group) ?? 0) > 0;
    },
    emit(
      address: GameLayoutRuntimeAddress,
      detailValue: EventDetail | (() => EventDetail) = EMPTY_DETAIL,
    ) {
      if (destroyed) return;
      const metadata = options.metadata.get(address);
      if (!metadata) return;
      const sequence = ++eventSequence;
      const subscriptions: EventSubscription[] = [];
      for (const candidate of metadata.dispatchAddresses)
        for (const subscription of buckets.get(candidate) ?? [])
          subscriptions.push(subscription);
      if (subscriptions.length === 0) return;
      const detail =
        typeof detailValue === "function" ? detailValue() : detailValue;
      const occurrence = Object.freeze({
        address,
        sequence,
        detail: Object.freeze({ ...detail }),
      }) satisfies GameLayoutRuntimeEvent;
      subscriptions.sort(
        (left, right) => left.registrationSequence - right.registrationSequence,
      );
      for (const subscription of subscriptions)
        if (subscription.active && subscription.resolve) {
          dispose(subscription);
          subscription.resolve(occurrence);
        }
      for (const subscription of subscriptions) {
        if (!subscription.active || !subscription.listener) continue;
        const result = (
          subscription.listener as unknown as (
            event: GameLayoutRuntimeEvent,
          ) => unknown
        )(occurrence);
        if (
          result &&
          typeof (result as { readonly then?: unknown }).then === "function"
        )
          throw new SceneLayoutError(
            "Game Layout runtime event listeners must be synchronous.",
          );
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      const error = new SceneLayoutError(
        "Game Layout runtime address resolver is destroyed.",
      );
      for (const bucket of buckets.values())
        rejectAndDisposeBucket(bucket, error);
      buckets.clear();
      interestCounts.clear();
      groupInterestCounts.clear();
    },
  });

  function rejectAndDisposeBucket(
    bucket: Set<EventSubscription>,
    error: Error,
  ): void {
    for (const subscription of [...bucket]) {
      subscription.active = false;
      subscription.signal?.removeEventListener(
        "abort",
        subscription.abortListener!,
      );
      subscription.reject?.(error);
    }
    bucket.clear();
  }
}

const EMPTY_DETAIL = Object.freeze({});

function abortError(): Error {
  return new DOMException(
    "Game Layout runtime event wait was aborted.",
    "AbortError",
  );
}

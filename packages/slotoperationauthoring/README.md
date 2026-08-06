# @slotclientengine/slotoperationauthoring

Renderer-free local authoring helpers for `SlotOperationPlanV2`.

The package compares explicit input/output snapshots, reports `exact`, `ambiguous`, or `unresolved`
suggestions, records manual edit evidence, and delegates strict immutable plan finalization to logiccore.
It does not read server rounds, connect to live sessions, or import rendercore.

V1 projects require the explicit `upgradeSlotOperationAuthoringProjectV1()` path. The upgrader preserves
snapshots, removes semantically ambiguous V1 drafts, and marks every edge `review: required`; it never
infers an effect from equal snapshots.

# @slotclientengine/slotoperationauthoring

Renderer-free local authoring helpers for `SlotOperationPlanV1`.

The package compares explicit input/output snapshots, reports `exact`, `ambiguous`, or `unresolved`
suggestions, records manual edit evidence, and delegates strict immutable plan finalization to logiccore.
It does not read server rounds, connect to live sessions, or import rendercore.

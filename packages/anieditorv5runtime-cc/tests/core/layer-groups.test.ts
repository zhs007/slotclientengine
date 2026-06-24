import { describe, expect, it } from "vitest";
import threeReelMultipay01Data from "../fixtures/3reel_multipay_01.json";
import threeReelMultipay02Data from "../fixtures/3reel_multipay_02.json";
import projectData from "../fixtures/project.json";
import {
  DEFAULT_VNI_LAYER_GROUP_ID,
  assertVNIAdjacentLayerGroupSlot,
  getVNIProjectLayerGroupSlots,
  getVNIProjectRenderGroupOrder,
  normalizeVNIProjectLayerGroups,
} from "../../src/core/layer-groups";
import {
  assertV5GProject,
  validateV5GProject,
} from "../../src/core/validation";
import type {
  V5GLayerGroupConfig,
  V5GProjectConfig,
} from "../../src/core/types";

function validProject(): V5GProjectConfig {
  return structuredClone(assertV5GProject(projectData));
}

function group(id: string, order: number): V5GLayerGroupConfig {
  return {
    id,
    name: id,
    visible: true,
    collapsed: false,
    order,
  };
}

describe("layer group helpers", () => {
  it("normalizes legacy exports only when the whole project has no group data", () => {
    const project = normalizeVNIProjectLayerGroups(
      assertV5GProject(projectData),
    );
    expect(project.layerGroups).toEqual([
      {
        id: DEFAULT_VNI_LAYER_GROUP_ID,
        name: "Default",
        visible: true,
        collapsed: false,
        order: 0,
      },
    ]);
    expect(
      project.layers.every((layer) => layer.groupId === "group_default"),
    ).toBe(true);

    const halfNew = structuredClone(projectData) as typeof projectData & {
      layers: Array<(typeof projectData.layers)[number] & { groupId?: string }>;
    };
    halfNew.layers[0].groupId = "custom";
    expect(() => assertV5GProject(halfNew)).toThrow(
      "has layer.groupId values but is missing project.layerGroups",
    );
  });

  it("derives render order from contiguous project.layers runs, not layerGroups.order", () => {
    const project = assertV5GProject(threeReelMultipay01Data);
    const groups = getVNIProjectRenderGroupOrder(project);
    expect(groups.map((renderGroup) => renderGroup.id)).toEqual([
      "layer_group_mqqo064b_4",
      "group_default",
    ]);
    expect(groups.map((renderGroup) => renderGroup.order)).toEqual([1, 0]);
    expect(getVNIProjectLayerGroupSlots(project)).toEqual([
      {
        afterGroupId: "layer_group_mqqo064b_4",
        afterGroupName: "下层光效",
        beforeGroupId: "group_default",
        beforeGroupName: "上层光效",
        renderIndex: 0,
      },
    ]);

    const project02 = assertV5GProject(threeReelMultipay02Data);
    expect(getVNIProjectLayerGroupSlots(project02)[0]).toMatchObject({
      afterGroupId: "layer_group_mqqo4zrn_6",
      beforeGroupId: "group_default",
    });
  });

  it("keeps collapsed and visible metadata from reordering or filtering runtime groups", () => {
    const project = assertV5GProject(threeReelMultipay02Data);
    project.layerGroups[0].visible = false;
    project.layerGroups[0].collapsed = true;
    const groups = getVNIProjectRenderGroupOrder(project);
    expect(groups.map((renderGroup) => renderGroup.id)).toEqual([
      "layer_group_mqqo4zrn_6",
      "group_default",
    ]);
    expect(groups[1]).toMatchObject({
      id: "group_default",
      visible: false,
      collapsed: true,
    });
  });

  it("rejects malformed group schema and non-contiguous group runs", () => {
    const emptyGroups = validProject();
    emptyGroups.layerGroups = [];
    expect(() => validateV5GProject(emptyGroups)).toThrow(
      "project.layerGroups must be a non-empty array",
    );

    const duplicateId = validProject();
    duplicateId.layerGroups = [group("a", 0), group("a", 1)];
    duplicateId.layers[0].groupId = "a";
    expect(() => validateV5GProject(duplicateId)).toThrow(
      "Duplicate VNI layer group id: a",
    );

    const duplicateOrder = validProject();
    duplicateOrder.layerGroups = [group("a", 0), group("b", 0)];
    duplicateOrder.layers[0].groupId = "a";
    expect(() => validateV5GProject(duplicateOrder)).toThrow(
      "Duplicate VNI layer group order: 0",
    );

    const missingGroupId = validProject();
    delete missingGroupId.layers[0].groupId;
    expect(() => validateV5GProject(missingGroupId)).toThrow(
      `VNI layer "${missingGroupId.layers[0].id}" is missing groupId`,
    );

    const unknownGroup = validProject();
    unknownGroup.layers[0].groupId = "missing";
    expect(() => validateV5GProject(unknownGroup)).toThrow(
      "references missing layer group",
    );

    const nonContiguous = validProject();
    nonContiguous.layerGroups = [group("a", 0), group("b", 1)];
    nonContiguous.layers[0].groupId = "a";
    nonContiguous.layers[1].groupId = "b";
    for (let index = 2; index < nonContiguous.layers.length; index += 1) {
      nonContiguous.layers[index].groupId = "a";
    }
    expect(() => validateV5GProject(nonContiguous)).toThrow(
      'VNI layer group "a" is not contiguous in project.layers',
    );
  });

  it("fails fast for unknown, reversed, and non-adjacent slots", () => {
    const project = assertV5GProject(threeReelMultipay02Data);
    expect(() =>
      assertVNIAdjacentLayerGroupSlot(
        project,
        "layer_group_mqqo4zrn_6",
        "group_default",
      ),
    ).not.toThrow();
    expect(() =>
      assertVNIAdjacentLayerGroupSlot(project, "missing", "group_default"),
    ).toThrow("Unknown VNI layer group: missing");
    expect(() =>
      assertVNIAdjacentLayerGroupSlot(
        project,
        "group_default",
        "layer_group_mqqo4zrn_6",
      ),
    ).toThrow("not adjacent in render order");

    const threeGroupProject = validProject();
    threeGroupProject.layerGroups = [
      group("a", 0),
      group("b", 1),
      group("c", 2),
    ];
    threeGroupProject.layers[0].groupId = "a";
    threeGroupProject.layers[1].groupId = "b";
    for (let index = 2; index < threeGroupProject.layers.length; index += 1) {
      threeGroupProject.layers[index].groupId = "c";
    }
    expect(() => validateV5GProject(threeGroupProject)).not.toThrow();
    expect(() =>
      assertVNIAdjacentLayerGroupSlot(threeGroupProject, "a", "c"),
    ).toThrow("not adjacent in render order");
  });
});

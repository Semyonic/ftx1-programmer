import { describe, expect, it } from "vitest";
import { MENU, findLeaf } from "../cat/menu";
import type { Leaf, LeafType } from "../cat/menu";
import { describe as describeLeaf } from "../cat/menu-descriptions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Iterate every leaf in the MENU tree, yielding its group/subgroup context. */
function* allLeaves(): Generator<{
  p1: number;
  p2: number;
  leaf: Leaf;
  groupName: string;
  subName: string;
}> {
  for (const g of MENU) {
    for (const sub of g.subgroups) {
      for (const leaf of sub.leaves) {
        yield {
          p1: g.p1,
          p2: sub.p2,
          leaf,
          groupName: g.name,
          subName: sub.name,
        };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 1. No duplicate p1-p2-p3 keys
// ---------------------------------------------------------------------------
describe("unique keys", () => {
  it("every leaf has a unique p1-p2-p3 key", () => {
    const keys = new Set<string>();
    for (const g of MENU) {
      for (const sub of g.subgroups) {
        for (const leaf of sub.leaves) {
          const k = `${g.p1}-${sub.p2}-${leaf.p3}`;
          expect(keys.has(k), `duplicate key ${k}`).toBe(false);
          keys.add(k);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Every non-excluded leaf has a description
// ---------------------------------------------------------------------------
describe("descriptions coverage", () => {
  it("every non-excluded leaf has a description", () => {
    const missing: string[] = [];
    let withDesc = 0;
    let withoutDesc = 0;

    for (const { p1, p2, leaf } of allLeaves()) {
      if (leaf.type.kind === "excluded") continue;

      const d = describeLeaf(p1, p2, leaf.p3);
      if (d !== null) {
        withDesc++;
      } else {
        withoutDesc++;
        missing.push(`${p1}-${p2}-${leaf.p3} (${leaf.name})`);
      }
    }

    // Log coverage stats regardless of outcome.
    console.log(
      `Description coverage: ${withDesc} with / ${withoutDesc} without`,
    );
    if (missing.length > 0) {
      console.log("Missing descriptions:", missing.join(", "));
    }

    expect(
      missing,
      `${missing.length} non-excluded leaves lack a description`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Preset descriptions remap correctly (presets 2-5 share with preset 1)
// ---------------------------------------------------------------------------
describe("preset description remapping", () => {
  it("preset 2..5 leaves share descriptions with preset 1", () => {
    // Find all p3 values defined in preset 1
    const preset1 = MENU.find((g) => g.p1 === 9)?.subgroups.find(
      (s) => s.p2 === 1,
    );
    expect(preset1, "preset 1 subgroup should exist").toBeDefined();

    for (const leaf of preset1!.leaves) {
      const desc1 = describeLeaf(9, 1, leaf.p3);
      if (desc1 === null) continue; // nothing to remap

      for (let p2 = 2; p2 <= 5; p2++) {
        const descN = describeLeaf(9, p2, leaf.p3);
        expect(
          descN,
          `describe(9, ${p2}, ${leaf.p3}) should equal describe(9, 1, ${leaf.p3})`,
        ).toBe(desc1);
      }
    }
  });

  it("describe(9, 3, 14) equals describe(9, 1, 14)", () => {
    const d1 = describeLeaf(9, 1, 14);
    const d3 = describeLeaf(9, 3, 14);
    // Both should exist and be equal
    expect(d1).not.toBeNull();
    expect(d3).toBe(d1);
  });
});

// ---------------------------------------------------------------------------
// 4. Enum types have non-empty values
// ---------------------------------------------------------------------------
describe("enum types", () => {
  it("every enum leaf has at least one value", () => {
    for (const { p1, p2, leaf } of allLeaves()) {
      if (leaf.type.kind !== "enum") continue;
      expect(
        leaf.type.values.length,
        `${p1}-${p2}-${leaf.p3} (${leaf.name}) enum should not be empty`,
      ).toBeGreaterThan(0);
    }
  });

  it("every enum value has a non-empty code and label", () => {
    for (const { p1, p2, leaf } of allLeaves()) {
      if (leaf.type.kind !== "enum") continue;
      for (const v of leaf.type.values) {
        expect(
          v.code.length,
          `${p1}-${p2}-${leaf.p3} (${leaf.name}) enum value code should not be empty`,
        ).toBeGreaterThan(0);
        expect(
          v.label.length,
          `${p1}-${p2}-${leaf.p3} (${leaf.name}) enum value label should not be empty`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Int/signedInt ranges are valid
// ---------------------------------------------------------------------------
describe("int and signedInt ranges", () => {
  it("min < max for every int/signedInt leaf", () => {
    for (const { p1, p2, leaf } of allLeaves()) {
      const t = leaf.type as LeafType;
      if (t.kind !== "int" && t.kind !== "signedInt") continue;

      expect(
        t.min,
        `${p1}-${p2}-${leaf.p3} (${leaf.name}) min should be less than max`,
      ).toBeLessThan(t.max);
    }
  });

  it("digits > 0 for every int/signedInt leaf", () => {
    for (const { p1, p2, leaf } of allLeaves()) {
      const t = leaf.type as LeafType;
      if (t.kind !== "int" && t.kind !== "signedInt") continue;

      expect(
        t.digits,
        `${p1}-${p2}-${leaf.p3} (${leaf.name}) digits should be positive`,
      ).toBeGreaterThan(0);
    }
  });

  it("step divides (max - min) evenly or is 1", () => {
    for (const { p1, p2, leaf } of allLeaves()) {
      const t = leaf.type as LeafType;
      if (t.kind !== "int" && t.kind !== "signedInt") continue;
      const step = t.step;
      if (step === undefined) continue;

      const range = t.max - t.min;
      const remainder = range % step;
      expect(
        remainder === 0 || step === 1,
        `${p1}-${p2}-${leaf.p3} (${leaf.name}) step=${step} does not evenly divide range=${range}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Text leaves have maxLen > 0
// ---------------------------------------------------------------------------
describe("text leaves", () => {
  it("every text leaf has maxLen > 0", () => {
    for (const { p1, p2, leaf } of allLeaves()) {
      if (leaf.type.kind !== "text") continue;

      expect(
        leaf.type.maxLen,
        `${p1}-${p2}-${leaf.p3} (${leaf.name}) maxLen should be positive`,
      ).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Excluded leaves have a reason string
// ---------------------------------------------------------------------------
describe("excluded leaves", () => {
  it("every excluded leaf has a non-empty reason", () => {
    for (const { p1, p2, leaf } of allLeaves()) {
      if (leaf.type.kind !== "excluded") continue;

      expect(
        leaf.type.reason.length,
        `${p1}-${p2}-${leaf.p3} (${leaf.name}) excluded reason should not be empty`,
      ).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. findLeaf works
// ---------------------------------------------------------------------------
describe("findLeaf", () => {
  it("findLeaf(1, 1, 1) returns a valid leaf", () => {
    const leaf = findLeaf(1, 1, 1);
    expect(leaf).toBeDefined();
    expect(leaf!.p3).toBe(1);
    expect(leaf!.name).toBeTruthy();
  });

  it("findLeaf(99, 99, 99) returns undefined", () => {
    const leaf = findLeaf(99, 99, 99);
    expect(leaf).toBeUndefined();
  });

  it("known excluded leaf (ALL RESET at 5-5-3) returns excluded type", () => {
    const leaf = findLeaf(5, 5, 3);
    expect(leaf).toBeDefined();
    expect(leaf!.name).toBe("ALL RESET");
    expect(leaf!.type.kind).toBe("excluded");
  });
});

// ---------------------------------------------------------------------------
// 9. Group/subgroup structure
// ---------------------------------------------------------------------------
describe("group and subgroup structure", () => {
  it("every group has p1 > 0", () => {
    for (const g of MENU) {
      expect(g.p1, `group "${g.name}" should have p1 > 0`).toBeGreaterThan(0);
    }
  });

  it("every subgroup has p2 > 0", () => {
    for (const g of MENU) {
      for (const sub of g.subgroups) {
        expect(
          sub.p2,
          `subgroup "${sub.name}" in group "${g.name}" should have p2 > 0`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("groups are in ascending p1 order", () => {
    for (let i = 1; i < MENU.length; i++) {
      expect(
        MENU[i].p1,
        `group at index ${i} (${MENU[i].name}) should have p1 > previous group (${MENU[i - 1].name})`,
      ).toBeGreaterThan(MENU[i - 1].p1);
    }
  });

  it("subgroups within each group are in ascending p2 order", () => {
    for (const g of MENU) {
      for (let i = 1; i < g.subgroups.length; i++) {
        expect(
          g.subgroups[i].p2,
          `subgroup "${g.subgroups[i].name}" in group "${g.name}" should have p2 > previous`,
        ).toBeGreaterThan(g.subgroups[i - 1].p2);
      }
    }
  });
});

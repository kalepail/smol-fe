import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCircomScalar } from "../src/lib/the-farm/circomInputs.ts";

test("normalizeCircomScalar unwraps single-element arrays", () => {
  assert.equal(normalizeCircomScalar([3], "tier_id"), "3");
});

test("normalizeCircomScalar rejects multi-element arrays", () => {
  assert.throws(
    () => normalizeCircomScalar([3, 4], "tier_id"),
    /expected a single value/i,
  );
});

test("normalizeCircomScalar rejects accidental comma strings", () => {
  assert.throws(
    () => normalizeCircomScalar("0,1", "tier_id"),
    /no commas/i,
  );
});


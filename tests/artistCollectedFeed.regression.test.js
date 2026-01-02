import test from "node:test";
import assert from "node:assert/strict";
import { getCollectedSmols } from "../src/utils/artistCollected.js";

test("artist collected feed uses Minted_By without including self-created songs", () => {
  const address = "CONTRACT123";
  const smols = [
    { Id: "1", Minted_By: address, Address: "OTHER", Creator: "OTHER" },
    { Id: "2", Minted_By: address, Address: address, Creator: address },
    { Id: "3", Minted_By: "SOMEONE", Address: "OTHER", Creator: "OTHER" },
  ];

  const { collectedSmols } = getCollectedSmols(smols, address);

  assert.equal(collectedSmols.length, 1);
  assert.equal(collectedSmols[0].Id, "1");
});

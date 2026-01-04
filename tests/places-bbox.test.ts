import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBbox } from "../lib/geo/bbox";

describe("parseBbox", () => {
  it("clamps latitude without error", () => {
    const result = parseBbox("0,-100,10,120");
    assert.equal(result.error, undefined);
    assert.deepEqual(result.bbox?.[0], {
      minLng: 0,
      minLat: -90,
      maxLng: 10,
      maxLat: 90,
    });
  });

  it("splits bboxes that cross the antimeridian (in-range)", () => {
    const result = parseBbox("170,-10,-170,10");
    assert.equal(result.error, undefined);
    assert.equal(result.bbox?.length, 2);
    assert.deepEqual(result.bbox?.[0], { minLng: 170, minLat: -10, maxLng: 180, maxLat: 10 });
    assert.deepEqual(result.bbox?.[1], { minLng: -180, minLat: -10, maxLng: -170, maxLat: 10 });
  });

  it("clamps longitude that exceeds world bounds", () => {
    const result = parseBbox("-196.875,-77.466028,196.875,83.829945");
    assert.equal(result.error, undefined);
    assert.equal(result.bbox?.length, 1);
    assert.deepEqual(result.bbox?.[0], {
      minLng: -180,
      minLat: -77.466028,
      maxLng: 180,
      maxLat: 83.829945,
    });
  });
});

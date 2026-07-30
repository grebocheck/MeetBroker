import { describe, expect, it } from "vitest";
import { spatialNavigationScore } from "./InputNavigation";

function rect(left: number, top: number, width = 100, height = 40) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

describe("spatial keyboard navigation", () => {
  it("rejects controls outside the requested direction", () => {
    expect(spatialNavigationScore(rect(100, 100), rect(0, 100), "right")).toBe(
      null,
    );
    expect(spatialNavigationScore(rect(100, 100), rect(100, 40), "down")).toBe(
      null,
    );
  });

  it("prefers a control in the same row over a closer diagonal control", () => {
    const origin = rect(100, 100);
    const aligned = spatialNavigationScore(origin, rect(360, 100), "right");
    const diagonal = spatialNavigationScore(origin, rect(210, 170), "right");

    expect(aligned).not.toBeNull();
    expect(diagonal).not.toBeNull();
    expect(aligned!).toBeLessThan(diagonal!);
  });

  it("prefers a control in the same column for vertical movement", () => {
    const origin = rect(100, 100);
    const aligned = spatialNavigationScore(origin, rect(100, 260), "down");
    const diagonal = spatialNavigationScore(origin, rect(230, 170), "down");

    expect(aligned).not.toBeNull();
    expect(diagonal).not.toBeNull();
    expect(aligned!).toBeLessThan(diagonal!);
  });
});

import { describe, expect, it } from "vitest";
import { brandColorVars, contrastRatio, generatePalette, hexDarken, isValidHex } from "@/lib/brand-color";
import { clampFocal, clampFocalValue, focalFromPointer, normalizeFocal, nudgeFocal } from "@/lib/focal";

describe("brand-color utilities", () => {
  it("validates hex values in #RRGGBB format", () => {
    expect(isValidHex("#A1B2C3")).toBe(true);
    expect(isValidHex("#a1b2c3")).toBe(true);
    expect(isValidHex("#ABC")).toBe(false);
    expect(isValidHex("ABCDEF")).toBe(false);
    expect(isValidHex("#GGHHII")).toBe(false);
  });

  it("darkens a valid color by ratio", () => {
    expect(hexDarken("#FFFFFF", 0.2)).toBe("#CCCCCC");
    expect(hexDarken("#000000", 0.2)).toBe("#000000");
  });

  it("falls back safely when color is invalid", () => {
    expect(hexDarken("not-a-hex", 0)).toBe("#D4956A");
  });

  it("builds CSS variables with fallback behavior", () => {
    const css = brandColorVars("#123456");
    expect(css).toContain("--color-primary: #123456;");
    expect(css).toContain("--color-primary-dark:");
    expect(css).toContain("--color-primary-glow: #12345626;");

    const fallbackCss = brandColorVars("oops");
    expect(fallbackCss).toContain("--color-primary: #D4956A;");
  });
});

describe("contrastRatio — WCAG (§7.7 ContrastMeter)", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });

  it("#767676 on white is ~4.54 (the AA text threshold)", () => {
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 1);
  });

  it("identical colors have ratio 1", () => {
    expect(contrastRatio("#2F7D5B", "#2F7D5B")).toBeCloseTo(1, 5);
  });
});

describe("generatePalette — ramp shape/order (§7.7)", () => {
  it("returns five swatches with the seed in the centre", () => {
    const ramp = generatePalette("#2F7D5B");
    expect(ramp).toHaveLength(5);
    expect(ramp[2]).toBe("#2F7D5B");
  });

  it("lightens toward white on the left and darkens toward black on the right", () => {
    const [l2, l1, seed, d1, d2] = generatePalette("#2F7D5B");
    const lum = (hex: string) => contrastRatio(hex, "#000000");
    // Brighter colors have higher contrast against black.
    expect(lum(l2)).toBeGreaterThan(lum(l1));
    expect(lum(l1)).toBeGreaterThan(lum(seed));
    expect(lum(seed)).toBeGreaterThan(lum(d1));
    expect(lum(d1)).toBeGreaterThan(lum(d2));
  });

  it("falls back to the Stren default for an invalid seed", () => {
    expect(generatePalette("nope")[2]).toBe("#D4956A");
  });

  it("emits uppercase #RRGGBB swatches", () => {
    for (const hex of generatePalette("#c1653f")) {
      expect(isValidHex(hex)).toBe(true);
      expect(hex).toBe(hex.toUpperCase());
    }
  });
});

describe("focal helpers — clamp/normalize + 1% nudge (§7.5)", () => {
  it("clamps values into 0–100 and rounds to integers", () => {
    expect(clampFocalValue(-10)).toBe(0);
    expect(clampFocalValue(150)).toBe(100);
    expect(clampFocalValue(61.7)).toBe(62);
    expect(clampFocal({ x: -5, y: 105 })).toEqual({ x: 0, y: 100 });
  });

  it("normalizes stored/jsonb values, defaulting to centre", () => {
    expect(normalizeFocal({ x: 62, y: 38 })).toEqual({ x: 62, y: 38 });
    expect(normalizeFocal(null)).toEqual({ x: 50, y: 50 });
    expect(normalizeFocal({ x: 200, y: -3 })).toEqual({ x: 100, y: 0 });
  });

  it("nudges by 1% and stays clamped at the edges", () => {
    expect(nudgeFocal({ x: 50, y: 50 }, 1, 0)).toEqual({ x: 51, y: 50 });
    expect(nudgeFocal({ x: 50, y: 50 }, 0, -1)).toEqual({ x: 50, y: 49 });
    expect(nudgeFocal({ x: 100, y: 0 }, 1, -1)).toEqual({ x: 100, y: 0 });
  });

  it("maps a pointer position over the hero rect to a clamped focal point", () => {
    const rect = { left: 0, top: 0, width: 200, height: 100 };
    expect(focalFromPointer(rect, 100, 50)).toEqual({ x: 50, y: 50 });
    expect(focalFromPointer(rect, 300, -20)).toEqual({ x: 100, y: 0 });
  });
});

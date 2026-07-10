/**
 * Cover focal point helpers (ImplementationPlan.md §7.5, CONTEXT.md "Focal point").
 *
 * Pure math only. The focal point is metadata (x/y percentages, 0–100) that
 * positions the cover crop via `object-position` — it never re-crops the image.
 */

export interface FocalPoint {
  x: number;
  y: number;
}

export const DEFAULT_FOCAL: FocalPoint = { x: 50, y: 50 };

/** Clamp to 0–100 and round to an integer percent. */
export function clampFocalValue(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function clampFocal(point: { x: number; y: number }): FocalPoint {
  return { x: clampFocalValue(point.x), y: clampFocalValue(point.y) };
}

/** Parse a stored/jsonb focal value, falling back to centre. */
export function normalizeFocal(value: unknown): FocalPoint {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const src = value as Record<string, unknown>;
    const x = typeof src.x === 'number' ? src.x : 50;
    const y = typeof src.y === 'number' ? src.y : 50;
    return clampFocal({ x, y });
  }
  return { ...DEFAULT_FOCAL };
}

/** Nudge by a delta (arrow keys use ±1%), staying clamped. */
export function nudgeFocal(point: FocalPoint, dx: number, dy: number): FocalPoint {
  return clampFocal({ x: point.x + dx, y: point.y + dy });
}

/** Convert a pointer position over the hero rect into a clamped focal point. */
export function focalFromPointer(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): FocalPoint {
  if (rect.width <= 0 || rect.height <= 0) return { ...DEFAULT_FOCAL };
  return clampFocal({
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  });
}

/** CSS `object-position` string for a focal point. */
export function focalObjectPosition(point: FocalPoint): string {
  return `${point.x}% ${point.y}%`;
}

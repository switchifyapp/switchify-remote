export type DragKind = "cell" | "row" | "column";
export type Selection = { kind: DragKind; index: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type DropTarget = { index: number; boundary?: number };
export function contains(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}
/** Track drops use insertion boundaries; button drops use occupied/empty cells. */
export function dropTarget(
  source: Selection,
  x: number,
  y: number,
  viewport: Rect | null,
  rects: ReadonlyMap<string, Rect>,
  columns: number,
): DropTarget | null {
  if (!viewport || !contains(viewport, x, y)) return null;
  const hit =
    [...rects].find(
      ([key, rect]) => key.startsWith("cell-") && contains(rect, x, y),
    ) ??
    [...rects].find(
      ([key, rect]) =>
        key.startsWith(`${source.kind}-`) && contains(rect, x, y),
    );
  if (!hit) return null;
  const [key, rect] = hit;
  const number = Number(key.split("-")[1]);
  if (source.kind === "cell")
    return key.startsWith("cell-") ? { index: number } : null;
  const track = key.startsWith("cell-")
    ? source.kind === "row"
      ? Math.floor(number / columns)
      : number % columns
    : number;
  const after =
    source.kind === "row"
      ? y >= rect.y + rect.height / 2
      : x >= rect.x + rect.width / 2;
  const boundary = track + (after ? 1 : 0);
  return { index: boundary > source.index ? boundary - 1 : boundary, boundary };
}

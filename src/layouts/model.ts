export type LayoutSurface = "mouse" | "typing" | "window";
export type ButtonLayout = { columns: number; cells: (string | null)[] };
export const MAX_ROWS = 20;
export const MAX_COLUMNS = 4;

export function validLayout(value: unknown): value is ButtonLayout {
  if (!value || typeof value !== "object") return false;
  const { columns, cells } = value as Partial<ButtonLayout>;
  if (
    !Number.isInteger(columns) ||
    columns! < 1 ||
    columns! > MAX_COLUMNS ||
    !Array.isArray(cells)
  )
    return false;
  if (
    !cells.length ||
    cells.length % columns! ||
    cells.length > columns! * MAX_ROWS
  )
    return false;
  const ids = new Set<string>();
  return cells.every((id) => {
    if (id === null) return true;
    if (
      typeof id !== "string" ||
      !/^[a-zA-Z0-9.-]{1,80}$/.test(id) ||
      ids.has(id)
    )
      return false;
    ids.add(id);
    return true;
  });
}

export function initialLayout(ids: readonly string[]): ButtonLayout {
  const cells: (string | null)[] = [...ids];
  while (!cells.length || cells.length % 3) cells.push(null);
  return { columns: 3, cells };
}

export function moveCell(
  layout: ButtonLayout,
  from: number,
  to: number,
): ButtonLayout {
  if (!layout.cells[from] || from === to || to < 0 || to >= layout.cells.length)
    return layout;
  const cells = [...layout.cells];
  [cells[from], cells[to]] = [cells[to]!, cells[from]!];
  return { ...layout, cells };
}

export function setCell(
  layout: ButtonLayout,
  index: number,
  id: string | null,
): ButtonLayout {
  if (
    index < 0 ||
    index >= layout.cells.length ||
    (id !== null && layout.cells.includes(id))
  )
    return layout;
  return {
    ...layout,
    cells: layout.cells.map((cell, i) => (i === index ? id : cell)),
  };
}

export function resizeLayout(
  layout: ButtonLayout,
  axis: "row" | "column",
  index: number,
  insert: boolean,
): ButtonLayout {
  const rows = layout.cells.length / layout.columns;
  const count = axis === "row" ? rows : layout.columns;
  const limit = axis === "row" ? MAX_ROWS : MAX_COLUMNS;
  if (
    index < 0 ||
    index > count - (insert ? 0 : 1) ||
    (insert ? count >= limit : count <= 1)
  )
    return layout;
  const matrix = Array.from({ length: rows }, (_, i) =>
    layout.cells.slice(i * layout.columns, (i + 1) * layout.columns),
  );
  if (axis === "row")
    matrix.splice(
      index,
      insert ? 0 : 1,
      ...(insert ? [Array<string | null>(layout.columns).fill(null)] : []),
    );
  else
    matrix.forEach((row) =>
      row.splice(index, insert ? 0 : 1, ...(insert ? [null] : [])),
    );
  return {
    columns: layout.columns + (axis === "column" ? (insert ? 1 : -1) : 0),
    cells: matrix.flat(),
  };
}

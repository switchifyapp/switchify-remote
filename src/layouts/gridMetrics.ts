/** Fit saved tracks to the viewport without changing grid geometry or touch targets. */
export function sectionGridMetrics(
  viewportWidth: number,
  columns: number,
  gap: number,
  handleWidth = 0,
) {
  const width = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  const gaps = gap * (columns - 1 + (handleWidth > 0 ? 1 : 0));
  // Round down to avoid cumulative fractional widths clipping the last track.
  const cellWidth = Math.max(
    48,
    Math.floor((width - handleWidth - gaps) / columns),
  );
  const gridWidth = handleWidth + gaps + cellWidth * columns;
  return { cellWidth, gridWidth, overflows: width > 0 && gridWidth > width };
}

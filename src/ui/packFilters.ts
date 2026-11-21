/** Find the fewest rows for a small group of controls, keeping the first arrangement on ties. */
export function packFilters(widths: number[], available: number, gap: number) {
  type Row = { used: number; items: { index: number; offset: number; width: number }[] };
  let best: Row[] | undefined;

  function place(index: number, rows: Row[]) {
    if (best && rows.length >= best.length) return;
    if (index === widths.length) {
      best = rows;
      return;
    }
    const width = Math.min(Math.ceil(widths[index]), available);
    rows.forEach((row, rowIndex) => {
      const offset = row.used + gap;
      if (offset + width > available) return;
      const next = rows.slice();
      next[rowIndex] = { used: offset + width, items: [...row.items, { index, offset, width }] };
      place(index + 1, next);
    });
    place(index + 1, [...rows, { used: width, items: [{ index, offset: 0, width }] }]);
  }

  place(0, []);
  return (
    best?.flatMap((row, index) => {
      const space = row.items.length > 1 ? (available - row.used) / (row.items.length - 1) : 0;
      return row.items.map((item, column) => ({ ...item, offset: item.offset + column * space, row: index + 1 }));
    }) ?? []
  );
}

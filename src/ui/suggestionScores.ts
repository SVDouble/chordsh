const categories = [
  { id: 'anchor', label: 'Tonic anchor' },
  { id: 'melody', label: 'Melody' },
  { id: 'motion', label: 'Motion' },
  { id: 'focus', label: 'Focus' },
  { id: 'patterns', label: 'Patterns' },
] as const;

export type ScoreCategory = (typeof categories)[number];
export type ScorePart = ScoreCategory & { points: number };
type Factors = Partial<Record<ScoreCategory['id'], number | null>>;

export function scoreParts(factors: Factors): ScorePart[] {
  return categories.flatMap((category) => {
    const value = factors[category.id];
    return value == null ? [] : [{ ...category, points: Math.round(100 * Math.max(0, Math.min(1, value))) }];
  });
}

export function suggestionScoreScale(rows: ScorePart[][]) {
  const used = new Set(rows.flatMap((parts) => parts.map((part) => part.id)));
  const maxTotal = Math.max(0, ...rows.map((parts) => parts.reduce((sum, part) => sum + part.points, 0)));
  return { categories: categories.filter(({ id }) => used.has(id)), maxTotal };
}

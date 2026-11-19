/** Colour class for a chord tone's role: root, guide tones (3rd/7th), 5th, colour tensions, altered tensions. */
export function roleClass(role: string): string {
  if (role === 'R') return 'r-root';
  if (['3', '♭3', '7', '♭7', '𝄫7', '4', '2'].includes(role)) return 'r-guide';
  if (role === '5') return 'r-fifth';
  if (['♭5', '♯5', '♭9', '♯9', '♯11', '♭13'].includes(role)) return 'r-alt';
  return 'r-ext';
}

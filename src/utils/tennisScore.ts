import { SetScore } from '../types';

// Match format: best of 3 sets. The 3rd set (when played) is a match tiebreak
// (first to 10, not a full set) — same data shape, just labeled differently in the UI.
export const MAX_SETS = 3;
export const SETS_TO_WIN = 2;

/** Winner of a single set by simple numeric comparison of the two typed scores. */
export function setWinner(set: SetScore | undefined): 'p1' | 'p2' | null {
  if (!set) return null;
  const a = parseInt(set.p1, 10);
  const b = parseInt(set.p2, 10);
  if (isNaN(a) || isNaN(b) || a === b) return null;
  return a > b ? 'p1' : 'p2';
}

export function setsWonCount(sets: SetScore[] | undefined): { p1: number; p2: number } {
  const list = sets || [];
  let p1 = 0, p2 = 0;
  for (const s of list) {
    const w = setWinner(s);
    if (w === 'p1') p1++;
    else if (w === 'p2') p2++;
  }
  return { p1, p2 };
}

/** Best-of-3 winner once one side has taken 2 sets; null if still undecided. */
export function matchWinnerFromSets(sets: SetScore[] | undefined): 'p1' | 'p2' | null {
  const { p1, p2 } = setsWonCount(sets);
  if (p1 >= SETS_TO_WIN) return 'p1';
  if (p2 >= SETS_TO_WIN) return 'p2';
  return null;
}

/** A 3rd-set tiebreak is only relevant once the first two sets split 1-1. */
export function needsThirdSet(sets: SetScore[] | undefined): boolean {
  const { p1, p2 } = setsWonCount((sets || []).slice(0, 2));
  return p1 === 1 && p2 === 1;
}

/** Drop trailing empty sets before persisting (keeps Firestore docs tidy). */
export function trimSets(sets: SetScore[]): SetScore[] {
  const trimmed = [...sets];
  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    if (!last.p1.trim() && !last.p2.trim()) trimmed.pop();
    else break;
  }
  return trimmed;
}

/** Compact "6-4, 3-6, 10-8" summary for read-only displays. */
export function formatSetsScore(sets: SetScore[] | undefined): string {
  const list = (sets || []).filter(s => s.p1.trim() || s.p2.trim());
  if (list.length === 0) return '';
  return list.map(s => `${s.p1 || '0'}-${s.p2 || '0'}`).join(', ');
}

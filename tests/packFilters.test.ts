import { expect, it } from 'vitest';
import { packFilters } from '../src/ui/packFilters';

it('fills earlier rows with smaller filters to use the fewest rows', () => {
  expect(packFilters([6, 6, 3, 3], 10, 1)).toEqual([
    { index: 0, offset: 0, width: 6, row: 1 },
    { index: 2, offset: 7, width: 3, row: 1 },
    { index: 1, offset: 0, width: 6, row: 2 },
    { index: 3, offset: 7, width: 3, row: 2 },
  ]);
});

it('gives oversized filters a whole row to wrap their options', () => {
  expect(packFilters([12, 5], 10, 1)).toEqual([
    { index: 0, offset: 0, width: 10, row: 1 },
    { index: 1, offset: 0, width: 5, row: 2 },
  ]);
});

it('aligns the first group to a common edge and gives paired groups room', () => {
  expect(packFilters([4, 4], 15, 1)).toEqual([
    { index: 0, offset: 0, width: 4, row: 1 },
    { index: 1, offset: 11, width: 4, row: 1 },
  ]);
});

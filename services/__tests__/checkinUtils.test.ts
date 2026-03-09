import { toNumericNoiseLevel } from '../checkinUtils';

describe('toNumericNoiseLevel', () => {
  it('maps named levels to numeric scale', () => {
    expect(toNumericNoiseLevel('quiet')).toBe(2);
    expect(toNumericNoiseLevel('moderate')).toBe(3);
    expect(toNumericNoiseLevel('lively')).toBe(4);
  });

  it('passes through valid numeric values', () => {
    expect(toNumericNoiseLevel(1)).toBe(1);
    expect(toNumericNoiseLevel(5)).toBe(5);
    expect(toNumericNoiseLevel('4')).toBe(4);
  });

  it('returns null for missing or invalid values', () => {
    expect(toNumericNoiseLevel(null)).toBeNull();
    expect(toNumericNoiseLevel('')).toBeNull();
    expect(toNumericNoiseLevel('loud')).toBeNull();
    expect(toNumericNoiseLevel(9)).toBeNull();
  });
});

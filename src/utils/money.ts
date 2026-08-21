/** All money is stored as whole AMD units. */
export const round = (value: number): number => Math.round(value);

export const applyRate = (amount: number, rate: number): number => round(amount * rate);

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

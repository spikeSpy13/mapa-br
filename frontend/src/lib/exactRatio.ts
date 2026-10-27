/** Divisão inteira exata, escala decimal explícita e arredondamento HALF_EVEN. */
export function roundRatioHalfEven(numerator: bigint, denominator: bigint, scale: bigint): bigint | null {
  if (numerator < 0n || denominator < 0n || scale <= 0n) throw new Error('Razão não negativa e escala positiva exigidas.');
  if (denominator === 0n) return null;
  const scaled = numerator * scale, remainder = scaled % denominator;
  const q = scaled / denominator;
  return remainder * 2n > denominator || remainder * 2n === denominator && q % 2n === 1n ? q + 1n : q;
}

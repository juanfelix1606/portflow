const CONTAINER_NUMBER_PATTERN = /^[A-Z]{3}[UJZ][0-9]{7}$/;

const LETTER_VALUES: Readonly<Record<string, number>> = {
  A: 10,
  B: 12,
  C: 13,
  D: 14,
  E: 15,
  F: 16,
  G: 17,
  H: 18,
  I: 19,
  J: 20,
  K: 21,
  L: 23,
  M: 24,
  N: 25,
  O: 26,
  P: 27,
  Q: 28,
  R: 29,
  S: 30,
  T: 31,
  U: 32,
  V: 34,
  W: 35,
  X: 36,
  Y: 37,
  Z: 38
};

export function calculateIso6346CheckDigit(prefix: string): number | null {
  if (!/^[A-Z]{3}[UJZ][0-9]{6}$/.test(prefix)) {
    return null;
  }

  let weightedSum = 0;

  for (let index = 0; index < prefix.length; index += 1) {
    const character = prefix[index];

    if (!character) {
      return null;
    }

    const value =
      character >= "0" && character <= "9"
        ? Number(character)
        : LETTER_VALUES[character];

    if (value === undefined) {
      return null;
    }

    weightedSum += value * 2 ** index;
  }

  const remainder = weightedSum % 11;
  return remainder === 10 ? 0 : remainder;
}

export function isValidIso6346ContainerNumber(value: string): boolean {
  if (!CONTAINER_NUMBER_PATTERN.test(value)) {
    return false;
  }

  const expectedCheckDigit = calculateIso6346CheckDigit(value.slice(0, 10));
  return expectedCheckDigit !== null && Number(value[10]) === expectedCheckDigit;
}

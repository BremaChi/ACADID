export const AIN_PATTERN = /^AIN-[A-Z]{2}-\d{4}-\d{7}$/;

export function formatAin(countryCode: string, firstEnrollmentYear: number, sequence: number): string {
  const normalizedCountry = countryCode.trim().toUpperCase();
  const paddedSequence = sequence.toString().padStart(7, "0");
  return `AIN-${normalizedCountry}-${firstEnrollmentYear}-${paddedSequence}`;
}

export function isValidAin(value: string): boolean {
  return AIN_PATTERN.test(value);
}

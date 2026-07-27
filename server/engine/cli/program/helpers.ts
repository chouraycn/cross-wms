// Commander option-collection helper for repeatable --option values.
export function collectOption(value: string, previous: string[]): string[] {
  const next = previous ?? [];
  next.push(value);
  return next;
}

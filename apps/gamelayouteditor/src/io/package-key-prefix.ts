export function packageKeyPrefix(id: string): string {
  return `pkg-${id.length}-${id}`;
}

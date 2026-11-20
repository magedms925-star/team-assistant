/** The index of the last item that matches, or -1. */
export function lastIndex<T>(items: readonly T[], match: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (match(items[i]!)) return i;
  return -1;
}

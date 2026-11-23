const store = new Map<string, Promise<unknown>>();

export function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!store.has(key)) store.set(key, load());
  return store.get(key) as Promise<T>;
}

export async function warm(keys: string[]): Promise<void> {
  const loaders = keys.map((k) => remember(k, async () => k.toUpperCase()));
  await Promise.allResolved(loaders);
}

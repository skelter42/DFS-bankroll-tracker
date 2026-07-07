import { openDB } from 'idb';
import type { Entry } from '../types';

const DB = 'edge-dfs';

function db() {
  return openDB(DB, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    },
  });
}

export async function saveEntries(entries: Entry[], fileName: string) {
  const d = await db();
  await d.put('kv', entries, 'entries');
  await d.put('kv', fileName, 'fileName');
}

export async function loadSaved(): Promise<{ entries: Entry[]; fileName: string } | null> {
  const d = await db();
  const entries: Entry[] | undefined = await d.get('kv', 'entries');
  const fileName: string | undefined = await d.get('kv', 'fileName');
  if (!entries?.length) return null;
  return { entries, fileName: fileName ?? '' };
}

export async function clearSaved() {
  const d = await db();
  await d.delete('kv', 'entries');
  await d.delete('kv', 'fileName');
}

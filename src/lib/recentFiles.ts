import { track } from "./analytics";

const DB_NAME = "dxf-viewer-recent";
const STORE = "files";
const DB_VERSION = 1;
const MAX_RECENT = 5;

export type RecentFile = {
  id: string;
  name: string;
  size: number;
  openedAt: number;
};

export type RecentFileFull = RecentFile & {
  buffer: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("openedAt", "openedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecent(
  name: string,
  size: number,
  buffer: ArrayBuffer,
): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await removeMatchingEntries(db, name, size);

    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const id = crypto.randomUUID();
    const record: RecentFileFull = {
      id,
      name,
      size,
      openedAt: Date.now(),
      buffer,
    };
    store.add(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await pruneOldEntries(db);
    track("recent_file_saved", {
      file_type: name.toLowerCase().endsWith(".dwg") ? "dwg" : "dxf",
      size_bucket: getSizeBucket(size),
    });
  } catch (error) {
    console.warn("Could not save recent DXF", error);
  } finally {
    db?.close();
  }
}

function getSizeBucket(size: number): string {
  if (size < 1024 * 1024) return "lt_1mb";
  if (size <= 10 * 1024 * 1024) return "1_to_10mb";
  return "gt_10mb";
}

async function removeMatchingEntries(
  db: IDBDatabase,
  name: string,
  size: number,
): Promise<void> {
  const matches = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = (req.result as RecentFileFull[]) ?? [];
      resolve(all.filter((f) => f.name === name && f.size === size).map((f) => f.id));
    };
    req.onerror = () => reject(req.error);
  });

  if (matches.length === 0) return;

  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const id of matches) {
    store.delete(id);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function pruneOldEntries(db: IDBDatabase): Promise<void> {
  const list = await listRecentInternal(db);
  if (list.length <= MAX_RECENT) return;
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const entry of list.slice(MAX_RECENT)) {
    store.delete(entry.id);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listRecentInternal(db: IDBDatabase): Promise<RecentFile[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = (req.result as RecentFileFull[]) ?? [];
      const summaries: RecentFile[] = all.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        openedAt: f.openedAt,
      }));
      summaries.sort((a, b) => b.openedAt - a.openedAt);
      resolve(summaries);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listRecent(): Promise<RecentFile[]> {
  try {
    const db = await openDb();
    const list = await listRecentInternal(db);
    db.close();
    return list;
  } catch (error) {
    console.warn("Could not list recent DXFs", error);
    return [];
  }
}

export async function getRecentBuffer(id: string): Promise<RecentFileFull | null> {
  try {
    const db = await openDb();
    const result = await new Promise<RecentFileFull | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as RecentFileFull) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (error) {
    console.warn("Could not load recent DXF", error);
    return null;
  }
}

export async function removeRecent(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    console.warn("Could not remove recent DXF", error);
  }
}

const DB_NAME = "dxf-viewer-pending";
const STORE = "pending";
const DB_VERSION = 1;
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

export type PendingFile = {
  id: string;
  name: string;
  size: number;
  buffer: ArrayBuffer;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePending(file: PendingFile): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(file);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("Could not save pending DXF", error);
  } finally {
    db?.close();
  }
}

export async function claimPending(id: string): Promise<PendingFile | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const result = await new Promise<PendingFile | null>((resolve, reject) => {
      let claimed: PendingFile | null = null;
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        claimed = (getReq.result as PendingFile) ?? null;
        if (claimed) {
          const deleteReq = store.delete(id);
          deleteReq.onerror = () => reject(deleteReq.error);
        }
      };
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => resolve(claimed);
      tx.onerror = () => reject(tx.error);
    });
    return result;
  } catch (error) {
    console.warn("Could not claim pending DXF", error);
    return null;
  } finally {
    db?.close();
  }
}

export async function purgeStalePending(
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const threshold = Date.now() - maxAgeMs;
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const staleIds = await new Promise<string[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as PendingFile[]) ?? [];
        resolve(all.filter((entry) => entry.createdAt < threshold).map((entry) => entry.id));
      };
      req.onerror = () => reject(req.error);
    });

    for (const id of staleIds) {
      store.delete(id);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("Could not purge stale pending DXFs", error);
  } finally {
    db?.close();
  }
}

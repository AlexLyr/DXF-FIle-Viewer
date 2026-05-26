const DB_NAME = "dxf-viewer-bookmarks";
const STORE = "bookmarks";
const DB_VERSION = 1;

export type Bookmark = {
  id: string;
  fileKey: string;
  label: string;
  centerX: number;
  centerY: number;
  width: number;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("fileKey", "fileKey");
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBookmark(
  fileKey: string,
  label: string,
  centerX: number,
  centerY: number,
  width: number,
): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      id: crypto.randomUUID(),
      fileKey,
      label,
      centerX,
      centerY,
      width,
      createdAt: Date.now(),
    } satisfies Bookmark);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("Could not save bookmark", error);
  } finally {
    db?.close();
  }
}

export async function listBookmarks(fileKey: string): Promise<Bookmark[]> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    return await new Promise<Bookmark[]>((resolve, reject) => {
      const tx = db!.transaction(STORE, "readonly");
      const index = tx.objectStore(STORE).index("fileKey");
      const req = index.getAll(IDBKeyRange.only(fileKey));
      req.onsuccess = () => {
        const rows = (req.result as Bookmark[]) ?? [];
        rows.sort((a, b) => b.createdAt - a.createdAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.warn("Could not list bookmarks", error);
    return [];
  } finally {
    db?.close();
  }
}

export async function removeBookmark(id: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("Could not remove bookmark", error);
  } finally {
    db?.close();
  }
}

export async function renameBookmark(id: string, label: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const record = await new Promise<Bookmark | null>((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as Bookmark) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (record) {
      store.put({ ...record, label });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("Could not rename bookmark", error);
  } finally {
    db?.close();
  }
}

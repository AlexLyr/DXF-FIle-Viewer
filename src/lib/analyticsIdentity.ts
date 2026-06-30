const ANALYTICS_DISTINCT_ID_KEY = "dxf:anon-id";
const IDENTITY_DB_NAME = "dxf-analytics-meta";
const IDENTITY_STORE = "kv";
const IDENTITY_KEY = "distinct-id";
const IDENTITY_DB_VERSION = 1;

let cachedDistinctId: string | null = null;
let inFlightDistinctId: Promise<string> | null = null;

export function getOrCreateDistinctId(): Promise<string> {
  if (cachedDistinctId) return Promise.resolve(cachedDistinctId);
  if (inFlightDistinctId) return inFlightDistinctId;
  inFlightDistinctId = resolveDistinctId().finally(() => {
    inFlightDistinctId = null;
  });
  return inFlightDistinctId;
}

async function resolveDistinctId(): Promise<string> {
  const fromLocal = readLocalDistinctId();
  if (fromLocal) {
    cachedDistinctId = fromLocal;
    void writeIndexedDistinctId(fromLocal);
    return fromLocal;
  }

  const fromIndexed = await readIndexedDistinctId();
  if (fromIndexed) {
    cachedDistinctId = fromIndexed;
    writeLocalDistinctId(fromIndexed);
    return fromIndexed;
  }

  const generated = crypto.randomUUID();
  cachedDistinctId = generated;
  writeLocalDistinctId(generated);
  await writeIndexedDistinctId(generated);
  return generated;
}

function readLocalDistinctId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ANALYTICS_DISTINCT_ID_KEY);
  } catch {
    return null;
  }
}

function writeLocalDistinctId(value: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ANALYTICS_DISTINCT_ID_KEY, value);
  } catch {
    // ignore
  }
}

async function readIndexedDistinctId(): Promise<string | null> {
  const db = await openIdentityDb();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(IDENTITY_STORE, "readonly");
      const req = tx.objectStore(IDENTITY_STORE).get(IDENTITY_KEY);
      req.onsuccess = () => {
        const raw = req.result;
        if (typeof raw === "string" && raw.length > 0) {
          resolve(raw);
          return;
        }
        resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function writeIndexedDistinctId(value: string): Promise<void> {
  const db = await openIdentityDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDENTITY_STORE, "readwrite");
      tx.objectStore(IDENTITY_STORE).put(value, IDENTITY_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function openIdentityDb(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    throw new Error("IndexedDB is unavailable");
  }
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const req = globalThis.indexedDB.open(IDENTITY_DB_NAME, IDENTITY_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

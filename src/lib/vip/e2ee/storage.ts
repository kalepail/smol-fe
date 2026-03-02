const DB_NAME = "vip-e2ee";
const STORE = "kv";

function hasIndexedDB() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbSet(key: string, value: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function persist(key: string, value: string) {
  if (hasIndexedDB()) {
    try {
      await idbSet(key, value);
      return;
    } catch (err) {
      console.warn("[vip-e2ee] idb fallback", err);
    }
  }
  localStorage.setItem(key, value);
}

export async function read(key: string): Promise<string | null> {
  if (hasIndexedDB()) {
    try {
      return await idbGet(key);
    } catch (err) {
      console.warn("[vip-e2ee] idb read fallback", err);
    }
  }
  return localStorage.getItem(key);
}

export async function clear(key: string) {
  if (hasIndexedDB()) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn("[vip-e2ee] idb clear fallback", err);
    }
  }
  localStorage.removeItem(key);
}

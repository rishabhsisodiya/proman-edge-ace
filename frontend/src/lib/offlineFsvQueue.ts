// Offline FSV queueing (2026-08-02) — IndexedDB-backed local queue for the
// specific FSV write operations most likely to happen on-site with no
// signal: photo upload, signature upload, adding a part, and the final
// submit. Field-level autosaves (times, notes, etc.) are NOT queued —
// they're safely re-enterable if lost, unlike a captured photo/signature or
// a submission, so scope was deliberately kept to the highest-value pieces
// rather than every FSV write call.
//
// Design note: this queues from the main thread (IndexedDB + window
// online/offline events), not via a service worker intercepting fetch().
// Simpler, and it matches the real cross-platform capability better — iOS
// has no Background Sync API at all, so "sync automatically the moment
// connectivity returns" was never achievable there anyway; a page-driven
// online-event listener (which also fires on next reopen while online)
// already delivers the same practical behavior.

const DB_NAME = "ace-fsv-offline-queue";
const STORE_NAME = "queue";
const DB_VERSION = 1;

export type QueuedFsvAction =
  | {
      id: string;
      fsvId: string;
      kind: "photo";
      queuedAt: string;
      file: Blob;
      fileName: string;
      caption?: string;
    }
  | {
      id: string;
      fsvId: string;
      kind: "signature";
      queuedAt: string;
      file: Blob;
    }
  | {
      id: string;
      fsvId: string;
      kind: "part";
      queuedAt: string;
      body: {
        itemCode: string;
        itemName: string;
        qty: number;
        uom: string;
        warehouse: string;
        rate: number;
        sellingRate: number;
      };
    }
  | {
      id: string;
      fsvId: string;
      kind: "submit";
      queuedAt: string;
    };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueFsvAction(action: QueuedFsvAction): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(action);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listQueuedFsvActions(fsvId: string): Promise<QueuedFsvAction[]> {
  const db = await openDb();
  const all = await new Promise<QueuedFsvAction[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueuedFsvAction[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return all.filter((a) => a.fsvId === fsvId).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeQueuedFsvAction(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** A fetch() network failure (offline, DNS, connection refused) throws TypeError — distinct from an ApiError, which means the request reached the server and got a real HTTP error status back. Only network failures should be queued; a real 4xx/5xx should surface normally. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

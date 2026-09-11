import type { Fact } from '@platform/data';

/**
 * The local store. Everything the subscriber writes lives here and nowhere
 * else.
 *
 * This module is the general advice boundary expressed as a fact about where
 * bytes live. There is no server mirror, no sync, no best-effort backup, and
 * no fetch anywhere in this file — a reviewer can establish that by reading it,
 * which is the point. `prose.test.ts` asserts it over the built source.
 *
 * The cost is real: cleared browser data destroys a pack. That is handled
 * honestly rather than quietly, by `exportWorkingCopy` and a first-run message
 * that says packs live on this device. Once, clearly, with no nagging.
 */

const DB_NAME = 'bts-prepare';
const DB_VERSION = 1;

const PACKS = 'packs';
const RESPONSES = 'responses';
const SNAPSHOTS = 'snapshots';

export interface StoredPack {
  id: string;
  templateSlug: string;
  templateVersion: string;
  artefactType: string;
  /** Subscriber-editable. Defaults to the template title. */
  title: string;
  status: 'in_progress' | 'complete';
  createdAt: string;
  updatedAt: string;
}

export interface StoredResponse {
  /** `${packId}:${sectionId}` — IndexedDB keys are single values. */
  id: string;
  packId: string;
  sectionId: string;
  /** The subscriber's prose. Never transmitted. */
  body: string;
  skipped: boolean;
  updatedAt: string;
}

export interface StoredFactSnapshot {
  packId: string;
  fetchedAt: string;
  facts: Fact[];
}

/** A pack and everything belonging to it, for export and import. */
export interface WorkingCopy {
  formatVersion: 1;
  pack: StoredPack;
  responses: StoredResponse[];
  snapshot: StoredFactSnapshot | null;
  exportedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PACKS)) {
        db.createObjectStore(PACKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(RESPONSES)) {
        const store = db.createObjectStore(RESPONSES, { keyPath: 'id' });
        store.createIndex('packId', 'packId', { unique: false });
      }
      if (!db.objectStoreNames.contains(SNAPSHOTS)) {
        db.createObjectStore(SNAPSHOTS, { keyPath: 'packId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = work(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export function responseKey(packId: string, sectionId: string): string {
  return `${packId}:${sectionId}`;
}

export async function listPacks(): Promise<StoredPack[]> {
  const packs = await run<StoredPack[]>(PACKS, 'readonly', (store) => store.getAll());
  return packs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getPack(id: string): Promise<StoredPack | undefined> {
  return run<StoredPack | undefined>(PACKS, 'readonly', (store) => store.get(id));
}

export async function savePack(pack: StoredPack): Promise<void> {
  await run(PACKS, 'readwrite', (store) => store.put(pack));
}

export async function deletePack(id: string): Promise<void> {
  const responses = await listResponses(id);
  await Promise.all([
    run(PACKS, 'readwrite', (store) => store.delete(id)),
    run(SNAPSHOTS, 'readwrite', (store) => store.delete(id)),
    ...responses.map((response) =>
      run(RESPONSES, 'readwrite', (store) => store.delete(response.id)),
    ),
  ]);
}

export function listResponses(packId: string): Promise<StoredResponse[]> {
  return run<StoredResponse[]>(RESPONSES, 'readonly', (store) =>
    store.index('packId').getAll(packId),
  );
}

export async function saveResponse(response: StoredResponse): Promise<void> {
  await run(RESPONSES, 'readwrite', (store) => store.put(response));
}

export function getSnapshot(packId: string): Promise<StoredFactSnapshot | undefined> {
  return run<StoredFactSnapshot | undefined>(SNAPSHOTS, 'readonly', (store) =>
    store.get(packId),
  );
}

export async function saveSnapshot(snapshot: StoredFactSnapshot): Promise<void> {
  await run(SNAPSHOTS, 'readwrite', (store) => store.put(snapshot));
}

/**
 * The backup mechanism, and the subscriber's to operate.
 *
 * Local-only storage has a real cost and this is the honest answer to it rather
 * than a quiet one: a JSON file the subscriber holds, which also happens to be
 * the hand-off when two trustees need to contribute to one minute. That is a
 * workaround, it is the first thing anyone will complain about, and it is
 * better than the alternative of putting their prose on a server.
 */
export async function exportWorkingCopy(packId: string): Promise<WorkingCopy> {
  const [pack, responses, snapshot] = await Promise.all([
    getPack(packId),
    listResponses(packId),
    getSnapshot(packId),
  ]);

  if (!pack) throw new Error(`No pack ${packId} on this device`);

  return {
    formatVersion: 1,
    pack,
    responses,
    snapshot: snapshot ?? null,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Restore a working copy.
 *
 * Given a new id, always. Importing over the top of an existing pack is how
 * someone loses an afternoon's writing to a file they thought was newer, and
 * two packs side by side is a problem the subscriber can see and solve.
 */
export async function importWorkingCopy(copy: WorkingCopy, newId: string): Promise<string> {
  if (copy.formatVersion !== 1) {
    throw new Error('This working copy was written by a different version of Minute');
  }

  const now = new Date().toISOString();

  await savePack({ ...copy.pack, id: newId, updatedAt: now });

  await Promise.all(
    copy.responses.map((response) =>
      saveResponse({
        ...response,
        id: responseKey(newId, response.sectionId),
        packId: newId,
      }),
    ),
  );

  if (copy.snapshot) await saveSnapshot({ ...copy.snapshot, packId: newId });

  return newId;
}

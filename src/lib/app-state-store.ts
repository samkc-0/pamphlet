const APP_STATE_DATABASE_NAME = "pamphlet-state";
const APP_STATE_DATABASE_VERSION = 1;
const APP_STATE_KEY = "app-state";
const APP_STATE_STORE_NAME = "records";

type StoredAppStateRecord = {
  id: string;
  state: unknown;
  updatedAt: number;
};

export async function readStoredAppState() {
  const database = await openAppStateDatabase();

  return new Promise<unknown | undefined>((resolve, reject) => {
    const transaction = database.transaction(APP_STATE_STORE_NAME, "readonly");
    const store = transaction.objectStore(APP_STATE_STORE_NAME);
    const request = store.get(APP_STATE_KEY);

    request.onsuccess = () => {
      const record = request.result as StoredAppStateRecord | undefined;
      resolve(record?.state);
    };
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function writeStoredAppState(state: unknown) {
  const database = await openAppStateDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(APP_STATE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(APP_STATE_STORE_NAME);
    const record: StoredAppStateRecord = {
      id: APP_STATE_KEY,
      state,
      updatedAt: Date.now()
    };
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

function openAppStateDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(
      APP_STATE_DATABASE_NAME,
      APP_STATE_DATABASE_VERSION
    );

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(APP_STATE_STORE_NAME)) {
        database.createObjectStore(APP_STATE_STORE_NAME, {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

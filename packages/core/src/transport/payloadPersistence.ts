import type { Payload } from "./batch";

export interface PersistentPayload extends Payload {
  timestamp: number;
}

const STORAGE_KEY = "__FC_RUM_PENDING_PAYLOADS__";
const MAX_PERSISTED_PAYLOADS = 10;
const MAX_TOTAL_BYTES = 1024 * 1024; // 1MiB
const PAYLOAD_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours

export interface StorageAdapter {
  setStorageSync: (key: string, data: unknown) => void;
  getStorageSync: (key: string) => unknown;
  removeStorageSync: (key: string) => void;
}

export function persistPayload(adapter: StorageAdapter, payload: Payload) {
  try {
    let persisted: PersistentPayload[] =
      (adapter.getStorageSync(STORAGE_KEY) as PersistentPayload[]) || [];

    // Filter expired
    const now = Date.now();
    persisted = persisted.filter((p) => now - p.timestamp < PAYLOAD_EXPIRATION);

    // Add new
    persisted.push({
      ...payload,
      timestamp: now,
    });

    // Limit count and size
    while (
      persisted.length > MAX_PERSISTED_PAYLOADS ||
      calculateTotalBytes(persisted) > MAX_TOTAL_BYTES
    ) {
      persisted.shift();
    }

    adapter.setStorageSync(STORAGE_KEY, persisted);
  } catch (e) {
    // Fail silently to avoid infinite loops if storage is full
  }
}

export function loadAndClearPersistedPayloads(
  adapter: StorageAdapter
): Payload[] {
  try {
    const persisted =
      (adapter.getStorageSync(STORAGE_KEY) as PersistentPayload[]) || [];
    adapter.removeStorageSync(STORAGE_KEY);

    const now = Date.now();
    return persisted
      .filter((p) => now - p.timestamp < PAYLOAD_EXPIRATION)
      .map(({ timestamp, ...payload }) => payload);
  } catch (e) {
    return [];
  }
}

function calculateTotalBytes(payloads: PersistentPayload[]): number {
  return payloads.reduce((sum, p) => sum + p.bytesCount, 0);
}

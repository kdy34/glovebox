// Client-generated UUIDs for idempotent upserts (offline outbox). T102: use expo-crypto's
// native randomUUID. The `uuid` package needs crypto.getRandomValues(), which Hermes doesn't
// provide, so it threw on every save.
import { randomUUID } from 'expo-crypto';

export const newId = (): string => randomUUID();

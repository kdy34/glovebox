// Garage card text (T104). The subtitle never repeats the title.

export interface CardVehicle {
  nickname: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
}

export type CardSubtitle =
  | { kind: 'text'; text: string }
  | { kind: 'lastService'; date: string } // YYYY-MM-DD
  | { kind: 'noService' };

/**
 * `lastServiceOn`: the latest service date, `null` when the car has no service records,
 * `undefined` while records are loading (no subtitle then, so we never claim "no services" too early).
 */
export function vehicleCardText(v: CardVehicle, lastServiceOn: string | null | undefined): { title: string; subtitle: CardSubtitle | null } {
  const ymm = `${v.year} ${v.make} ${v.model}`;
  const nickname = v.nickname?.trim() ?? '';
  if (nickname && nickname.toLowerCase() !== ymm.toLowerCase()) {
    return { title: nickname, subtitle: { kind: 'text', text: ymm } };
  }
  const trim = v.trim?.trim() ?? '';
  if (trim) return { title: ymm, subtitle: { kind: 'text', text: trim } };
  if (lastServiceOn === undefined) return { title: ymm, subtitle: null };
  return { title: ymm, subtitle: lastServiceOn ? { kind: 'lastService', date: lastServiceOn } : { kind: 'noService' } };
}

/** Latest `performed_on` of the service records (expenses don't count). */
export function lastServiceDate(records: readonly { kind: string; performed_on: string }[] | undefined): string | null | undefined {
  if (records === undefined) return undefined;
  let latest: string | null = null;
  for (const r of records) if (r.kind === 'service' && (latest === null || r.performed_on > latest)) latest = r.performed_on;
  return latest;
}

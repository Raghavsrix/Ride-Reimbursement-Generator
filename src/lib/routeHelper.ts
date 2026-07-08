export function getEffectivePickup(pickup?: string | null): string {
  if (!pickup) return 'TrueFan sector 19';
  const clean = pickup.trim();
  const lower = clean.toLowerCase();
  if (
    lower === '' ||
    lower === 'unknown pickup' ||
    lower === 'imported pickup' ||
    lower === 'manual pickup location' ||
    lower === 'manual pickup point' ||
    lower === 'manual pickup' ||
    lower === 'uber receipts' ||
    lower === 'b' ||
    lower === 'h' ||
    lower === 'unknown' ||
    lower === 'n/a' ||
    lower === '—'
  ) {
    return 'TrueFan sector 19';
  }
  return clean;
}

export function getEffectiveDropoff(dropoff?: string | null): string {
  if (!dropoff) return 'UWG 1 sector 47';
  const clean = dropoff.trim();
  const lower = clean.toLowerCase();
  if (
    lower === '' ||
    lower === 'unknown destination' ||
    lower === 'imported destination' ||
    lower === 'manual dropoff location' ||
    lower === 'manual destination point' ||
    lower === 'manual dropoff' ||
    lower === 'b' ||
    lower === 'h' ||
    lower === 'unknown' ||
    lower === 'n/a' ||
    lower === '—'
  ) {
    return 'UWG 1 sector 47';
  }
  return clean;
}

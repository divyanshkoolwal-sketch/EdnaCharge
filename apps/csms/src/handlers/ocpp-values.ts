/** OCPP value conversion helpers for status and meter samples. */
export function finiteNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function energyToWh(sample: { value: string; unit?: string } | undefined): number | null {
  const n = finiteNumber(sample?.value);
  if (n == null) return null;
  const unit = sample?.unit?.toLowerCase();
  if (unit === 'kwh') return n * 1000;
  if (unit === 'mwh') return n * 1_000_000;
  return n;
}

export function powerToW(sample: { value: string; unit?: string } | undefined): number | null {
  const n = finiteNumber(sample?.value);
  if (n == null) return null;
  const unit = sample?.unit?.toLowerCase();
  if (unit === 'kw') return n * 1000;
  return n;
}

export function mapOcppStatus(s?: string): 'available' | 'occupied' | 'faulted' | 'offline' | null {
  switch (s) {
    case 'Available':
      return 'available';
    case 'Preparing':
    case 'Charging':
    case 'SuspendedEV':
    case 'SuspendedEVSE':
    case 'Finishing':
      return 'occupied';
    case 'Faulted':
    case 'Unavailable':
      return 'faulted';
    default:
      return null;
  }
}

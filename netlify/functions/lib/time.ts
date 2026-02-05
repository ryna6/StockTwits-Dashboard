export function nowISO() {
  return new Date().toISOString();
}

export function toUTCDateISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function parseISO(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ISO date: ${s}`);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function daysBackList(rangeDays: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = rangeDays - 1; i >= 0; i--) {
    out.push(toUTCDateISO(addDays(today, -i)));
  }
  return out;
}

export function hoursAgoDate(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}


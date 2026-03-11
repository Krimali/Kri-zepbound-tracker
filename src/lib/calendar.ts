export const WEEK1_START = "2025-12-30";

export function weekNumberFromISO(iso: string) {
  const [startY, startM, startD] = WEEK1_START.split("-").map(Number);
  const [y, m, d] = iso.split("-").map(Number);

  const startUTC = Date.UTC(startY, startM - 1, startD);
  const dateUTC = Date.UTC(y, m - 1, d);

  const diffDays = Math.floor((dateUTC - startUTC) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

export function dayInWeekFromISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const map: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6, 1: 7 };
  return map[js];
}

export function isoFromWeekAndDay(week: number, day: number) {
  const [startY, startM, startD] = WEEK1_START.split("-").map(Number);
  const startUTC = Date.UTC(startY, startM - 1, startD);
  const offsetDays = (week - 1) * 7 + (day - 1);
  const d = new Date(startUTC + offsetDays * 24 * 60 * 60 * 1000);

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function weekRangeFromWeekNumber(week: number) {
  return {
    start: isoFromWeekAndDay(week, 1),
    end: isoFromWeekAndDay(week, 7),
  };
}
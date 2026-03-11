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
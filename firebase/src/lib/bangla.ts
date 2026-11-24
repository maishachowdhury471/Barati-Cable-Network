// ---------- বাংলা সংখ্যা ও তারিখ ----------

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export function bnNum(n: number | string): string {
  return String(n)
    .split("")
    .map((ch) => (ch >= "0" && ch <= "9" ? BN_DIGITS[Number(ch)] : ch))
    .join("");
}
export function bnMoney(n: number): string {
  return `${bnNum(n)} টাকা`;
}
const BN_MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];
export function bnDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = iso.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y == null || m == null || d == null || Number.isNaN(y)) return iso;
  return `${bnNum(d)} ${BN_MONTHS[m - 1] ?? ""} ${bnNum(y)}`;
}
export function bnDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = iso.split("-").map(Number);
  const m = parts[1];
  const d = parts[2];
  if (m == null || d == null) return iso;
  return `${bnNum(d)} ${BN_MONTHS[m - 1] ?? ""}`;
}
export function todayStr(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export const ORDINALS = ["১ম", "২য়", "৩য়", "৪র্থ", "৫ম", "৬ষ্ঠ", "৭ম", "৮ম", "৯ম", "১০ম", "১১তম", "১২তম"];
export function cycleLabel(idx: number): string {
  return `${ORDINALS[idx - 1] ?? bnNum(idx)} মাস`;
}

export function routerUrl(ip: string | null | undefined): string | null {
  const clean = (ip ?? "").trim();
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) return clean;
  return `http://${clean}`;
}

// ---------- আসল ক্যালেন্ডার হিসাব (৩০ দিন যোগ করা নয়) ----------
// Anchor day মনে রাখা হয়: ৩১ জানু → ২৮/২৯ ফেব্রু (শেষ দিন) → আবার ৩১ মার্চ

export function daysInMonth(year: number, month1to12: number): number {
  if (month1to12 === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month1to12)) return 30;
  return 31;
}

function parseYMD(s: string): { y: number; m: number; d: number } | null {
  const parts = s.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y == null || m == null || d == null || Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return { y, m, d };
}

function fmtYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** লাইন দেওয়ার তারিখ (anchor) থেকে offset মাস পরের তারিখ। */
export function anchoredAddMonths(anchor: string, offset: number): string {
  const p = parseYMD(anchor);
  if (!p) return anchor;
  const total = p.y * 12 + (p.m - 1) + offset;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const td = Math.min(p.d, daysInMonth(ty, tm));
  return fmtYMD(ty, tm, td);
}

function minusOneDay(dateStr: string): string {
  const p = parseYMD(dateStr);
  if (!p) return dateStr;
  let { y, m, d } = p;
  d -= 1;
  if (d < 1) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    d = daysInMonth(y, m);
  }
  return fmtYMD(y, m, d);
}

/** ১২ মাসের কার্ডের cycleIndex নম্বর মাসের শুরু ও শেষ তারিখ। */
export function periodForCycle(anchor: string, cycleIndex: number): { start: string; end: string } {
  const start = anchoredAddMonths(anchor, cycleIndex - 1);
  const nextStart = anchoredAddMonths(anchor, cycleIndex);
  const end = minusOneDay(nextStart);
  return { start, end };
}

/** আজ কোন মাস চলছে: 0 = এখনো শুরু হয়নি, 1–12 = কার্ডের মাস, 13 = ১২ মাস শেষ। */
export function currentCycleIndex(anchor: string, today: string): number {
  if (today < anchor) return 0;
  for (let k = 1; k <= 12; k++) {
    const nextStart = anchoredAddMonths(anchor, k);
    if (today < nextStart) return k;
  }
  return 13;
}

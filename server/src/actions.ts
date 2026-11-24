import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { asc, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

// ---------- Calendar helpers (আসল ক্যালেন্ডার — ৩০ দিন যোগ করা নয়) ----------
function daysInMonth(year: number, month1to12: number): number {
  // month 1-12
  if (month1to12 === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month1to12)) return 30;
  return 31;
}
function parseYMD(s: string): { y: number; m: number; d: number } | null {
  const parts = s.split("-").map(Number);
  const y = parts[0]; const m = parts[1]; const d = parts[2];
  if (y == null || m == null || d == null || Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return { y, m, d };
}
function fmtYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
// Anchor day মনে রাখা হয়: ৩১ জানু → ২৮/২৯ ফেব্রু (শেষ দিন) → আবার ৩১ মার্চ
function anchoredAddMonths(anchor: string, offset: number): string {
  const p = parseYMD(anchor);
  if (!p) return anchor;
  const total = (p.y * 12 + (p.m - 1)) + offset;
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
    if (m < 1) { m = 12; y -= 1; }
    d = daysInMonth(y, m);
  }
  return fmtYMD(y, m, d);
}
function periodForCycle(anchor: string, cycleIndex: number): { start: string; end: string } {
  const start = anchoredAddMonths(anchor, cycleIndex - 1);
  const nextStart = anchoredAddMonths(anchor, cycleIndex);
  const end = minusOneDay(nextStart);
  return { start, end };
}
function currentCycleIndex(anchor: string, todayStr: string): number {
  // today < anchor হলে 0, anchor দিন থেকে 1, 12 মাস পার হলে 13
  if (todayStr < anchor) return 0;
  for (let k = 1; k <= 12; k++) {
    const nextStart = anchoredAddMonths(anchor, k);
    if (todayStr < nextStart) return k;
  }
  return 13;
}
function todayStrDefault(): string {
  const t = new Date();
  return fmtYMD(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

const customerShape = z.object({
  id: z.number(),
  name: z.string(),
  mobile: z.string(),
  address: z.string(),
  packageName: z.string(),
  monthlyFee: z.number(),
  connectionDate: z.string().nullable(),
  lineStatus: z.enum(["on", "off"]),
  routerBrand: z.string(),
  routerModel: z.string(),
  routerIp: z.string(),
  wifiName: z.string(),
  wifiPassword: z.string(),
  pppoeUser: z.string(),
  pppoePass: z.string(),
  onuInfo: z.string(),
  notes: z.string(),
  createdAt: z.string(),
});

function toCustomer(row: typeof schema.customers.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    address: row.address,
    packageName: row.packageName,
    monthlyFee: 500, // সবার জন্য একই বিল ৫০০ টাকা
    connectionDate: row.connectionDate,
    lineStatus: row.lineStatus as "on" | "off",
    routerBrand: row.routerBrand,
    routerModel: row.routerModel,
    routerIp: row.routerIp,
    wifiName: row.wifiName,
    wifiPassword: row.wifiPassword,
    pppoeUser: row.pppoeUser,
    pppoePass: row.pppoePass,
    onuInfo: row.onuInfo,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}
function anchorOf(row: typeof schema.customers.$inferSelect): string {
  if (row.connectionDate) return row.connectionDate;
  const c = row.createdAt;
  return fmtYMD(c.getFullYear(), c.getMonth() + 1, c.getDate());
}

const customerInput = {
  name: z.string().trim().min(1, "নাম লিখুন").max(100),
  mobile: z.string().trim().min(6, "মোবাইল নম্বর লিখুন").max(20),
  address: z.string().trim().max(300).default(""),
  packageName: z.string().trim().max(80).default(""),
  connectionDate: z.string().trim().max(20).nullable().optional(),
  routerBrand: z.string().trim().max(80).default(""),
  routerModel: z.string().trim().max(80).default(""),
  routerIp: z.string().trim().max(60).default(""),
  wifiName: z.string().trim().max(80).default(""),
  wifiPassword: z.string().trim().max(100).default(""),
  pppoeUser: z.string().trim().max(100).default(""),
  pppoePass: z.string().trim().max(100).default(""),
  onuInfo: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(500).default(""),
};

export const Actions = {
  getDashboard: defineAction({
    description: "ড্যাশবোর্ড: মোট কাস্টমার, লাইন চালু/বন্ধ, চলতি মাসের (লাইন দেওয়ার তারিখ ধরে) আদায় ও বকেয়া।",
    request: z.object({ today: z.string().trim().max(20) }),
    response: z.object({
      totalCustomers: z.number(),
      lineOn: z.number(),
      lineOff: z.number(),
      collectedCurrentCycle: z.number(),
      paidCurrentCycleCount: z.number(),
      dueCurrentCycleCount: z.number(),
      dueCurrentCycleAmount: z.number(),
      totalCollectedAll: z.number(),
      totalPaidEntries: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const today = args.today || todayStrDefault();
      const allCustomers = await db.select().from(schema.customers);
      const allPays = await db.select().from(schema.payments);
      const paySet = new Set(allPays.map((p) => `${p.customerId}:${p.cycleIndex}`));
      let paidCurrent = 0;
      let dueCurrent = 0;
      let collectedCurrent = 0;
      for (const c of allCustomers) {
        const anchor = anchorOf(c);
        const cur = currentCycleIndex(anchor, today);
        if (cur >= 1 && cur <= 12) {
          if (paySet.has(`${c.id}:${cur}`)) {
            paidCurrent += 1;
            collectedCurrent += 500;
          } else {
            dueCurrent += 1;
          }
        }
      }
      return {
        totalCustomers: allCustomers.length,
        lineOn: allCustomers.filter((c) => c.lineStatus === "on").length,
        lineOff: allCustomers.filter((c) => c.lineStatus === "off").length,
        collectedCurrentCycle: collectedCurrent,
        paidCurrentCycleCount: paidCurrent,
        dueCurrentCycleCount: dueCurrent,
        dueCurrentCycleAmount: dueCurrent * 500,
        totalCollectedAll: allPays.reduce((s, p) => s + p.amount, 0),
        totalPaidEntries: allPays.length,
      };
    },
  }),

  listCustomers: defineAction({
    description: "ওয়াইফাই কাস্টমার তালিকা — প্রত্যেকের চলতি মাস নম্বর, মেয়াদ (শুরু-শেষ তারিখ) ও বিলের অবস্থাসহ।",
    request: z.object({
      today: z.string().trim().max(20),
      search: z.string().trim().max(100).default(""),
      filter: z.enum(["all", "on", "off", "paid", "due"]).default("all"),
    }),
    response: z.object({
      customers: z.array(
        customerShape.extend({
          currentCycle: z.number(),
          currentPeriodStart: z.string().nullable(),
          currentPeriodEnd: z.string().nullable(),
          paidCurrentCycle: z.boolean(),
          paidCyclesCount: z.number(),
        })
      ),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const today = args.today || todayStrDefault();
      const rows = await db.select().from(schema.customers).orderBy(asc(schema.customers.name));
      const pays = await db.select().from(schema.payments);
      const paySet = new Set(pays.map((p) => `${p.customerId}:${p.cycleIndex}`));
      const countMap = new Map<number, number>();
      for (const p of pays) countMap.set(p.customerId, (countMap.get(p.customerId) ?? 0) + 1);

      let list = rows.map((r) => {
        const anchor = anchorOf(r);
        const cur = currentCycleIndex(anchor, today);
        const inCard = cur >= 1 && cur <= 12;
        const period = inCard ? periodForCycle(anchor, cur) : null;
        return {
          ...toCustomer(r),
          connectionDate: anchor,
          currentCycle: cur,
          currentPeriodStart: period ? period.start : null,
          currentPeriodEnd: period ? period.end : null,
          paidCurrentCycle: inCard ? paySet.has(`${r.id}:${cur}`) : false,
          paidCyclesCount: countMap.get(r.id) ?? 0,
        };
      });
      if (args.search) {
        const q = args.search.toLowerCase();
        list = list.filter((c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q) || c.address.toLowerCase().includes(q) || c.wifiName.toLowerCase().includes(q));
      }
      if (args.filter === "on") list = list.filter((c) => c.lineStatus === "on");
      if (args.filter === "off") list = list.filter((c) => c.lineStatus === "off");
      if (args.filter === "paid") list = list.filter((c) => c.paidCurrentCycle);
      if (args.filter === "due") list = list.filter((c) => c.currentCycle >= 1 && c.currentCycle <= 12 && !c.paidCurrentCycle);
      return { customers: list };
    },
  }),

  getCustomerCard: defineAction({
    description: "একজন কাস্টমারের ১২ মাসের ডিজিটাল কার্ড — লাইন দেওয়ার তারিখ থেকে ক্যালেন্ডার ধরে প্রতিটা মাসের শুরু-শেষ তারিখসহ।",
    request: z.object({ customerId: z.number().int().positive(), today: z.string().trim().max(20) }),
    response: z.object({
      customer: customerShape,
      currentCycle: z.number(),
      slots: z.array(
        z.object({
          cycleIndex: z.number(),
          periodStart: z.string(),
          periodEnd: z.string(),
          isCurrent: z.boolean(),
          paid: z.boolean(),
          paymentId: z.number().nullable(),
          amount: z.number(),
          paidDate: z.string().nullable(),
          method: z.string().nullable(),
        })
      ),
      totalPaid: z.number(),
      paidCount: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const today = args.today || todayStrDefault();
      const custRows = await db.select().from(schema.customers).where(eq(schema.customers.id, args.customerId)).limit(1);
      const cust = custRows[0];
      if (!cust) throw new Error("কাস্টমার পাওয়া যায়নি");
      const anchor = anchorOf(cust);
      const cur = currentCycleIndex(anchor, today);
      const pays = await db.select().from(schema.payments).where(eq(schema.payments.customerId, args.customerId));
      const payMap = new Map(pays.map((p) => [p.cycleIndex, p]));
      const slots = Array.from({ length: 12 }, (_, i) => {
        const idx = i + 1;
        const period = periodForCycle(anchor, idx);
        const p = payMap.get(idx);
        return {
          cycleIndex: idx,
          periodStart: period.start,
          periodEnd: period.end,
          isCurrent: cur === idx,
          paid: !!p,
          paymentId: p ? p.id : null,
          amount: 500,
          paidDate: p ? p.paidDate : null,
          method: p ? p.method : null,
        };
      });
      return {
        customer: { ...toCustomer(cust), connectionDate: anchor },
        currentCycle: cur,
        slots,
        totalPaid: pays.length * 500,
        paidCount: pays.length,
      };
    },
  }),

  addCustomer: defineAction({
    description: "নতুন ওয়াইফাই কাস্টমার যোগ করা (বিল সবার জন্য ৫০০ টাকা, কার্ড লাইন দেওয়ার তারিখ থেকে শুরু)।",
    request: z.object(customerInput),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const conn = args.connectionDate || todayStrDefault();
      const result = await db
        .insert(schema.customers)
        .values({
          name: args.name,
          mobile: args.mobile,
          address: args.address ?? "",
          packageName: args.packageName ?? "",
          monthlyFee: 500,
          connectionDate: conn,
          lineStatus: "on",
          routerBrand: args.routerBrand ?? "",
          routerModel: args.routerModel ?? "",
          routerIp: args.routerIp ?? "",
          wifiName: args.wifiName ?? "",
          wifiPassword: args.wifiPassword ?? "",
          pppoeUser: args.pppoeUser ?? "",
          pppoePass: args.pppoePass ?? "",
          onuInfo: args.onuInfo ?? "",
          notes: args.notes ?? "",
        })
        .returning({ id: schema.customers.id });
      const inserted = result[0];
      if (!inserted) throw new Error("কাস্টমার যোগ করা যায়নি");
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  updateCustomer: defineAction({
    description: "কাস্টমারের তথ্য বদলানো।",
    request: z.object({ id: z.number().int().positive(), ...customerInput }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.customers)
        .set({
          name: args.name,
          mobile: args.mobile,
          address: args.address ?? "",
          packageName: args.packageName ?? "",
          monthlyFee: 500,
          connectionDate: args.connectionDate || null,
          routerBrand: args.routerBrand ?? "",
          routerModel: args.routerModel ?? "",
          routerIp: args.routerIp ?? "",
          wifiName: args.wifiName ?? "",
          wifiPassword: args.wifiPassword ?? "",
          pppoeUser: args.pppoeUser ?? "",
          pppoePass: args.pppoePass ?? "",
          onuInfo: args.onuInfo ?? "",
          notes: args.notes ?? "",
        })
        .where(eq(schema.customers.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  deleteCustomer: defineAction({
    description: "কাস্টমার ও তার সব বিলের হিসাব মুছে ফেলা।",
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.payments).where(eq(schema.payments.customerId, args.id));
      await db.delete(schema.customers).where(eq(schema.customers.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  toggleLine: defineAction({
    description: "কাস্টমারের ওয়াইফাই লাইন চালু বা বন্ধ করা।",
    request: z.object({ customerId: z.number().int().positive(), status: z.enum(["on", "off"]) }),
    response: z.object({ ok: z.literal(true), status: z.enum(["on", "off"]) }),
    async handler(ctx, args): Promise<{ ok: true; status: "on" | "off" }> {
      const db = ctx.db<typeof schema>();
      await db.update(schema.customers).set({ lineStatus: args.status }).where(eq(schema.customers.id, args.customerId));
      ctx.invalidateQueries();
      return { ok: true as const, status: args.status };
    },
  }),

  togglePayment: defineAction({
    description: "কার্ডের একটা মাসে বিল দেওয়া হয়েছে বলে টিক দেওয়া বা টিক তুলে নেওয়া (টাকা সবসময় ৫০০)।",
    request: z.object({
      customerId: z.number().int().positive(),
      cycleIndex: z.number().int().min(1).max(12),
      method: z.string().trim().max(30).default("নগদ"),
      paidDate: z.string().trim().max(20).optional(),
    }),
    response: z.object({ ok: z.literal(true), nowPaid: z.boolean() }),
    async handler(ctx, args): Promise<{ ok: true; nowPaid: boolean }> {
      const db = ctx.db<typeof schema>();
      const existing = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.customerId, args.customerId))
        .limit(100);
      const found = existing.find((p) => p.cycleIndex === args.cycleIndex);
      if (found) {
        await db.delete(schema.payments).where(eq(schema.payments.id, found.id));
        ctx.invalidateQueries();
        return { ok: true as const, nowPaid: false };
      }
      const custRows = await db.select().from(schema.customers).where(eq(schema.customers.id, args.customerId)).limit(1);
      const cust = custRows[0];
      if (!cust) throw new Error("কাস্টমার পাওয়া যায়নি");
      const anchor = anchorOf(cust);
      const period = periodForCycle(anchor, args.cycleIndex);
      await db.insert(schema.payments).values({
        customerId: args.customerId,
        cycleIndex: args.cycleIndex,
        periodStart: period.start,
        periodEnd: period.end,
        amount: 500,
        paidDate: args.paidDate || todayStrDefault(),
        method: args.method || "নগদ",
        note: "",
      });
      ctx.invalidateQueries();
      return { ok: true as const, nowPaid: true };
    },
  }),

  getKhata: defineAction({
    description: "খাতা: চলতি মাসে কার বাকি, আর সম্প্রতি কে কবে বিল দিয়েছে তার তালিকা।",
    request: z.object({ today: z.string().trim().max(20) }),
    response: z.object({
      dueRows: z.array(
        z.object({
          customerId: z.number(),
          name: z.string(),
          mobile: z.string(),
          currentCycle: z.number(),
          periodStart: z.string(),
          periodEnd: z.string(),
          lineStatus: z.enum(["on", "off"]),
        })
      ),
      recentPayments: z.array(
        z.object({
          id: z.number(),
          customerId: z.number(),
          name: z.string(),
          mobile: z.string(),
          cycleIndex: z.number(),
          periodStart: z.string().nullable(),
          periodEnd: z.string().nullable(),
          amount: z.number(),
          paidDate: z.string().nullable(),
          method: z.string(),
        })
      ),
      totalCollectedAll: z.number(),
      dueAmountCurrent: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const today = args.today || todayStrDefault();
      const custs = await db.select().from(schema.customers).orderBy(asc(schema.customers.name));
      const pays = await db.select().from(schema.payments).orderBy(desc(schema.payments.id));
      const paySet = new Set(pays.map((p) => `${p.customerId}:${p.cycleIndex}`));
      const custMap = new Map(custs.map((c) => [c.id, c]));
      const dueRows: {
        customerId: number; name: string; mobile: string; currentCycle: number;
        periodStart: string; periodEnd: string; lineStatus: "on" | "off";
      }[] = [];
      for (const c of custs) {
        const anchor = anchorOf(c);
        const cur = currentCycleIndex(anchor, today);
        if (cur >= 1 && cur <= 12 && !paySet.has(`${c.id}:${cur}`)) {
          const period = periodForCycle(anchor, cur);
          dueRows.push({
            customerId: c.id, name: c.name, mobile: c.mobile, currentCycle: cur,
            periodStart: period.start, periodEnd: period.end,
            lineStatus: c.lineStatus as "on" | "off",
          });
        }
      }
      // dueRows-কে মেয়াদ শেষের তারিখ অনুযায়ী সাজানো (যারটা আগে শেষ, সে আগে)
      dueRows.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
      const recentPayments = pays.slice(0, 100).map((p) => {
        const c = custMap.get(p.customerId);
        return {
          id: p.id,
          customerId: p.customerId,
          name: c ? c.name : "—",
          mobile: c ? c.mobile : "",
          cycleIndex: p.cycleIndex,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          amount: p.amount,
          paidDate: p.paidDate,
          method: p.method,
        };
      });
      return {
        dueRows,
        recentPayments,
        totalCollectedAll: pays.reduce((s, p) => s + p.amount, 0),
        dueAmountCurrent: dueRows.length * 500,
      };
    },
  }),

  listRouters: defineAction({
    description: "সব রাউটারের তালিকা: কাস্টমার, WiFi নাম, রাউটার IP, মডেল ও লাইনের অবস্থা।",
    request: z.object({ search: z.string().trim().max(100).default("") }),
    response: z.object({ customers: z.array(customerShape) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.customers).orderBy(desc(schema.customers.id));
      let list = rows.map((r) => ({ ...toCustomer(r), connectionDate: anchorOf(r) }));
      if (args.search) {
        const q = args.search.toLowerCase();
        list = list.filter((c) => c.name.toLowerCase().includes(q) || c.wifiName.toLowerCase().includes(q) || c.routerBrand.toLowerCase().includes(q) || c.routerModel.toLowerCase().includes(q) || c.mobile.includes(q));
      }
      return { customers: list };
    },
  }),
} satisfies ActionsModule;

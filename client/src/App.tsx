import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";

const FIELDS = actionFields<typeof Actions>();

type CustomerListItem = ApiResponse<typeof api, "listCustomers">["customers"][number];
type CardData = ApiResponse<typeof api, "getCustomerCard">;

const BN_DIGITS = ["০","১","২","৩","৪","৫","৬","৭","৮","৯"];
function bnNum(n: number | string): string {
  return String(n).split("").map((ch) => (ch >= "0" && ch <= "9" ? BN_DIGITS[Number(ch)] : ch)).join("");
}
function bnMoney(n: number): string { return `${bnNum(n)} টাকা`; }
const BN_MONTHS = ["জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","নভেম্বর","ডিসেম্বর"];
function bnDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = iso.split("-").map(Number);
  const y = parts[0]; const m = parts[1]; const d = parts[2];
  if (y == null || m == null || d == null || Number.isNaN(y)) return iso;
  return `${bnNum(d)} ${BN_MONTHS[m - 1] ?? ""} ${bnNum(y)}`;
}
function bnDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = iso.split("-").map(Number);
  const m = parts[1]; const d = parts[2];
  if (m == null || d == null) return iso;
  return `${bnNum(d)} ${BN_MONTHS[m - 1] ?? ""}`;
}
function todayStr(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
const ORDINALS = ["১ম","২য়","৩য়","৪র্থ","৫ম","৬ষ্ঠ","৭ম","৮ম","৯ম","১০ম","১১তম","১২তম"];
function cycleLabel(idx: number): string { return `${ORDINALS[idx - 1] ?? bnNum(idx)} মাস`; }

type Tab = "home" | "customers" | "khata" | "routers";
type Filter = "all" | "on" | "off" | "paid" | "due";

export function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CustomerListItem | null>(null);
  const today = useMemo(() => todayStr(), []);

  if (selectedId != null) {
    return (
      <>
        <CustomerCardPage
          customerId={selectedId}
          today={today}
          onBack={() => setSelectedId(null)}
          onEdit={(c) => { setEditing(c as unknown as CustomerListItem); setShowForm(true); }}
        />
        {showForm && (
          <CustomerForm
            initial={editing}
            today={today}
            onClose={() => { setShowForm(false); setEditing(null); }}
            onSaved={() => { setShowForm(false); setEditing(null); }}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] pb-24">
      <header className="sticky top-0 z-20 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border)] pt-safe">
        <div className="px-4 py-3 max-w-3xl mx-auto">
          <h1 className="text-xl font-bold leading-tight">আব্বুর ওয়াইফাই ডিজিটাল খাতা</h1>
          <p className="text-sm text-[var(--dim)]">শুধু ওয়াইফাই কাস্টমার • সবার বিল মাসে {bnMoney(500)} • কার্ড লাইন দেওয়ার তারিখ থেকে ১২ মাস</p>
        </div>
      </header>

      <main className="px-4 max-w-3xl mx-auto pt-4">
        {tab === "home" && <HomeTab today={today} onOpenCustomer={setSelectedId} onGoCustomers={() => setTab("customers")} />}
        {tab === "customers" && (
          <CustomersTab today={today} onOpenCustomer={setSelectedId} onAdd={() => { setEditing(null); setShowForm(true); }} />
        )}
        {tab === "khata" && <KhataTab today={today} onOpenCustomer={setSelectedId} />}
        {tab === "routers" && <RoutersTab onOpenCustomer={setSelectedId} />}
      </main>

      {/* Bottom nav */}
      <nav aria-label="প্রধান মেনু" className="fixed bottom-0 left-0 right-0 z-20 bg-[var(--surface)] border-t border-[var(--border)] pb-safe">
        <div className="max-w-3xl mx-auto grid grid-cols-4">
          {([
            ["home", "🏠 হোম"],
            ["customers", "👥 কাস্টমার"],
            ["khata", "📒 খাতা"],
            ["routers", "📶 রাউটার"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-label={label}
              aria-current={tab === key ? "page" : undefined}
              className={`py-3 text-base font-semibold ${tab === key ? "text-[var(--accent)]" : "text-[var(--dim)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {showForm && (
        <CustomerForm
          initial={editing}
          today={today}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={(id) => { setShowForm(false); setEditing(null); setSelectedId(id); }}
        />
      )}
    </div>
  );
}

function LineToggle({ status, customerId, large }: { status: "on" | "off"; customerId: number; large?: boolean }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (next: "on" | "off") => await api.toggleLine({ customerId, status: next }),
    onSuccess: () => { void qc.invalidateQueries(); },
    onError: () => {},
  });
  const isOn = status === "on";
  return (
    <button
      onClick={(e) => { e.stopPropagation(); mut.mutate(isOn ? "off" : "on"); }}
      aria-label={isOn ? "লাইন বন্ধ করুন" : "লাইন চালু করুন"}
      className={`${large ? "px-5 py-3 text-lg" : "px-4 py-2 text-base"} rounded-full font-bold text-white shrink-0 ${isOn ? "bg-[#166534]" : "bg-[#dc2626]"}`}
    >
      {isOn ? "🟢 লাইন চালু" : "🔴 লাইন বন্ধ"}
    </button>
  );
}

function HomeTab({ today, onOpenCustomer, onGoCustomers }: { today: string; onOpenCustomer: (id: number) => void; onGoCustomers: () => void }) {
  const dash = useQuery({ queryKey: ["dashboard", today], queryFn: () => api.getDashboard({ today }) });
  const dueList = useQuery({ queryKey: ["customers", today, "", "due"], queryFn: () => api.listCustomers({ today, search: "", filter: "due" }) });

  return (
    <div className="space-y-4">
      <section aria-label="এই মাসের হিসাব" className="rounded-2xl bg-[var(--accent)] text-white p-5">
        <p className="text-base opacity-90">চলতি মাসে আদায় হয়েছে</p>
        <p className="text-4xl font-bold mt-1">{dash.data ? bnMoney(dash.data.collectedCurrentCycle) : "…"}</p>
        <p className="text-base mt-2 opacity-90">
          {dash.data ? `${bnNum(dash.data.paidCurrentCycleCount)} জন বিল দিয়েছেন • মোট আদায় (সব মাস) ${bnMoney(dash.data.totalCollectedAll)}` : ""}
        </p>
        <div className="mt-4 rounded-xl bg-white/15 p-4">
          <p className="font-bold text-lg">বাকি আছে: {dash.data ? `${bnNum(dash.data.dueCurrentCycleCount)} জন — ${bnMoney(dash.data.dueCurrentCycleAmount)}` : "…"}</p>
          <p className="text-sm opacity-90 mt-1">প্রত্যেকের চলতি মাস তার লাইন দেওয়ার তারিখ ধরে গোনা হয়।</p>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3" aria-label="সারসংক্ষেপ">
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 text-center">
          <p className="text-3xl font-bold">{dash.data ? bnNum(dash.data.totalCustomers) : "…"}</p>
          <p className="text-sm text-[var(--dim)] mt-1">মোট কাস্টমার</p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 text-center">
          <p className="text-3xl font-bold text-[#166534]">{dash.data ? bnNum(dash.data.lineOn) : "…"}</p>
          <p className="text-sm text-[var(--dim)] mt-1">লাইন চালু</p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 text-center">
          <p className="text-3xl font-bold text-[#dc2626]">{dash.data ? bnNum(dash.data.lineOff) : "…"}</p>
          <p className="text-sm text-[var(--dim)] mt-1">লাইন বন্ধ</p>
        </div>
      </section>

      <section aria-label="যাদের বিল বাকি">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">যাদের চলতি মাসের বিল বাকি</h2>
          <button onClick={onGoCustomers} aria-label="সব কাস্টমার দেখুন" className="text-[var(--accent)] font-semibold px-3 py-2">সব দেখুন →</button>
        </div>
        {dueList.isPending && <p className="text-[var(--dim)] py-4">লোড হচ্ছে…</p>}
        {dueList.data && dueList.data.customers.length === 0 && (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5 text-center">
            <p className="text-lg font-semibold">🎉 কারো বিল বাকি নেই</p>
            <p className="text-sm text-[var(--dim)] mt-1">কাস্টমার যোগ করলে এখানে হিসাব দেখা যাবে।</p>
          </div>
        )}
        <div className="space-y-2 mt-2">
          {dueList.data?.customers.slice(0, 8).map((c) => (
            <button key={c.id} onClick={() => onOpenCustomer(c.id)} aria-label={`${c.name} এর কার্ড দেখুন`} className="w-full text-left rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex items-center justify-between gap-3">
              <span>
                <span className="block font-bold text-lg leading-tight">{c.name}</span>
                <span className="block text-sm text-[var(--dim)]">{bnNum(c.mobile)} • {cycleLabel(c.currentCycle)}: {bnDateShort(c.currentPeriodStart)} – {bnDateShort(c.currentPeriodEnd)}</span>
              </span>
              <span className="rounded-full bg-[var(--amber-light)] text-[var(--amber)] font-bold px-3 py-1 text-sm shrink-0">বাকি {bnMoney(500)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-[var(--surface2)] p-4 text-sm leading-relaxed">
        <p className="font-bold text-base">কার্ড কীভাবে গোনা হয়?</p>
        <p className="mt-1">যেদিন লাইন দেওয়া হবে, সেদিন থেকে ১২ মাস। যেমন ১০ নভেম্বর লাইন দিলে ১ম মাস ১০ নভেম্বর – ৯ ডিসেম্বর, ২য় মাস ১০ ডিসেম্বর – ৯ জানুয়ারি। হিসাব আসল ক্যালেন্ডার ধরে — ৩০ দিনের মাস, ৩১ দিনের মাস, ফেব্রুয়ারির ২৮/২৯ দিন সব ঠিক থাকে। ৩১ তারিখে লাইন দিলে ফেব্রুয়ারিতে মাস শুরু হবে মাসের শেষ দিনে (২৮/২৯), তারপর আবার ৩১ তারিখে ফিরবে।</p>
      </section>
    </div>
  );
}

function CustomersTab({ today, onOpenCustomer, onAdd }: { today: string; onOpenCustomer: (id: number) => void; onAdd: () => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const list = useQuery({
    queryKey: ["customers", today, search, filter],
    queryFn: () => api.listCustomers({ today, search, filter }),
  });
  const filters: [Filter, string][] = [["all", "সবাই"], ["due", "বিল বাকি"], ["paid", "বিল দিয়েছে"], ["on", "লাইন চালু"], ["off", "লাইন বন্ধ"]];
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="cust-search">কাস্টমার খুঁজুন</label>
        <input id="cust-search" {...FIELDS.listCustomers.search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="নাম বা মোবাইল দিয়ে খুঁজুন…" className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base" />
        <button onClick={onAdd} aria-label="নতুন কাস্টমার যোগ করুন" className="rounded-xl bg-[var(--accent)] text-white font-bold px-4 py-3 shrink-0">+ নতুন</button>
      </div>
      <div className="flex gap-2 flex-wrap" role="group" aria-label="ফিল্টার">
        {filters.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} aria-label={`ফিল্টার: ${label}`} aria-pressed={filter === key} className={`rounded-full px-4 py-2 font-semibold border ${filter === key ? "bg-[var(--accent)] text-white border-transparent" : "bg-[var(--surface)] border-[var(--border)]"}`}>{label}</button>
        ))}
      </div>
      {list.isPending && <p className="text-[var(--dim)] py-6 text-center">লোড হচ্ছে…</p>}
      {list.error && <p className="text-[#dc2626] py-4">লোড করা যায়নি, আবার চেষ্টা করুন।</p>}
      {list.data && list.data.customers.length === 0 && (
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 text-center">
          <p className="text-lg font-bold">এখানে কোনো কাস্টমার নেই</p>
          <p className="text-[var(--dim)] mt-1">উপরে “+ নতুন” চেপে প্রথম ওয়াইফাই কাস্টমার যোগ করুন। শুধু ওয়াইফাই — ডিশলাইন এখানে রাখা হবে না।</p>
        </div>
      )}
      <div className="space-y-2">
        {list.data?.customers.map((c) => (
          <article key={c.id} className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
            <button onClick={() => onOpenCustomer(c.id)} aria-label={`${c.name} এর ১২ মাসের কার্ড খুলুন`} className="w-full text-left">
              <span className="flex items-start justify-between gap-2">
                <span>
                  <span className="block font-bold text-lg leading-tight">{c.name}</span>
                  <span className="block text-sm text-[var(--dim)] mt-0.5">📱 {bnNum(c.mobile)}{c.address ? ` • ${c.address}` : ""}</span>
                  <span className="block text-sm mt-1">
                    লাইন দেওয়া: {bnDate(c.connectionDate)} • {c.currentCycle >= 1 && c.currentCycle <= 12 ? `${cycleLabel(c.currentCycle)} চলছে (${bnDateShort(c.currentPeriodStart)} – ${bnDateShort(c.currentPeriodEnd)})` : c.currentCycle === 0 ? "লাইন এখনো শুরু হয়নি" : "১২ মাসের কার্ড শেষ"}
                  </span>
                </span>
                <span className={`rounded-full px-3 py-1 text-sm font-bold shrink-0 ${c.paidCurrentCycle ? "bg-[var(--accent-light)] text-[var(--accent)]" : "bg-[var(--amber-light)] text-[var(--amber)]"}`}>
                  {c.currentCycle >= 1 && c.currentCycle <= 12 ? (c.paidCurrentCycle ? "✓ বিল দেওয়া" : "বিল বাকি") : `${bnNum(c.paidCyclesCount)}/১২ মাস দেওয়া`}
                </span>
              </span>
            </button>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
              <span className="text-sm text-[var(--dim)]">{c.wifiName ? `WiFi: ${c.wifiName}` : "WiFi নাম দেওয়া হয়নি"} • বিল {bnMoney(500)}</span>
              <LineToggle status={c.lineStatus} customerId={c.id} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function KhataTab({ today, onOpenCustomer }: { today: string; onOpenCustomer: (id: number) => void }) {
  const khata = useQuery({ queryKey: ["khata", today], queryFn: () => api.getKhata({ today }) });
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3" aria-label="খাতার সারসংক্ষেপ">
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--dim)]">সব মিলিয়ে আদায়</p>
          <p className="text-2xl font-bold mt-1">{khata.data ? bnMoney(khata.data.totalCollectedAll) : "…"}</p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--dim)]">চলতি মাসে বাকি</p>
          <p className="text-2xl font-bold mt-1 text-[var(--amber)]">{khata.data ? bnMoney(khata.data.dueAmountCurrent) : "…"}</p>
        </div>
      </section>

      <section aria-label="বকেয়া তালিকা">
        <h2 className="text-lg font-bold">📒 বকেয়া — চলতি মাসের বিল বাকি যাদের</h2>
        {khata.data && khata.data.dueRows.length === 0 && <p className="text-[var(--dim)] mt-2 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">কারো চলতি মাসের বিল বাকি নেই।</p>}
        <div className="space-y-2 mt-2">
          {khata.data?.dueRows.map((r) => (
            <button key={r.customerId} onClick={() => onOpenCustomer(r.customerId)} aria-label={`${r.name} এর কার্ড খুলুন`} className="w-full text-left rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex items-center justify-between gap-3">
              <span>
                <span className="block font-bold text-lg leading-tight">{r.name}</span>
                <span className="block text-sm text-[var(--dim)]">{bnNum(r.mobile)} • {cycleLabel(r.currentCycle)}: {bnDate(r.periodStart)} – {bnDate(r.periodEnd)}</span>
              </span>
              <span className="font-bold text-[var(--amber)] shrink-0">{bnMoney(500)} বাকি</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="সাম্প্রতিক আদায়">
        <h2 className="text-lg font-bold">সাম্প্রতিক আদায়</h2>
        {khata.data && khata.data.recentPayments.length === 0 && <p className="text-[var(--dim)] mt-2 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">এখনো কোনো বিল নেওয়া হয়নি। কাস্টমারের কার্ডে মাসে টিক দিলে এখানে আসবে।</p>}
        <div className="space-y-2 mt-2">
          {khata.data?.recentPayments.map((p) => (
            <button key={p.id} onClick={() => onOpenCustomer(p.customerId)} aria-label={`${p.name} এর কার্ড খুলুন`} className="w-full text-left rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex items-center justify-between gap-3">
              <span>
                <span className="block font-bold leading-tight">{p.name} — {cycleLabel(p.cycleIndex)}</span>
                <span className="block text-sm text-[var(--dim)]">{p.periodStart ? `${bnDateShort(p.periodStart)} – ${bnDateShort(p.periodEnd)}` : ""} • দেওয়া: {bnDate(p.paidDate)} • {p.method}</span>
              </span>
              <span className="font-bold text-[var(--accent)] shrink-0">✓ {bnMoney(p.amount)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function RoutersTab({ onOpenCustomer }: { onOpenCustomer: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const list = useQuery({ queryKey: ["routers", search], queryFn: () => api.listRouters({ search }) });
  return (
    <div className="space-y-3">
      <label className="sr-only" htmlFor="router-search">রাউটার খুঁজুন</label>
      <input id="router-search" {...FIELDS.listRouters.search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="WiFi নাম, রাউটার বা কাস্টমার খুঁজুন…" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base" />
      <p className="text-sm text-[var(--dim)]">রাউটারে ঢুকতে ব্রাউজারে রাউটার IP লিখুন (যেমন 192.168.0.1)। এখান থেকে প্রত্যেক কাস্টমারের রাউটারের সব তথ্য এক জায়গায় পাবেন, আর লাইন চালু/বন্ধও করা যাবে।</p>
      {list.data && list.data.customers.length === 0 && <p className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5 text-center text-[var(--dim)]">কোনো রাউটারের তথ্য নেই। কাস্টমার যোগ করার সময় রাউটারের তথ্য দিলে এখানে দেখা যাবে।</p>}
      <div className="space-y-2">
        {list.data?.customers.map((c) => (
          <article key={c.id} className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
            <button onClick={() => onOpenCustomer(c.id)} aria-label={`${c.name} এর কার্ড খুলুন`} className="w-full text-left">
              <span className="block font-bold text-lg leading-tight">{c.wifiName || "(WiFi নাম নেই)"} <span className="text-sm font-normal text-[var(--dim)]">— {c.name}</span></span>
              <span className="block text-sm text-[var(--dim)] mt-1">
                {[c.routerBrand, c.routerModel].filter(Boolean).join(" ") || "রাউটারের মডেল দেওয়া হয়নি"}
                {c.routerIp ? ` • IP: ${c.routerIp}` : ""}
                {c.pppoeUser ? ` • PPPoE: ${c.pppoeUser}` : ""}
                {c.onuInfo ? ` • ONU: ${c.onuInfo}` : ""}
              </span>
            </button>
            <div className="flex justify-end mt-3 pt-3 border-t border-[var(--border)]">
              <LineToggle status={c.lineStatus} customerId={c.id} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function CustomerCardPage({ customerId, today, onBack, onEdit }: { customerId: number; today: string; onBack: () => void; onEdit: (c: CardData["customer"]) => void }) {
  const qc = useQueryClient();
  const card = useQuery({ queryKey: ["card", customerId, today], queryFn: () => api.getCustomerCard({ customerId, today }) });
  const [method, setMethod] = useState("নগদ");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [payError, setPayError] = useState("");

  const togglePay = useMutation({
    mutationFn: async (cycleIndex: number) => await api.togglePayment({ customerId, cycleIndex, method, paidDate: today }),
    onSuccess: () => { void qc.invalidateQueries(); },
    onError: (e) => setPayError(e instanceof Error ? e.message : "আবার চেষ্টা করুন"),
  });
  const del = useMutation({
    mutationFn: async () => await api.deleteCustomer({ id: customerId }),
    onSuccess: () => { void qc.invalidateQueries(); onBack(); },
    onError: () => {},
  });

  const c = card.data?.customer;
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] pb-10">
      <header className="sticky top-0 z-20 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border)] pt-safe">
        <div className="px-4 py-3 max-w-3xl mx-auto flex items-center gap-2">
          <button onClick={onBack} aria-label="পেছনে যান" className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-4 py-2 font-bold">← ফিরুন</button>
          <h1 className="text-lg font-bold leading-tight flex-1">{c ? c.name : "কাস্টমারের কার্ড"}</h1>
          {c && <button onClick={() => onEdit(c)} aria-label="কাস্টমারের তথ্য বদলান" className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-4 py-2 font-semibold">✏️ বদলান</button>}
        </div>
      </header>
      <main className="px-4 max-w-3xl mx-auto pt-4 space-y-4">
        {card.isPending && <p className="text-center text-[var(--dim)] py-8">লোড হচ্ছে…</p>}
        {card.error && <p className="text-[#dc2626]">কার্ড লোড করা যায়নি।</p>}
        {card.data && c && (
          <>
            <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5" aria-label="কাস্টমারের তথ্য">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-bold leading-tight">{c.name}</p>
                  <p className="text-[var(--dim)] mt-1">📱 {bnNum(c.mobile)}{c.address ? ` • ${c.address}` : ""}</p>
                  <p className="mt-1">লাইন দেওয়া: <strong>{bnDate(c.connectionDate)}</strong> • মাসিক বিল: <strong>{bnMoney(500)}</strong></p>
                  <p className="text-sm text-[var(--dim)] mt-1">
                    {card.data.currentCycle >= 1 && card.data.currentCycle <= 12
                      ? `এখন ${cycleLabel(card.data.currentCycle)} চলছে`
                      : card.data.currentCycle === 0 ? "লাইন এখনো শুরু হয়নি" : "১২ মাসের কার্ড শেষ হয়ে গেছে"}
                    {" • "}মোট দেওয়া: {bnNum(card.data.paidCount)}/১২ মাস ({bnMoney(card.data.totalPaid)})
                  </p>
                </div>
                <LineToggle status={c.lineStatus} customerId={c.id} large />
              </div>
              {(c.routerBrand || c.wifiName || c.routerIp) && (
                <div className="mt-4 pt-4 border-t border-[var(--border)] text-base space-y-1">
                  <p className="font-bold">📶 রাউটারের তথ্য</p>
                  {c.wifiName && <p>WiFi নাম: <strong>{c.wifiName}</strong>{c.wifiPassword ? ` • পাসওয়ার্ড: ${c.wifiPassword}` : ""}</p>}
                  {(c.routerBrand || c.routerModel) && <p>রাউটার: {[c.routerBrand, c.routerModel].filter(Boolean).join(" ")}</p>}
                  {c.routerIp && <p>রাউটার IP: {c.routerIp}</p>}
                  {c.pppoeUser && <p>PPPoE ইউজার: {c.pppoeUser}{c.pppoePass ? ` • পাসওয়ার্ড: ${c.pppoePass}` : ""}</p>}
                  {c.onuInfo && <p>ONU: {c.onuInfo}</p>}
                  {c.notes && <p className="text-[var(--dim)]">নোট: {c.notes}</p>}
                </div>
              )}
            </section>

            <section aria-label="১২ মাসের কার্ড">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-lg font-bold">🪪 ১২ মাসের কার্ড</h2>
                <div className="flex items-center gap-2">
                  <label htmlFor="pay-method" className="text-sm font-semibold">টাকা নেওয়া:</label>
                  <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="টাকা নেওয়ার মাধ্যম" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                    <option value="নগদ">নগদ</option>
                    <option value="বিকাশ">বিকাশ</option>
                    <option value="নগদ (ব্যাংক)">ব্যাংক</option>
                  </select>
                </div>
              </div>
              <p className="text-sm text-[var(--dim)] mt-1">যে মাসের বিল পেয়েছেন, সেই ঘরে চাপ দিলে ✓ পড়বে (৫০০ টাকা)। আবার চাপ দিলে টিক উঠে যাবে। প্রতিটা মাসের শুরু-শেষ তারিখ ঘরেই লেখা আছে।</p>
              {payError && <p className="text-[#dc2626] mt-2">{payError}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {card.data.slots.map((s) => (
                  <button
                    key={s.cycleIndex}
                    onClick={() => togglePay.mutate(s.cycleIndex)}
                    aria-label={`${cycleLabel(s.cycleIndex)} ${bnDate(s.periodStart)} থেকে ${bnDate(s.periodEnd)} — ${s.paid ? "বিল দেওয়া হয়েছে, টিক তুলতে চাপ দিন" : "বিল বাকি, টিক দিতে চাপ দিন"}`}
                    aria-pressed={s.paid}
                    className={`rounded-2xl border-2 p-3 text-left min-h-[104px] ${s.paid ? "bg-[var(--accent-light)] border-[var(--accent)]" : s.isCurrent ? "bg-[var(--amber-light)] border-[var(--amber)]" : "bg-[var(--surface)] border-[var(--border)]"}`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="font-bold">{cycleLabel(s.cycleIndex)}</span>
                      <span className="text-xl">{s.paid ? "✅" : s.isCurrent ? "⏳" : "⬜"}</span>
                    </span>
                    <span className="block text-sm mt-1 leading-snug">{bnDateShort(s.periodStart)} –<br />{bnDateShort(s.periodEnd)}</span>
                    <span className="block text-sm font-semibold mt-1">{s.paid ? `দেওয়া • ${bnMoney(500)}` : `${bnMoney(500)} বাকি`}</span>
                    {s.paid && s.paidDate && <span className="block text-xs text-[var(--dim)]">{bnDateShort(s.paidDate)} • {s.method}</span>}
                    {s.isCurrent && !s.paid && <span className="block text-xs font-bold text-[var(--amber)]">চলতি মাস</span>}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-[var(--surface2)] p-4 text-sm leading-relaxed">
              <p>এই কার্ডটাই আগে কাগজে থাকত — কাস্টমারের কাছেও একটা, মালিকের কাছেও একটা। এখন দুটোই এই এক ডিজিটাল কার্ডে: এখানে টিক দিলেই হিসাব থেকে যাবে, আলাদা খাতায় লিখতে হবে না।</p>
            </section>

            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} aria-label="কাস্টমার মুছে ফেলুন" className="w-full rounded-xl border border-[#dc2626] text-[#dc2626] font-bold py-3 bg-[var(--surface)]">কাস্টমার মুছে ফেলুন</button>
            ) : (
              <div className="rounded-2xl border-2 border-[#dc2626] bg-[var(--surface)] p-4">
                <p className="font-bold">সত্যিই {c.name}-কে মুছে ফেলবেন? তার সব বিলের হিসাবও মুছে যাবে।</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => del.mutate()} aria-label="হ্যাঁ, মুছে ফেলুন" className="flex-1 rounded-xl bg-[#dc2626] text-white font-bold py-3">হ্যাঁ, মুছুন</button>
                  <button onClick={() => setConfirmDelete(false)} aria-label="না, থাক" className="flex-1 rounded-xl bg-[var(--surface2)] font-bold py-3">না, থাক</button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CustomerForm({ initial, today, onClose, onSaved }: { initial: CustomerListItem | null; today: string; onClose: () => void; onSaved: (id: number) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [mobile, setMobile] = useState(initial?.mobile ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [packageName, setPackageName] = useState(initial?.packageName ?? "");
  const [connectionDate, setConnectionDate] = useState(initial?.connectionDate ?? today);
  const [routerBrand, setRouterBrand] = useState(initial?.routerBrand ?? "");
  const [routerModel, setRouterModel] = useState(initial?.routerModel ?? "");
  const [routerIp, setRouterIp] = useState(initial?.routerIp ?? "192.168.0.1");
  const [wifiName, setWifiName] = useState(initial?.wifiName ?? "");
  const [wifiPassword, setWifiPassword] = useState(initial?.wifiPassword ?? "");
  const [pppoeUser, setPppoeUser] = useState(initial?.pppoeUser ?? "");
  const [pppoePass, setPppoePass] = useState(initial?.pppoePass ?? "");
  const [onuInfo, setOnuInfo] = useState(initial?.onuInfo ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(), mobile: mobile.trim(), address: address.trim(), packageName: packageName.trim(),
        connectionDate: connectionDate || today,
        routerBrand: routerBrand.trim(), routerModel: routerModel.trim(), routerIp: routerIp.trim(),
        wifiName: wifiName.trim(), wifiPassword: wifiPassword.trim(), pppoeUser: pppoeUser.trim(),
        pppoePass: pppoePass.trim(), onuInfo: onuInfo.trim(), notes: notes.trim(),
      };
      if (initial) {
        await api.updateCustomer({ id: initial.id, ...payload });
        return initial.id;
      }
      const res = await api.addCustomer(payload);
      return res.id;
    },
    onSuccess: (id) => { void qc.invalidateQueries(); onSaved(id); },
    onError: (e) => setError(e instanceof Error ? e.message : "সেভ করা যায়নি, আবার চেষ্টা করুন"),
  });

  function submit() {
    if (!name.trim()) { setError("কাস্টমারের নাম লিখুন"); return; }
    if (mobile.trim().length < 6) { setError("সঠিক মোবাইল নম্বর লিখুন"); return; }
    if (!connectionDate) { setError("লাইন দেওয়ার তারিখ দিন — কার্ড এই তারিখ থেকে শুরু হবে"); return; }
    setError("");
    save.mutate();
  }

  const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base";
  return (
    <div className="fixed inset-0 z-30 bg-black/50 overflow-y-auto" role="dialog" aria-modal="true" aria-label={initial ? "কাস্টমারের তথ্য বদলান" : "নতুন কাস্টমার যোগ করুন"}>
      <div className="min-h-full flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-lg bg-[var(--bg)] rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{initial ? "তথ্য বদলান" : "নতুন ওয়াইফাই কাস্টমার"}</h2>
            <button onClick={onClose} aria-label="বন্ধ করুন" className="rounded-full bg-[var(--surface)] border border-[var(--border)] w-11 h-11 text-xl">✕</button>
          </div>

          <div className="space-y-3 mt-4">
            <div>
              <label htmlFor="f-name" className="font-semibold block mb-1">কাস্টমারের নাম *</label>
              <input id="f-name" {...FIELDS.addCustomer.name} value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: করিম উদ্দিন" className={inputCls} />
            </div>
            <div>
              <label htmlFor="f-mobile" className="font-semibold block mb-1">মোবাইল নম্বর *</label>
              <input id="f-mobile" {...FIELDS.addCustomer.mobile} value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" placeholder="01XXXXXXXXX" className={inputCls} />
            </div>
            <div>
              <label htmlFor="f-address" className="font-semibold block mb-1">ঠিকানা / পাড়া</label>
              <input id="f-address" {...FIELDS.addCustomer.address} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="বাড়ি, পাড়া, গ্রাম" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="f-conn" className="font-semibold block mb-1">লাইন দেওয়ার তারিখ *</label>
                <input id="f-conn" type="date" value={connectionDate} onChange={(e) => setConnectionDate(e.target.value)} className={inputCls} />
                <p className="text-xs text-[var(--dim)] mt-1">১২ মাসের কার্ড এই তারিখ থেকেই শুরু হবে।</p>
              </div>
              <div>
                <label htmlFor="f-fee" className="font-semibold block mb-1">মাসিক বিল</label>
                <input id="f-fee" value="৫০০ টাকা" disabled aria-label="মাসিক বিল ৫০০ টাকা, সবার জন্য একই" className={`${inputCls} opacity-70`} />
                <p className="text-xs text-[var(--dim)] mt-1">সবার জন্য একই — ৫০০ টাকা।</p>
              </div>
            </div>
            <div>
              <label htmlFor="f-pkg" className="font-semibold block mb-1">প্যাকেজ / স্পিড (মনে রাখার জন্য)</label>
              <input id="f-pkg" {...FIELDS.addCustomer.packageName} value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="যেমন: 10 Mbps" className={inputCls} />
            </div>

            <p className="font-bold pt-2">📶 রাউটারের তথ্য</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="f-wifi" className="font-semibold block mb-1">WiFi নাম (SSID)</label>
                <input id="f-wifi" {...FIELDS.addCustomer.wifiName} value={wifiName} onChange={(e) => setWifiName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-wifipass" className="font-semibold block mb-1">WiFi পাসওয়ার্ড</label>
                <input id="f-wifipass" {...FIELDS.addCustomer.wifiPassword} value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-brand" className="font-semibold block mb-1">রাউটারের কোম্পানি</label>
                <input id="f-brand" {...FIELDS.addCustomer.routerBrand} value={routerBrand} onChange={(e) => setRouterBrand(e.target.value)} placeholder="TP-Link / Tenda / Cudy" className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-model" className="font-semibold block mb-1">মডেল</label>
                <input id="f-model" {...FIELDS.addCustomer.routerModel} value={routerModel} onChange={(e) => setRouterModel(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-ip" className="font-semibold block mb-1">রাউটার IP</label>
                <input id="f-ip" {...FIELDS.addCustomer.routerIp} value={routerIp} onChange={(e) => setRouterIp(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-onu" className="font-semibold block mb-1">ONU তথ্য</label>
                <input id="f-onu" {...FIELDS.addCustomer.onuInfo} value={onuInfo} onChange={(e) => setOnuInfo(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-pppoe" className="font-semibold block mb-1">PPPoE ইউজার</label>
                <input id="f-pppoe" {...FIELDS.addCustomer.pppoeUser} value={pppoeUser} onChange={(e) => setPppoeUser(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-pppoepass" className="font-semibold block mb-1">PPPoE পাসওয়ার্ড</label>
                <input id="f-pppoepass" {...FIELDS.addCustomer.pppoePass} value={pppoePass} onChange={(e) => setPppoePass(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="f-notes" className="font-semibold block mb-1">নোট</label>
              <input id="f-notes" {...FIELDS.addCustomer.notes} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
            </div>
            {error && <p className="text-[#dc2626] font-semibold" role="alert">{error}</p>}
            <div className="sticky bottom-0 bg-[var(--bg)] pt-3 pb-1 -mx-1 px-1">
              <button onClick={submit} disabled={save.isPending} aria-label="কাস্টমার সেভ করুন" className="w-full rounded-xl bg-[var(--accent)] text-white font-bold py-4 text-lg disabled:opacity-60 shadow-lg">
                {save.isPending ? "সেভ হচ্ছে…" : "✓ সেভ করুন"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

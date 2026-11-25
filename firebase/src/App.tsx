import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "./lib/firebase";
import {
  MONTHLY_FEE,
  addCustomer,
  deleteCustomer,
  subscribeCustomers,
  subscribePayments,
  toggleLine,
  togglePayment,
  updateCustomer,
  type Customer,
  type CustomerInput,
  type Payment,
} from "./lib/store";
import {
  bnDate,
  bnDateShort,
  bnMoney,
  bnNum,
  currentCycleIndex,
  cycleLabel,
  periodForCycle,
  routerUrl,
  todayStr,
} from "./lib/bangla";

type Tab = "home" | "customers" | "khata" | "routers" | "wifi";
type Filter = "all" | "on" | "off" | "paid" | "due";

// ---------- একই হিসাব সব জায়গায় ----------
interface CustomerView extends Customer {
  currentCycle: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  paidCurrentCycle: boolean;
  paidCyclesCount: number;
}

function withCycle(c: Customer, today: string, paidSet: Set<string>, paidCount: Map<string, number>): CustomerView {
  const cur = currentCycleIndex(c.connectionDate, today);
  const inCard = cur >= 1 && cur <= 12;
  const period = inCard ? periodForCycle(c.connectionDate, cur) : null;
  return {
    ...c,
    currentCycle: cur,
    currentPeriodStart: period ? period.start : null,
    currentPeriodEnd: period ? period.end : null,
    paidCurrentCycle: inCard ? paidSet.has(`${c.id}:${cur}`) : false,
    paidCyclesCount: paidCount.get(c.id) ?? 0,
  };
}

// ---------- লগইন পর্দা ----------
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      setError("ইমেইল আর পাসওয়ার্ড লিখুন");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError("ইমেইল বা পাসওয়ার্ড ভুল হয়েছে, আবার চেষ্টা করুন");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6">
        <h1 className="text-2xl font-bold text-center">বরাটি কেবল নেটওয়ার্ক</h1>
        <div className="space-y-3 mt-5">
          <div>
            <label htmlFor="login-email" className="font-semibold block mb-1">ইমেইল</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="আপনার ইমেইল"
              autoComplete="email"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base"
            />
          </div>
          <div>
            <label htmlFor="login-pass" className="font-semibold block mb-1">পাসওয়ার্ড</label>
            <input
              id="login-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="পাসওয়ার্ড"
              autoComplete="current-password"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base"
            />
          </div>
          {error && (
            <p className="text-[#dc2626] font-semibold" role="alert">{error}</p>
          )}
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="w-full rounded-xl bg-[var(--accent)] text-white font-bold py-4 text-lg disabled:opacity-60"
          >
            {busy ? "ঢুকছি…" : "লগইন করুন"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- মূল অ্যাপ ----------
export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const disarmExitTrap = useRef(false);
  const exitTrapPushed = useRef(false);
  const today = useMemo(() => todayStr(), []);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); }), []);

  // ব্যাক বোতাম / ব্যাক সোয়াইপ: কার্ড খোলা থাকলে কার্ড বন্ধ হবে, ফর্ম খোলা থাকলে ফর্ম বন্ধ হবে,
  // মূল পর্দায় থাকলে বের হওয়ার শিট আসবে। লগইন থাকবে — বের হলেও আবার লগইন করতে হবে না।
  useEffect(() => {
    if (!user) return;
    const push = () => { try { history.pushState({ bcnExit: true }, ""); } catch { /* কিছু করার নেই */ } };
    if (!exitTrapPushed.current) { exitTrapPushed.current = true; push(); }
    const onPop = () => {
      if (disarmExitTrap.current) return;
      if (confirmExit) { setConfirmExit(false); push(); return; }
      if (showForm) { setShowForm(false); setEditing(null); push(); return; }
      if (selectedId != null) { setSelectedId(null); push(); return; }
      // ভেতরের ট্যাবে থাকলে প্রথমে হোম ট্যাবে যাও — শুধু হোমে থাকলেই বের হওয়ার শিট আসবে
      if (tab !== "home") { setTab("home"); push(); return; }
      setConfirmExit(true);
      push();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [user, confirmExit, showForm, selectedId, tab]);

  // পড়া কম রাখতে: লগইনের পর কাস্টমার আর পেমেন্ট একবারই subscribe —
  // এরপর সব ট্যাব এই লোকাল ডেটা থেকেই হিসাব করবে, প্রত্যেক ক্লিকে নতুন করে পড়া হবে না।
  useEffect(() => {
    if (!user) return;
    const un1 = subscribeCustomers((list) => { setCustomers(list); setDataReady(true); });
    const un2 = subscribePayments(setPayments);
    return () => { un1(); un2(); };
  }, [user]);

  const paidSet = useMemo(() => new Set(payments.map((p) => `${p.customerId}:${p.cycleIndex}`)), [payments]);
  const paidCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(p.customerId, (m.get(p.customerId) ?? 0) + 1);
    return m;
  }, [payments]);

  const views = useMemo(
    () => customers.map((c) => withCycle(c, today, paidSet, paidCount)),
    [customers, today, paidSet, paidCount],
  );

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center">
        <p className="text-[var(--dim)]">লোড হচ্ছে…</p>
      </div>
    );
  }
  if (!user) return <LoginScreen />;


  if (selectedId != null) {
    const selected = views.find((v) => v.id === selectedId);
    return (
      <>
        <CustomerCardPage
          customer={selected ?? null}
          payments={payments.filter((p) => p.customerId === selectedId)}
          today={today}
          onBack={() => setSelectedId(null)}
          onEdit={(c) => { setEditing(c); setShowForm(true); }}
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
      <header className="sticky top-0 z-20 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border)]">
        <div className="px-4 py-3 max-w-3xl mx-auto">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold leading-tight">বরাটি কেবল নেটওয়ার্ক</h1>
              <p className="text-sm text-[var(--dim)]">শুধু ওয়াইফাই কাস্টমার • সবার বিল মাসে {bnMoney(MONTHLY_FEE)} • কার্ড লাইন দেওয়ার তারিখ থেকে ১২ মাস</p>
            </div>
            <button
              onClick={() => void signOut(auth)}
              aria-label="লগআউট করুন"
              className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-semibold shrink-0"
            >
              লগআউট
            </button>
          </div>
        </div>
      </header>

      {confirmExit && (
        <div className="fixed inset-0 z-40 bg-black/50" role="dialog" aria-modal="true" aria-label="বের হওয়ার নিশ্চিতকরণ" onClick={() => setConfirmExit(false)}>
          <div
            className="sheet-up absolute bottom-0 left-0 right-0 bg-[var(--surface)] rounded-t-3xl px-5 pt-3 pb-6 max-w-3xl mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 rounded-full bg-[var(--border)] mx-auto" />
            <p className="text-xl font-bold text-center mt-5">আপনি কি নিশ্চিত আপনি ফিরে যেতে চান?</p>
            <p className="text-base text-[var(--dim)] text-center mt-3">অ্যাপ্লিকেশনটি বন্ধ হয়ে যাবে</p>
            <div className="flex items-center justify-between gap-3 mt-7">
              <button
                onClick={() => setConfirmExit(false)}
                aria-label="বাতিল করুন"
                className="px-4 py-3 text-lg font-semibold text-[var(--dim)]"
              >
                বাতিল করুন
              </button>
              <button
                onClick={() => {
                  setConfirmExit(false);
                  disarmExitTrap.current = true;
                  // সব একই ট্যাপের ভিতরে করতে হবে — দেরি করলে ফোন শোনে না
                  // ১) অ্যাপের উইন্ডো বন্ধ করার চেষ্টা
                  try { window.close(); } catch { /* কিছু করার নেই */ }
                  // ২) হিস্ট্রির গার্ড এন্ট্রিটা সরিয়ে দাও
                  try { history.back(); } catch { /* কিছু করার নেই */ }
                  // ৩) সাথে সাথেই হোম স্ক্রিনে নিয়ে যাও
                  window.location.href = "intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.HOME;end";
                }}
                aria-label="নিশ্চিত"
                className="rounded-full bg-[#dc2626] text-white font-bold px-10 py-3 text-lg"
              >
                নিশ্চিত
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="px-4 max-w-3xl mx-auto pt-4">
        {!dataReady && <p className="text-[var(--dim)] py-6 text-center">লোড হচ্ছে…</p>}
        {dataReady && tab === "home" && <HomeTab views={views} payments={payments} onOpenCustomer={setSelectedId} onGoCustomers={() => setTab("customers")} />}
        {dataReady && tab === "customers" && (
          <CustomersTab views={views} onOpenCustomer={setSelectedId} onAdd={() => { setEditing(null); setShowForm(true); }} />
        )}
        {dataReady && tab === "khata" && <KhataTab views={views} payments={payments} onOpenCustomer={setSelectedId} />}
        {dataReady && tab === "routers" && <RoutersTab views={views} onOpenCustomer={setSelectedId} />}
        {dataReady && tab === "wifi" && <MyWifiTab views={views} onOpenCustomer={setSelectedId} />}
      </main>

      <nav aria-label="প্রধান মেনু" className="fixed bottom-0 left-0 right-0 z-20 bg-[var(--surface)] border-t border-[var(--border)]">
        <div className="max-w-3xl mx-auto grid grid-cols-5">
          {([
            ["home", "🏠 হোম"],
            ["customers", "👥 কাস্টমার"],
            ["khata", "📒 খাতা"],
            ["routers", "📶 রাউটার"],
            ["wifi", "📡 WiFi"],
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

function LineToggle({ status, customerId, large }: { status: "on" | "off"; customerId: string; large?: boolean }) {
  const [busy, setBusy] = useState(false);
  const isOn = status === "on";
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        void toggleLine(customerId, isOn ? "off" : "on").finally(() => setBusy(false));
      }}
      disabled={busy}
      aria-label={isOn ? "লাইন বন্ধ করুন" : "লাইন চালু করুন"}
      className={`${large ? "px-5 py-3 text-lg" : "px-4 py-2 text-base"} rounded-full font-bold text-white shrink-0 ${isOn ? "bg-[#1d4ed8]" : "bg-[#dc2626]"} disabled:opacity-60`}
    >
      {isOn ? "🟢 লাইন চালু" : "🔴 লাইন বন্ধ"}
    </button>
  );
}

function MyWifiTab({ views, onOpenCustomer }: {
  views: CustomerView[];
  onOpenCustomer: (id: string) => void;
}) {
  const [online, setOnline] = useState(navigator.onLine);
  const [conn, setConn] = useState(() => {
    const c = (navigator as Navigator & { connection?: { type?: string; effectiveType?: string; downlink?: number } }).connection;
    return { type: c?.type ?? "", effectiveType: c?.effectiveType ?? "", downlink: c?.downlink ?? 0 };
  });
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      const c = (navigator as Navigator & { connection?: { type?: string; effectiveType?: string; downlink?: number } }).connection;
      setConn({ type: c?.type ?? "", effectiveType: c?.effectiveType ?? "", downlink: c?.downlink ?? 0 });
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const c = (navigator as Navigator & { connection?: { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void } }).connection;
    c?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      c?.removeEventListener?.("change", update);
    };
  }, []);

  const wifiList = useMemo(
    () => views.filter((c) => c.wifiName.trim()).sort((a, b) => a.wifiName.localeCompare(b.wifiName, "bn")),
    [views],
  );
  const [pickedId, setPickedId] = useState<string>(() => localStorage.getItem("bcn-my-wifi-id") ?? "");
  const picked = wifiList.find((c) => c.id === pickedId) ?? null;
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (pickedId && !wifiList.some((c) => c.id === pickedId)) setPickedId("");
  }, [wifiList, pickedId]);

  const pick = (id: string) => {
    setPickedId(id);
    setShowPass(false);
    setCopied(false);
    if (id) localStorage.setItem("bcn-my-wifi-id", id);
    else localStorage.removeItem("bcn-my-wifi-id");
  };

  const copyPass = async () => {
    if (!picked?.wifiPassword) return;
    try {
      await navigator.clipboard.writeText(picked.wifiPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ক্লিপবোর্ড না থাকলে কিছু করার নেই */ }
  };

  const speedLabel = conn.effectiveType
    ? ({ "slow-2g": "খুব ধীর", "2g": "২জি", "3g": "৩জি", "4g": "৪জি" } as Record<string, string>)[conn.effectiveType] ?? conn.effectiveType
    : "";

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">📡 আমার WiFi</h2>

      <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4" aria-label="ফোনের সংযোগ">
        <p className="font-bold">ফোনের সংযোগ</p>
        <p className="mt-1">
          {online ? "🟢 অনলাইন" : "🔴 অফলাইন"}
          {" • "}
          {conn.type === "wifi" ? "WiFi-তে আছো" : conn.type === "cellular" ? "মোবাইল ডেটায় আছো" : conn.type ? `সংযোগ: ${conn.type}` : "সংযোগের ধরন জানা যায়নি"}
          {speedLabel ? ` • গতি: ${speedLabel}` : ""}
          {conn.downlink ? ` (${bnNum(conn.downlink)} Mbps)` : ""}
        </p>
        <p className="text-sm text-[var(--dim)] mt-1">
          ফোন এখন কোন WiFi-তে আছে, সেটা অ্যাপ নিজে জানতে পারে না — ব্রাউজার সেই তথ্য দেয় না। তাই নিচে তোমার WiFi-টা বেছে নাও।
        </p>
      </section>

      <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4" aria-label="আমার WiFi বাছুন">
        <label htmlFor="my-wifi-pick" className="font-semibold block mb-1">আমার WiFi বাছুন</label>
        <select id="my-wifi-pick" value={pickedId} onChange={(e) => pick(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base font-semibold">
          <option value="">— WiFi বাছুন —</option>
          {wifiList.map((c) => (<option key={c.id} value={c.id}>{c.wifiName} — {c.name}</option>))}
        </select>
        {wifiList.length === 0 && (
          <p className="text-sm text-[var(--dim)] mt-2">
            কোনো কাস্টমারের WiFi নাম দেওয়া হয়নি। কাস্টমার যোগ বা বদল করার সময় WiFi নাম আর পাসওয়ার্ড লিখলে এখানে দেখাবে।
          </p>
        )}
      </section>

      {picked && (
        <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4" aria-label="WiFi তথ্য">
          <p className="text-lg font-bold">{picked.wifiName}</p>
          <p className="text-sm text-[var(--dim)] mt-0.5">
            {picked.name}
            {picked.gram ? ` • গ্রাম: ${picked.gram}` : ""}
            {picked.para ? ` • পাড়া: ${picked.para}` : ""}
          </p>
          <p className="mt-3">
            পাসওয়ার্ড: <strong>{showPass ? (picked.wifiPassword || "(দেওয়া হয়নি)") : "••••••••"}</strong>
          </p>
          <div className="flex gap-2 flex-wrap mt-2">
            <button onClick={() => setShowPass((v) => !v)} className="rounded-xl bg-[var(--surface2)] border border-[var(--border)] font-bold px-4 py-2">
              {showPass ? "🙈 লুকান" : "👁 দেখুন"}
            </button>
            {picked.wifiPassword && (
              <button onClick={() => void copyPass()} className="rounded-xl bg-[var(--surface2)] border border-[var(--border)] font-bold px-4 py-2">
                {copied ? "✓ কপি হয়েছে" : "📋 কপি করুন"}
              </button>
            )}
          </div>
          {picked.routerIp && <p className="mt-2">রাউটার IP: {picked.routerIp}</p>}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {routerUrl(picked.routerIp) && (
              <a href={routerUrl(picked.routerIp) ?? undefined} target="_blank" rel="noreferrer" aria-label={`${picked.name} এর রাউটারে ঢুকুন`} className="rounded-xl bg-[var(--surface2)] border border-[var(--border)] font-bold px-4 py-2">🔧 রাউটারে ঢুকুন</a>
            )}
            <LineToggle status={picked.lineStatus} customerId={picked.id} />
            <button onClick={() => onOpenCustomer(picked.id)} className="rounded-xl bg-[var(--surface2)] border border-[var(--border)] font-bold px-4 py-2">কার্ড দেখুন</button>
          </div>
          <p className="text-xs text-[var(--dim)] mt-2">
            লাইন চালু/বন্ধ এখানে শুধু খাতার হিসাব বদলায় — রাউটার থেকে সত্যি বন্ধ করতে রাউটারের ভেতরে যেতে হয়।
          </p>
        </section>
      )}

      <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4" aria-label="ফোনের WiFi বন্ধ বা চালু">
        <p className="font-bold">ফোনের WiFi বন্ধ / চালু</p>
        <p className="text-sm text-[var(--dim)] mt-1">
          অ্যাপের ভেতর থেকে ফোনের WiFi বন্ধ/চালু করা যায় না — ফোন দেয় না। নিচের বাটনে ফোনের WiFi সেটিংস খুলবে, সেখানে সুইচ চাপলেই হবে।
        </p>
        <button
          onClick={() => { window.location.href = "intent://#Intent;action=android.settings.WIFI_SETTINGS;end"; }}
          className="rounded-xl bg-[var(--accent)] text-white font-bold px-4 py-3 mt-3"
        >
          📶 WiFi সেটিংস খুলুন
        </button>
        <p className="text-xs text-[var(--dim)] mt-2">
          না খুললে ফোনের উপর থেকে নিচে টেনে Quick Settings থেকে WiFi বোতাম চাপো।
        </p>
      </section>
    </div>
  );
}

function HomeTab({ views, payments, onOpenCustomer, onGoCustomers }: {
  views: CustomerView[];
  payments: Payment[];
  onOpenCustomer: (id: string) => void;
  onGoCustomers: () => void;
}) {
  const totalCustomers = views.length;
  const lineOn = views.filter((c) => c.lineStatus === "on").length;
  const lineOff = views.filter((c) => c.lineStatus === "off").length;
  const currentCycleViews = views.filter((c) => c.currentCycle >= 1 && c.currentCycle <= 12);
  const paidCurrent = currentCycleViews.filter((c) => c.paidCurrentCycle).length;
  const dueViews = currentCycleViews.filter((c) => !c.paidCurrentCycle);
  const collectedCurrentCycle = paidCurrent * MONTHLY_FEE;
  const totalCollectedAll = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-4">
      <section aria-label="এই মাসের হিসাব" className="rounded-2xl bg-[var(--accent)] text-white p-5">
        <p className="text-base opacity-90">চলতি মাসে আদায় হয়েছে</p>
        <p className="text-4xl font-bold mt-1">{bnMoney(collectedCurrentCycle)}</p>
        <p className="text-base mt-2 opacity-90">
          {bnNum(paidCurrent)} জন বিল দিয়েছেন • মোট আদায় (সব মাস) {bnMoney(totalCollectedAll)}
        </p>
        <div className="mt-4 rounded-xl bg-white/15 p-4">
          <p className="font-bold text-lg">বাকি আছে: {bnNum(dueViews.length)} জন — {bnMoney(dueViews.length * MONTHLY_FEE)}</p>
          <p className="text-sm opacity-90 mt-1">প্রত্যেকের চলতি মাস তার লাইন দেওয়ার তারিখ ধরে গোনা হয়।</p>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3" aria-label="সারসংক্ষেপ">
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 text-center">
          <p className="text-3xl font-bold">{bnNum(totalCustomers)}</p>
          <p className="text-sm text-[var(--dim)] mt-1">মোট কাস্টমার</p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 text-center">
          <p className="text-3xl font-bold text-[#1d4ed8]">{bnNum(lineOn)}</p>
          <p className="text-sm text-[var(--dim)] mt-1">লাইন চালু</p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 text-center">
          <p className="text-3xl font-bold text-[#dc2626]">{bnNum(lineOff)}</p>
          <p className="text-sm text-[var(--dim)] mt-1">লাইন বন্ধ</p>
        </div>
      </section>

      <section aria-label="যাদের বিল বাকি">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">যাদের চলতি মাসের বিল বাকি</h2>
          <button onClick={onGoCustomers} aria-label="সব কাস্টমার দেখুন" className="text-[var(--accent)] font-semibold px-3 py-2">সব দেখুন →</button>
        </div>
        {dueViews.length === 0 && (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5 text-center">
            <p className="text-lg font-semibold">🎉 কারো বিল বাকি নেই</p>
            <p className="text-sm text-[var(--dim)] mt-1">কাস্টমার যোগ করলে এখানে হিসাব দেখা যাবে।</p>
          </div>
        )}
        <div className="space-y-2 mt-2">
          {dueViews.slice(0, 8).map((c) => (
            <button key={c.id} onClick={() => onOpenCustomer(c.id)} aria-label={`${c.name} এর কার্ড দেখুন`} className="w-full text-left rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex items-center justify-between gap-3">
              <span>
                <span className="block font-bold text-lg leading-tight">{c.name}</span>
                <span className="block text-sm text-[var(--dim)]">{bnNum(c.mobile)} • {cycleLabel(c.currentCycle)}: {bnDateShort(c.currentPeriodStart)} – {bnDateShort(c.currentPeriodEnd)}</span>
              </span>
              <span className="rounded-full bg-[var(--amber-light)] text-[var(--amber)] font-bold px-3 py-1 text-sm shrink-0">বাকি {bnMoney(MONTHLY_FEE)}</span>
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

function CustomersTab({ views, onOpenCustomer, onAdd }: {
  views: CustomerView[];
  onOpenCustomer: (id: string) => void;
  onAdd: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [gramFilter, setGramFilter] = useState("");
  const [paraFilter, setParaFilter] = useState("");
  const filters: [Filter, string][] = [["all", "সবাই"], ["due", "বিল বাকি"], ["paid", "বিল দিয়েছে"], ["on", "লাইন চালু"], ["off", "লাইন বন্ধ"]];
  const grams = useMemo(() => [...new Set(views.map((c) => c.gram).filter(Boolean))].sort((a, b) => a.localeCompare(b, "bn")), [views]);
  const paras = useMemo(() => [...new Set(views.map((c) => c.para).filter(Boolean))].sort((a, b) => a.localeCompare(b, "bn")), [views]);

  const list = useMemo(() => {
    let out = views;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.mobile.includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.gram.toLowerCase().includes(q) ||
        c.para.toLowerCase().includes(q) ||
        c.wifiName.toLowerCase().includes(q),
      );
    }
    if (filter === "on") out = out.filter((c) => c.lineStatus === "on");
    if (filter === "off") out = out.filter((c) => c.lineStatus === "off");
    if (filter === "paid") out = out.filter((c) => c.paidCurrentCycle);
    if (filter === "due") out = out.filter((c) => c.currentCycle >= 1 && c.currentCycle <= 12 && !c.paidCurrentCycle);
    if (gramFilter) out = out.filter((c) => c.gram === gramFilter);
    if (paraFilter) out = out.filter((c) => c.para === paraFilter);
    return out;
  }, [views, search, filter, gramFilter, paraFilter]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="cust-search">কাস্টমার খুঁজুন</label>
        <input id="cust-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="নাম, মোবাইল, গ্রাম বা পাড়া দিয়ে খুঁজুন…" className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base" />
        <button onClick={onAdd} aria-label="নতুন কাস্টমার যোগ করুন" className="rounded-xl bg-[var(--accent)] text-white font-bold px-4 py-3 shrink-0">+ নতুন</button>
      </div>
      <div className="flex gap-2 flex-wrap" role="group" aria-label="ফিল্টার">
        {filters.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} aria-label={`ফিল্টার: ${label}`} aria-pressed={filter === key} className={`rounded-full px-4 py-2 font-semibold border ${filter === key ? "bg-[var(--accent)] text-white border-transparent" : "bg-[var(--surface)] border-[var(--border)]"}`}>{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="sr-only" htmlFor="gram-filter">গ্রাম দিয়ে খুঁজুন</label>
          <select id="gram-filter" value={gramFilter} onChange={(e) => setGramFilter(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base font-semibold">
            <option value="">সব গ্রাম</option>
            {grams.map((g) => (<option key={g} value={g}>{g}</option>))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="para-filter">পাড়া দিয়ে খুঁজুন</label>
          <select id="para-filter" value={paraFilter} onChange={(e) => setParaFilter(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base font-semibold">
            <option value="">সব পাড়া</option>
            {paras.map((pa) => (<option key={pa} value={pa}>{pa}</option>))}
          </select>
        </div>
      </div>
      {list.length === 0 && (
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 text-center">
          <p className="text-lg font-bold">এখানে কোনো কাস্টমার নেই</p>
          <p className="text-[var(--dim)] mt-1">উপরে “+ নতুন” চেপে প্রথম ওয়াইফাই কাস্টমার যোগ করুন। শুধু ওয়াইফাই — ডিশলাইন এখানে রাখা হবে না।</p>
        </div>
      )}
      <div className="space-y-2">
        {list.map((c) => (
          <article key={c.id} className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
            <button onClick={() => onOpenCustomer(c.id)} aria-label={`${c.name} এর ১২ মাসের কার্ড খুলুন`} className="w-full text-left">
              <span className="flex items-start justify-between gap-2">
                <span>
                  <span className="block font-bold text-lg leading-tight">{c.name}</span>
                  <span className="block text-sm text-[var(--dim)] mt-0.5">📱 {bnNum(c.mobile)}{c.address ? ` • ${c.address}` : ""}</span>
                  {(c.gram || c.para) && (<span className="block text-sm text-[var(--dim)] mt-0.5">📍 {[c.gram ? `গ্রাম: ${c.gram}` : "", c.para ? `পাড়া: ${c.para}` : ""].filter(Boolean).join(" • ")}</span>)}
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
              <span className="text-sm text-[var(--dim)]">{c.wifiName ? `WiFi: ${c.wifiName}` : "WiFi নাম দেওয়া হয়নি"} • বিল {bnMoney(MONTHLY_FEE)}</span>
              <LineToggle status={c.lineStatus} customerId={c.id} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function KhataTab({ views, payments, onOpenCustomer }: {
  views: CustomerView[];
  payments: Payment[];
  onOpenCustomer: (id: string) => void;
}) {
  const dueRows = useMemo(() => {
    const rows = views
      .filter((c) => c.currentCycle >= 1 && c.currentCycle <= 12 && !c.paidCurrentCycle)
      .map((c) => ({
        customerId: c.id,
        name: c.name,
        mobile: c.mobile,
        currentCycle: c.currentCycle,
        periodStart: c.currentPeriodStart ?? "",
        periodEnd: c.currentPeriodEnd ?? "",
      }));
    // মেয়াদ শেষের তারিখ অনুযায়ী সাজানো (যারটা আগে শেষ, সে আগে)
    rows.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    return rows;
  }, [views]);

  const recentPayments = useMemo(() => {
    const byId = new Map(views.map((v) => [v.id, v]));
    return payments.slice(0, 100).map((p) => ({
      ...p,
      name: byId.get(p.customerId)?.name ?? "—",
      mobile: byId.get(p.customerId)?.mobile ?? "",
    }));
  }, [payments, views]);

  const totalCollectedAll = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3" aria-label="খাতার সারসংক্ষেপ">
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--dim)]">সব মিলিয়ে আদায়</p>
          <p className="text-2xl font-bold mt-1">{bnMoney(totalCollectedAll)}</p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--dim)]">চলতি মাসে বাকি</p>
          <p className="text-2xl font-bold mt-1 text-[var(--amber)]">{bnMoney(dueRows.length * MONTHLY_FEE)}</p>
        </div>
      </section>

      <section aria-label="বকেয়া তালিকা">
        <h2 className="text-lg font-bold">📒 বকেয়া — চলতি মাসের বিল বাকি যাদের</h2>
        {dueRows.length === 0 && <p className="text-[var(--dim)] mt-2 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">কারো চলতি মাসের বিল বাকি নেই।</p>}
        <div className="space-y-2 mt-2">
          {dueRows.map((r) => (
            <button key={r.customerId} onClick={() => onOpenCustomer(r.customerId)} aria-label={`${r.name} এর কার্ড খুলুন`} className="w-full text-left rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex items-center justify-between gap-3">
              <span>
                <span className="block font-bold text-lg leading-tight">{r.name}</span>
                <span className="block text-sm text-[var(--dim)]">{bnNum(r.mobile)} • {cycleLabel(r.currentCycle)}: {bnDate(r.periodStart)} – {bnDate(r.periodEnd)}</span>
              </span>
              <span className="font-bold text-[var(--amber)] shrink-0">{bnMoney(MONTHLY_FEE)} বাকি</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="সাম্প্রতিক আদায়">
        <h2 className="text-lg font-bold">সাম্প্রতিক আদায়</h2>
        {recentPayments.length === 0 && <p className="text-[var(--dim)] mt-2 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">এখনো কোনো বিল নেওয়া হয়নি। কাস্টমারের কার্ডে মাসে টিক দিলে এখানে আসবে।</p>}
        <div className="space-y-2 mt-2">
          {recentPayments.map((p) => (
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

function RoutersTab({ views, onOpenCustomer }: {
  views: CustomerView[];
  onOpenCustomer: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const list = useMemo(() => {
    const sorted = [...views].sort((a, b) => b.createdAt - a.createdAt);
    if (!search.trim()) return sorted;
    const q = search.trim().toLowerCase();
    return sorted.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.wifiName.toLowerCase().includes(q) ||
      c.routerBrand.toLowerCase().includes(q) ||
      c.routerModel.toLowerCase().includes(q) ||
      c.mobile.includes(q),
    );
  }, [views, search]);

  return (
    <div className="space-y-3">
      <label className="sr-only" htmlFor="router-search">রাউটার খুঁজুন</label>
      <input id="router-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="WiFi নাম, রাউটার বা কাস্টমার খুঁজুন…" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base" />
      <p className="text-sm text-[var(--dim)]">রাউটারে ঢুকতে ব্রাউজারে রাউটার IP লিখুন (যেমন 192.168.0.1)। এখান থেকে প্রত্যেক কাস্টমারের রাউটারের সব তথ্য এক জায়গায় পাবেন, আর লাইন চালু/বন্ধও করা যাবে।</p>
      {list.length === 0 && <p className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5 text-center text-[var(--dim)]">কোনো রাউটারের তথ্য নেই। কাস্টমার যোগ করার সময় রাউটারের তথ্য দিলে এখানে দেখা যাবে।</p>}
      <div className="space-y-2">
        {list.map((c) => (
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
            <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--border)]">
              {routerUrl(c.routerIp) ? (
                <a href={routerUrl(c.routerIp) ?? undefined} target="_blank" rel="noreferrer" aria-label={`${c.name} এর রাউটারে ঢুকুন`} className="rounded-xl bg-[var(--surface2)] border border-[var(--border)] font-bold px-4 py-2">🔧 রাউটারে ঢুকুন</a>
              ) : (
                <span className="text-sm text-[var(--dim)]">রাউটার IP দেওয়া হয়নি</span>
              )}
              <LineToggle status={c.lineStatus} customerId={c.id} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function CustomerCardPage({ customer, payments, today, onBack, onEdit }: {
  customer: CustomerView | null;
  payments: Payment[];
  today: string;
  onBack: () => void;
  onEdit: (c: Customer) => void;
}) {
  const [method, setMethod] = useState("নগদ");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [payError, setPayError] = useState("");
  const [busy, setBusy] = useState(false);

  const c = customer;
  const currentCycle = c ? currentCycleIndex(c.connectionDate, today) : 0;
  const paidMap = useMemo(() => new Map(payments.map((p) => [p.cycleIndex, p])), [payments]);
  const totalPaid = payments.length * MONTHLY_FEE;

  async function onTogglePay(cycleIndex: number) {
    if (!c || busy) return;
    setPayError("");
    setBusy(true);
    try {
      await togglePayment(c, cycleIndex, method, today);
    } catch {
      setPayError("আবার চেষ্টা করুন");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] pb-10">
      <header className="sticky top-0 z-20 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border)]">
        <div className="px-4 py-3 max-w-3xl mx-auto flex items-center gap-2">
          <button onClick={onBack} aria-label="পেছনে যান" className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-4 py-2 font-bold">← ফিরুন</button>
          <h1 className="text-lg font-bold leading-tight flex-1">{c ? c.name : "কাস্টমারের কার্ড"}</h1>
          {c && <button onClick={() => onEdit(c)} aria-label="কাস্টমারের তথ্য বদলান" className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-4 py-2 font-semibold">✏️ বদলান</button>}
        </div>
      </header>
      <main className="px-4 max-w-3xl mx-auto pt-4 space-y-4">
        {!c && <p className="text-[#dc2626]">কার্ড লোড করা যায়নি।</p>}
        {c && (
          <>
            <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5" aria-label="কাস্টমারের তথ্য">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-bold leading-tight">{c.name}</p>
                  <p className="text-[var(--dim)] mt-1">📱 {bnNum(c.mobile)}{c.address ? ` • ${c.address}` : ""}</p>
                  {(c.gram || c.para) && (<p className="text-[var(--dim)] mt-1">📍 {[c.gram ? `গ্রাম: ${c.gram}` : "", c.para ? `পাড়া: ${c.para}` : ""].filter(Boolean).join(" • ")}</p>)}
                  <p className="mt-1">লাইন দেওয়া: <strong>{bnDate(c.connectionDate)}</strong> • মাসিক বিল: <strong>{bnMoney(MONTHLY_FEE)}</strong></p>
                  <p className="text-sm text-[var(--dim)] mt-1">
                    {currentCycle >= 1 && currentCycle <= 12
                      ? `এখন ${cycleLabel(currentCycle)} চলছে`
                      : currentCycle === 0 ? "লাইন এখনো শুরু হয়নি" : "১২ মাসের কার্ড শেষ হয়ে গেছে"}
                    {" • "}মোট দেওয়া: {bnNum(paidMap.size)}/১২ মাস ({bnMoney(totalPaid)})
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
                  {routerUrl(c.routerIp) && (
                    <p className="pt-2">
                      <a href={routerUrl(c.routerIp) ?? undefined} target="_blank" rel="noreferrer" aria-label="রাউটারে ঢুকুন" className="inline-block rounded-xl bg-[var(--surface2)] border border-[var(--border)] font-bold px-4 py-2">🔧 রাউটারে ঢুকুন — IP লিখতে হবে না</a>
                      <span className="block text-xs text-[var(--dim)] mt-1">শুধু ওই বাড়ির ওয়াইফাইয়ে যুক্ত থাকলে খুলবে।</span>
                    </p>
                  )}
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
                    <option value="ব্যাংক">ব্যাংক</option>
                  </select>
                </div>
              </div>
              <p className="text-sm text-[var(--dim)] mt-1">যে মাসের বিল পেয়েছেন, সেই ঘরে চাপ দিলে ✓ পড়বে ({bnMoney(MONTHLY_FEE)})। আবার চাপ দিলে টিক উঠে যাবে। প্রতিটা মাসের শুরু-শেষ তারিখ ঘরেই লেখা আছে।</p>
              {payError && <p className="text-[#dc2626] mt-2">{payError}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((idx) => {
                  const period = periodForCycle(c.connectionDate, idx);
                  const p = paidMap.get(idx);
                  const paid = !!p;
                  const isCurrent = currentCycle === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => void onTogglePay(idx)}
                      disabled={busy}
                      aria-label={`${cycleLabel(idx)} ${bnDate(period.start)} থেকে ${bnDate(period.end)} — ${paid ? "বিল দেওয়া হয়েছে, টিক তুলতে চাপ দিন" : "বিল বাকি, টিক দিতে চাপ দিন"}`}
                      aria-pressed={paid}
                      className={`rounded-2xl border-2 p-3 text-left min-h-[104px] disabled:opacity-60 ${paid ? "bg-[var(--accent-light)] border-[var(--accent)]" : isCurrent ? "bg-[var(--amber-light)] border-[var(--amber)]" : "bg-[var(--surface)] border-[var(--border)]"}`}
                    >
                      <span className="flex items-center justify-between">
                        <span className="font-bold">{cycleLabel(idx)}</span>
                        <span className="text-xl">{paid ? "✅" : isCurrent ? "⏳" : "⬜"}</span>
                      </span>
                      <span className="block text-sm mt-1 leading-snug">{bnDateShort(period.start)} –<br />{bnDateShort(period.end)}</span>
                      <span className="block text-sm font-semibold mt-1">{paid ? `দেওয়া • ${bnMoney(MONTHLY_FEE)}` : `${bnMoney(MONTHLY_FEE)} বাকি`}</span>
                      {paid && p && <span className="block text-xs text-[var(--dim)]">{bnDateShort(p.paidDate)} • {p.method}</span>}
                      {isCurrent && !paid && <span className="block text-xs font-bold text-[var(--amber)]">চলতি মাস</span>}
                    </button>
                  );
                })}
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
                  <button
                    onClick={() => void deleteCustomer(c.id, payments).then(onBack)}
                    aria-label="হ্যাঁ, মুছে ফেলুন"
                    className="flex-1 rounded-xl bg-[#dc2626] text-white font-bold py-3"
                  >
                    হ্যাঁ, মুছুন
                  </button>
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

function CustomerForm({ initial, today, onClose, onSaved }: {
  initial: Customer | null;
  today: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [mobile, setMobile] = useState(initial?.mobile ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [gram, setGram] = useState(initial?.gram ?? "");
  const [para, setPara] = useState(initial?.para ?? "");
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
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { setError("কাস্টমারের নাম লিখুন"); return; }
    if (mobile.trim().length < 6) { setError("সঠিক মোবাইল নম্বর লিখুন"); return; }
    if (!address.trim()) { setError("ঠিকানা লিখুন"); return; }
    if (!gram.trim()) { setError("গ্রামের নাম লিখুন"); return; }
    if (!para.trim()) { setError("পাড়ার নাম লিখুন"); return; }
    if (!connectionDate) { setError("লাইন দেওয়ার তারিখ দিন — কার্ড এই তারিখ থেকে শুরু হবে"); return; }
    setError("");
    setBusy(true);
    const payload: CustomerInput = {
      name: name.trim(), mobile: mobile.trim(), address: address.trim(), gram: gram.trim(), para: para.trim(), packageName: packageName.trim(),
      connectionDate: connectionDate || today,
      routerBrand: routerBrand.trim(), routerModel: routerModel.trim(), routerIp: routerIp.trim(),
      wifiName: wifiName.trim(), wifiPassword: wifiPassword.trim(), pppoeUser: pppoeUser.trim(),
      pppoePass: pppoePass.trim(), onuInfo: onuInfo.trim(), notes: notes.trim(),
    };
    try {
      if (initial) {
        await updateCustomer(initial.id, payload);
        onSaved(initial.id);
      } else {
        const id = await addCustomer(payload);
        onSaved(id);
      }
    } catch {
      setError("সেভ করা যায়নি, আবার চেষ্টা করুন");
    } finally {
      setBusy(false);
    }
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
              <input id="f-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: করিম উদ্দিন" className={inputCls} />
            </div>
            <div>
              <label htmlFor="f-mobile" className="font-semibold block mb-1">মোবাইল নম্বর *</label>
              <input id="f-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" placeholder="01XXXXXXXXX" className={inputCls} />
            </div>
            <div>
              <label htmlFor="f-address" className="font-semibold block mb-1">ঠিকানা *</label>
              <input id="f-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="বাড়ি / রাস্তা" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="f-gram" className="font-semibold block mb-1">গ্রাম *</label>
                <input id="f-gram" value={gram} onChange={(e) => setGram(e.target.value)} placeholder="গ্রামের নাম" className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-para" className="font-semibold block mb-1">পাড়া *</label>
                <input id="f-para" value={para} onChange={(e) => setPara(e.target.value)} placeholder="পাড়ার নাম" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="f-conn" className="font-semibold block mb-1">লাইন দেওয়ার তারিখ *</label>
                <input id="f-conn" type="date" value={connectionDate} onChange={(e) => setConnectionDate(e.target.value)} className={inputCls} />
                <p className="text-xs text-[var(--dim)] mt-1">১২ মাসের কার্ড এই তারিখ থেকেই শুরু হবে।</p>
              </div>
              <div>
                <label htmlFor="f-fee" className="font-semibold block mb-1">মাসিক বিল *</label>
                <input id="f-fee" value="৫০০ টাকা" disabled aria-label="মাসিক বিল ৫০০ টাকা, সবার জন্য একই" className={`${inputCls} opacity-70`} />
                <p className="text-xs text-[var(--dim)] mt-1">সবার জন্য একই — ৫০০ টাকা।</p>
              </div>
            </div>
            <div>
              <label htmlFor="f-pkg" className="font-semibold block mb-1">প্যাকেজ / স্পিড (মনে রাখার জন্য)</label>
              <input id="f-pkg" value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="যেমন: 10 Mbps" className={inputCls} />
            </div>

            <p className="font-bold pt-2">📶 রাউটারের তথ্য</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="f-wifi" className="font-semibold block mb-1">WiFi নাম (SSID)</label>
                <input id="f-wifi" value={wifiName} onChange={(e) => setWifiName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-wifipass" className="font-semibold block mb-1">WiFi পাসওয়ার্ড</label>
                <input id="f-wifipass" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-brand" className="font-semibold block mb-1">রাউটারের কোম্পানি</label>
                <input id="f-brand" value={routerBrand} onChange={(e) => setRouterBrand(e.target.value)} placeholder="TP-Link / Tenda / Cudy" className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-model" className="font-semibold block mb-1">মডেল</label>
                <input id="f-model" value={routerModel} onChange={(e) => setRouterModel(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-ip" className="font-semibold block mb-1">রাউটার IP</label>
                <input id="f-ip" value={routerIp} onChange={(e) => setRouterIp(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-onu" className="font-semibold block mb-1">ONU তথ্য</label>
                <input id="f-onu" value={onuInfo} onChange={(e) => setOnuInfo(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-pppoe" className="font-semibold block mb-1">PPPoE ইউজার</label>
                <input id="f-pppoe" value={pppoeUser} onChange={(e) => setPppoeUser(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-pppoepass" className="font-semibold block mb-1">PPPoE পাসওয়ার্ড</label>
                <input id="f-pppoepass" value={pppoePass} onChange={(e) => setPppoePass(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="f-notes" className="font-semibold block mb-1">নোট</label>
              <input id="f-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
            </div>
            {error && <p className="text-[#dc2626] font-semibold" role="alert">{error}</p>}
            <div className="sticky bottom-0 bg-[var(--bg)] pt-3 pb-1 -mx-1 px-1">
              <button onClick={() => void submit()} disabled={busy} aria-label="কাস্টমার সেভ করুন" className="w-full rounded-xl bg-[var(--accent)] text-white font-bold py-4 text-lg disabled:opacity-60 shadow-lg">
                {busy ? "সেভ হচ্ছে…" : "✓ সেভ করুন"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

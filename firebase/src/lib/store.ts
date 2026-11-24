// BCN — Firestore ডেটা স্তর
// কালেকশন: customers, payments
// পড়া কম রাখতে: কাস্টমার তালিকা আর পেমেন্ট একবারই subscribe করা হয়
// (onSnapshot + অফলাইন ক্যাশ) — প্রত্যেক ক্লিকে নতুন করে পড়া হয় না।

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { periodForCycle } from "./bangla";

export const MONTHLY_FEE = 500;

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  address: string;
  packageName: string;
  connectionDate: string; // লাইন দেওয়ার তারিখ — ১২ মাসের কার্ড এখান থেকে শুরু
  lineStatus: "on" | "off";
  routerBrand: string;
  routerModel: string;
  routerIp: string;
  wifiName: string;
  wifiPassword: string;
  pppoeUser: string;
  pppoePass: string;
  onuInfo: string;
  notes: string;
  createdAt: number; // মিলিসেকেন্ড
}

export interface Payment {
  id: string;
  customerId: string;
  cycleIndex: number;
  periodStart: string;
  periodEnd: string;
  amount: number;
  paidDate: string;
  method: string;
  createdAt: number;
}

export interface CustomerInput {
  name: string;
  mobile: string;
  address: string;
  packageName: string;
  connectionDate: string;
  routerBrand: string;
  routerModel: string;
  routerIp: string;
  wifiName: string;
  wifiPassword: string;
  pppoeUser: string;
  pppoePass: string;
  onuInfo: string;
  notes: string;
}

const customersCol = collection(db, "customers");
const paymentsCol = collection(db, "payments");

function toCustomer(id: string, data: Record<string, unknown>): Customer {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id,
    name: s(data.name),
    mobile: s(data.mobile),
    address: s(data.address),
    packageName: s(data.packageName),
    connectionDate: s(data.connectionDate),
    lineStatus: data.lineStatus === "off" ? "off" : "on",
    routerBrand: s(data.routerBrand),
    routerModel: s(data.routerModel),
    routerIp: s(data.routerIp),
    wifiName: s(data.wifiName),
    wifiPassword: s(data.wifiPassword),
    pppoeUser: s(data.pppoeUser),
    pppoePass: s(data.pppoePass),
    onuInfo: s(data.onuInfo),
    notes: s(data.notes),
    createdAt:
      typeof data.createdAt === "number"
        ? data.createdAt
        : data.createdAt && typeof (data.createdAt as { toMillis?: unknown }).toMillis === "function"
          ? (data.createdAt as { toMillis: () => number }).toMillis()
          : 0,
  };
}

function toPayment(id: string, data: Record<string, unknown>): Payment {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    id,
    customerId: s(data.customerId),
    cycleIndex: n(data.cycleIndex),
    periodStart: s(data.periodStart),
    periodEnd: s(data.periodEnd),
    amount: n(data.amount) || MONTHLY_FEE,
    paidDate: s(data.paidDate),
    method: s(data.method) || "নগদ",
    createdAt:
      typeof data.createdAt === "number"
        ? data.createdAt
        : data.createdAt && typeof (data.createdAt as { toMillis?: unknown }).toMillis === "function"
          ? (data.createdAt as { toMillis: () => number }).toMillis()
          : 0,
  };
}

/** একবার subscribe করলেই চলবে — এরপর সব ট্যাব এই একই লোকাল ডেটা থেকে হিসাব করবে। */
export function subscribeCustomers(cb: (list: Customer[]) => void): () => void {
  const q = query(customersCol, orderBy("name"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => toCustomer(d.id, d.data() as Record<string, unknown>)));
  });
}

export function subscribePayments(cb: (list: Payment[]) => void): () => void {
  const q = query(paymentsCol, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => toPayment(d.id, d.data() as Record<string, unknown>)));
  });
}

export async function addCustomer(input: CustomerInput): Promise<string> {
  const ref = await addDoc(customersCol, {
    ...input,
    lineStatus: "on",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<void> {
  await updateDoc(doc(db, "customers", id), { ...input });
}

export async function deleteCustomer(id: string, payments: Payment[]): Promise<void> {
  // কাস্টমারের সব বিলের হিসাবও মুছে যাবে
  for (const p of payments.filter((x) => x.customerId === id)) {
    await deleteDoc(doc(db, "payments", p.id));
  }
  await deleteDoc(doc(db, "customers", id));
}

export async function toggleLine(id: string, status: "on" | "off"): Promise<void> {
  await updateDoc(doc(db, "customers", id), { lineStatus: status });
}

/**
 * কার্ডের একটা মাসে টিক দেওয়া / টিক তোলা।
 * পেমেন্টের ডকুমেন্ট id নির্দিষ্ট: `${customerId}_${cycleIndex}` —
 * তাই একই মাসে দুইবার টিক পড়বে না, অফলাইনে দুইবার চাপলেও না।
 */
export async function togglePayment(
  customer: Customer,
  cycleIndex: number,
  method: string,
  paidDate: string,
): Promise<boolean> {
  const paymentId = `${customer.id}_${cycleIndex}`;
  const ref = doc(db, "payments", paymentId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await deleteDoc(ref);
    return false;
  }
  const period = periodForCycle(customer.connectionDate, cycleIndex);
  await setDoc(ref, {
    customerId: customer.id,
    cycleIndex,
    periodStart: period.start,
    periodEnd: period.end,
    amount: MONTHLY_FEE,
    paidDate,
    method: method || "নগদ",
    createdAt: serverTimestamp(),
  });
  return true;
}

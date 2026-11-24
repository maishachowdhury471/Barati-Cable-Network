import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  mobile: text("mobile").notNull(),
  address: text("address").notNull().default(""),
  packageName: text("package_name").notNull().default(""),
  monthlyFee: integer("monthly_fee").notNull().default(500),
  connectionDate: text("connection_date"),
  lineStatus: text("line_status", { enum: ["on", "off"] }).notNull().default("on"),
  routerBrand: text("router_brand").notNull().default(""),
  routerModel: text("router_model").notNull().default(""),
  routerIp: text("router_ip").notNull().default(""),
  wifiName: text("wifi_name").notNull().default(""),
  wifiPassword: text("wifi_password").notNull().default(""),
  pppoeUser: text("pppoe_user").notNull().default(""),
  pppoePass: text("pppoe_pass").notNull().default(""),
  onuInfo: text("onu_info").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  // 1..12 — লাইন দেওয়ার তারিখ থেকে গোনা ক্যালেন্ডার মাস
  cycleIndex: integer("cycle_index").notNull(),
  periodStart: text("period_start"), // YYYY-MM-DD
  periodEnd: text("period_end"), // YYYY-MM-DD
  amount: integer("amount").notNull().default(500),
  paidDate: text("paid_date"),
  method: text("method").notNull().default("নগদ"),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

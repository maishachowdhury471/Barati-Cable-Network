DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  package_name TEXT NOT NULL DEFAULT '',
  monthly_fee INTEGER NOT NULL DEFAULT 500,
  connection_date TEXT,
  line_status TEXT NOT NULL DEFAULT 'on',
  router_brand TEXT NOT NULL DEFAULT '',
  router_model TEXT NOT NULL DEFAULT '',
  router_ip TEXT NOT NULL DEFAULT '',
  wifi_name TEXT NOT NULL DEFAULT '',
  wifi_password TEXT NOT NULL DEFAULT '',
  pppoe_user TEXT NOT NULL DEFAULT '',
  pppoe_pass TEXT NOT NULL DEFAULT '',
  onu_info TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  cycle_index INTEGER NOT NULL,
  period_start TEXT,
  period_end TEXT,
  amount INTEGER NOT NULL DEFAULT 500,
  paid_date TEXT,
  method TEXT NOT NULL DEFAULT 'নগদ',
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX payments_customer_cycle_unique ON payments (customer_id, cycle_index);
--> statement-breakpoint
CREATE INDEX customers_mobile_idx ON customers (mobile);

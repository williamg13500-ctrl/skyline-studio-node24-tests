CREATE TABLE IF NOT EXISTS subscriptions (
  email TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'inactive',
  plan TEXT NOT NULL DEFAULT 'studio',
  period_end TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
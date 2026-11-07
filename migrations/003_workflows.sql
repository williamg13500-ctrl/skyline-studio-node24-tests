CREATE TABLE studio_review_requests (
 id BIGSERIAL PRIMARY KEY, project_id BIGINT NOT NULL REFERENCES studio_projects(id),
 owner_key TEXT NOT NULL, revision TEXT NOT NULL, jurisdiction TEXT NOT NULL, notes TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'awaiting_professional_assignment' CHECK(status='awaiting_professional_assignment'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX studio_review_owner ON studio_review_requests(owner_key,project_id,id);
CREATE TABLE studio_render_jobs (
 id BIGSERIAL PRIMARY KEY, project_id BIGINT NOT NULL REFERENCES studio_projects(id), owner_key TEXT NOT NULL,
 revision TEXT NOT NULL, brief JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','rendering','complete','failed')),
 lease_token TEXT, lease_until TIMESTAMPTZ, attempts INTEGER NOT NULL DEFAULT 0, storage_key TEXT, error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(owner_key,project_id,revision)
);
CREATE TABLE studio_billing_accounts (
 user_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, subscription_id TEXT UNIQUE NOT NULL,
 provider_status TEXT NOT NULL, event_created BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE studio_billing_events (
 event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
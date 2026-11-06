CREATE TABLE IF NOT EXISTS studio_site_contexts (
 id BIGSERIAL PRIMARY KEY,
 owner_key TEXT NOT NULL,
 project_id BIGINT NULL REFERENCES studio_projects(id),
 name TEXT NOT NULL DEFAULT 'Untitled site',
 latest_version INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS studio_site_contexts_owner_updated
 ON studio_site_contexts(owner_key, updated_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS studio_site_revisions (
 id BIGSERIAL PRIMARY KEY,
 site_context_id BIGINT NOT NULL REFERENCES studio_site_contexts(id),
 version INTEGER NOT NULL,
 site_context JSONB NOT NULL,
 analysis JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(site_context_id, version)
);
CREATE INDEX IF NOT EXISTS studio_site_revisions_context_created
 ON studio_site_revisions(site_context_id, created_at DESC);
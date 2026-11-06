CREATE TABLE IF NOT EXISTS studio_projects (
 id BIGSERIAL PRIMARY KEY,
 owner_key TEXT NOT NULL,
 name TEXT NOT NULL,
 brief JSONB NOT NULL,
 revision TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS studio_projects_owner_updated ON studio_projects(owner_key, updated_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS studio_revisions (
 id BIGSERIAL PRIMARY KEY,
 project_id BIGINT NOT NULL REFERENCES studio_projects(id),
 version INTEGER NOT NULL,
 brief JSONB NOT NULL,
 geometry JSONB NOT NULL,
 validation JSONB NOT NULL,
 revision TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(project_id, version)
);
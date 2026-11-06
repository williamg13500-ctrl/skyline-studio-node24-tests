CREATE TABLE IF NOT EXISTS studio_site_documents (
 id BIGSERIAL PRIMARY KEY,
 site_context_id BIGINT NOT NULL,
 site_version INTEGER NOT NULL,
 owner_key TEXT NOT NULL,
 storage_key TEXT NOT NULL UNIQUE,
 original_filename TEXT NOT NULL,
 content_type TEXT NOT NULL CHECK (content_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
 byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
 sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
 source_type TEXT NOT NULL CHECK (source_type IN ('survey','title_plan','authority_record','professional_observation','map_reference','other')),
 source_reference TEXT NOT NULL,
 evidence_status TEXT NOT NULL CHECK (evidence_status IN ('provided','verified','estimated','unknown','conflicting')),
 document_date DATE NULL,
 note TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY (site_context_id,site_version) REFERENCES studio_site_revisions(site_context_id,version) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS studio_site_documents_owner_site_created ON studio_site_documents(owner_key,site_context_id,created_at DESC);
CREATE TABLE IF NOT EXISTS studio_request_limits (
  key_hash text NOT NULL,
  route text NOT NULL,
  window_bucket bigint NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_hash, route, window_bucket)
);
CREATE INDEX IF NOT EXISTS studio_request_limits_bucket_idx ON studio_request_limits(window_bucket);
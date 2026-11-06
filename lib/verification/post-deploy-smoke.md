# Skyline Studio post-deploy smoke test

Hatchable currently has no native post-deploy canary hook. Therefore the deployment operator must run this smoke sequence immediately after every deploy using Hatchable's `run_function` tool. Do not mark a deployment verified until all three routes have been exercised and their request logs inspected.

## 1. Generate

Run `POST /api/studio/generate` with:

```json
{"name":"Post-deploy smoke","W":10,"D":12,"storeys":1,"beds":3,"baths":2,"study":true,"style":"modern"}
```

Expected: HTTP 200, geometry, model, revision and validation report; no TypeError; critical geometry count 0.

## 2. Projects

Take the generated `geometry`, `brief` and `revision`. Run `POST /api/studio/projects` with:

```json
{"brief":{"name":"Post-deploy smoke","W":10,"D":12,"storeys":1,"beds":3,"baths":2,"study":true,"style":"modern"},"operation":{"type":"rename-room","roomId":"f0-room-1","name":"Smoke living room"},"baseRevision":"<generated revision>","geometry":"<generated geometry>"}
```

Expected: HTTP 200 with a new revision and valid model. This is an edit-only smoke test; it does not save a project to the database.

## 3. Guided interpretation

Run `POST /api/studio/interpret` with:

```json
{"mode":"guided","text":"I want a single-storey home, 10 metres by 12 metres, with three bedrooms, two bathrooms and a study."}
```

Expected: HTTP 200, source `guided_text`, ready `true`, with the stated footprint and room counts. This must work without an AI provider key.

## 4. Logs

Inspect the three returned request logs. Each must include request ID, endpoint, mode, status, duration, redacted summary and body hash. No raw description or personal data may appear. On failures, confirm the stack trace and interpretation failure path are present.

## 5. Record outcome

Record the deployed version, UTC time, route statuses, request IDs, and any failures. If any route fails, stop release verification and fix the issue before promoting or announcing the deployment.
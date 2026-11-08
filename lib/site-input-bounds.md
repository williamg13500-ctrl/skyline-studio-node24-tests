# Site Intelligence input bounds and their meaning

This document records the current software input limits in lib/site-intelligence.js and the Studio controls. These are data-integrity, numerical-stability, user-interface or resource limits. They are not legal setbacks, planning rules, surveying tolerances, engineering thresholds or professional standards. No limit in this document establishes permission to build.

## Geometry coordinates and polygons

| Input | Current limit | Why it exists / interpretation |
|---|---:|---|
| Local site x/y coordinate | Finite metres within ±100,000 m on each axis | Technical coordinate-domain guardrail for local geometry. It is not a map projection, cadastral accuracy statement or maximum parcel dimension prescribed by an authority. |
| Parcel boundary vertices | 3–200 | Minimum polygon structure and upper bound on geometry work per boundary. |
| Exclusion-zone vertices | 3–200 per polygon | Same polygon-complexity guardrail. |
| Exclusion-zone records | At most 100 per site context | Resource bound; excess input is rejected, not silently truncated. |
| Constraint records | At most 100 per site context | Resource bound; excess input is rejected. |
| Access records | At most 20 per site context | Resource bound; excess input is rejected. |
| Boundary / exclusion polygon area | Finite and greater than the geometry epsilon (1e-8 m²) | Only degenerate or numerically indistinguishable zero-area polygons are rejected. The former 9 m² minimum and 100,000,000 m² maximum were removed because no source justified them as site acceptance rules. |
| Consecutive edge length | At least 1e-6 m | Numerical guard against duplicate/near-zero edges; not a survey tolerance. |
| Collinearity / segment geometry epsilon | 1e-8 in the current cross-product calculations | Computational tolerance, not a positional accuracy claim. |

Coordinates are local x/y metres. They are not latitude/longitude, GPS, northing/easting, a registered survey or a legal boundary. The UI drawing frame currently exposes 3–1,000 m width/depth controls for convenient on-screen sketching; these controls size the canvas frame and do not validate a parcel's legal dimensions. Imported coordinates are still subject to the engine's ±100,000 m coordinate-domain limit.

## Numeric site observations

| Input | Accepted values | Notes |
|---|---|---|
| North bearing | Finite number from 0° inclusive to 360° exclusive | Local orientation metadata only. It does not georeference the site. |
| Slope percentage | Any finite, non-negative number | The former 100% ceiling was removed; no maximum slope is inferred. The app does not derive grading, foundations, drainage or access gradients from this field. |
| Constraint distance | Null/omitted, or any finite non-negative number of metres | The former 10,000 m ceiling was removed. A recorded distance is not applied as a setback or legal offset. |
| Text labels / references | Clamped to field-specific lengths in code | Text truncation is a storage/display safeguard, not evidence validation. |

## Other bounded collections and browser inputs

- Access records: 20 maximum.
- Constraint records: 100 maximum.
- Exclusion-zone records: 100 maximum.
- Evidence source/status values are enumerated in code. A zone is applied to preliminary candidate filtering only when its status is exactly verified and its source is one of survey, title_plan, authority_record or professional_observation. The UI does not independently authenticate the evidence or the person making the assertion.
- Studio drawing frame controls: HTML min/max 3 m and 1,000 m. These are user-interface bounds only; imported local coordinates are not restricted to the drawing frame.
- Advanced exclusion-zone JSON text field: 20,000 characters.
- Site-context JSON import: 128 KiB maximum in the browser.
- Survey evidence upload: 8 MiB maximum in the site-document endpoint; allowed file signatures are separately checked. File storage integrity and source provenance do not mean the document's content or claims have been independently authenticated.

## Search-performance bounds are not site rules

The preliminary site-fit search uses a grid spacing derived from recorded parcel area with a 0.25 m minimum step and a cap of 24,000 examined placements. These are algorithm-performance controls. A candidate search can therefore be incomplete at its configured resolution or stop at its examination cap. No candidate found is not proof that a site is unbuildable; a candidate found is not a legal buildable envelope.

## Explicit non-inferences

The validator does not invent or infer legal parcel area minimums, maximum site area standards, slope acceptability, setback distances, easement widths, rights-of-way, hazard buffers, building coverage ratios, zoning envelopes or regulatory thresholds. Side/distance constraints are retained as evidence records and are not converted into setback geometry. Missing site data must not be interpreted as zero constraints.

Any future change to a technical limit must update this document and its boundary-value tests in the same change. Any jurisdictional or engineering threshold must instead have an identified, applicable, dated source and qualified review before it is implemented as a rule.

## Site-fit observation outputs

The site-fit response reports the parcel's axis-aligned local x/y bounding-box dimensions together with the boundary evidence record. These dimensions are search references derived from the supplied polygon; they are not independently surveyed or legally certified dimensions.

A supplied north bearing is retained with its evidence status as advisory metadata. Candidate rotations remain local-axis rotations; the system does not infer geographic orientation, solar exposure or daylight performance from the bearing.

Access records with points receive a straight-line distance to each returned candidate footprint. This is proximity information only: access observations do not filter or rank candidates, and the result does not assess road geometry, gradients, turning, width, emergency access or route feasibility. Unverified observations remain visibly identified by their evidence status and are never promoted to hard constraints.

#!/usr/bin/env python3
"""Recompute V66 manifest-vs-ZIP SHA-256 comparison.
Usage: python verification/compare-v66-hashes.py --manifest verification/v66-manifest.json --zip source.zip --output verification/v66-hash-comparison.csv
"""
import argparse,csv,hashlib,json,zipfile
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument("--manifest",required=True);p.add_argument("--zip",required=True);p.add_argument("--output",required=True)
a=p.parse_args();manifest=json.loads(Path(a.manifest).read_text())
with zipfile.ZipFile(a.zip) as z: files={n:z.read(n) for n in z.namelist() if not n.endswith("/")}
rows=[]
for name in sorted(set(manifest)|set(files)):
 expected=manifest.get(name,"")
 actual=hashlib.sha256(files[name]).hexdigest() if name in files else ""
 match="yes" if len(expected)==64 and expected==actual else "no"
 rows.append((name,expected,actual,match))
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True)
with out.open("w",newline="") as f:
 w=csv.writer(f);w.writerow(["file","v66_manifest_sha256","zip_sha256","match"]);w.writerows(rows)
print(f"manifest_files={len(manifest)} zip_files={len(files)} matches={sum(r[3]=='yes' for r in rows)} nonmatches={sum(r[3]=='no' for r in rows)}")
for row in rows: print("\t".join(row))

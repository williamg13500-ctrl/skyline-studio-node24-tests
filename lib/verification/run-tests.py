"""Run the source-controlled test bundle in a temporary checkout (Python 3 + Node 24+).
The tests mock Hatchable services; this runner does not contact the live database.
"""
from pathlib import Path
import json, shutil, subprocess, tempfile
root=Path(__file__).resolve().parents[2]
major=int(subprocess.check_output(['node','--version'],text=True).strip().lstrip('v').split('.')[0])
if major<24: raise SystemExit('Node.js 24 or newer is required.')
bundle=json.loads(Path(__file__).with_name('source-tests.json').read_text())
with tempfile.TemporaryDirectory(prefix='skyline-verification-') as work:
    work=Path(work)
    for name in ['api','lib','public']:
        shutil.copytree(root/name,work/name,ignore=shutil.ignore_patterns('__pycache__'))
    (work/'package.json').write_text('{"type":"module"}')
    for name,content in bundle.items():
        path=work/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content)
    result=subprocess.run(['node','--test',*sorted(bundle)],cwd=work)
    raise SystemExit(result.returncode)
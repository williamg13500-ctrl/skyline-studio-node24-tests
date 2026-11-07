"""External worker: Python 3 + Blender 4.5+ + ffmpeg. Never run inside Hatchable.
Set SKYLINE_ORIGIN and SKYLINE_RENDER_SECRET through your host secret manager.
python agent.py --once processes at most one job; omit --once to poll.
"""
import base64, hashlib, hmac, json, os, pathlib, subprocess, sys, tempfile, time, urllib.request, threading
ORIGIN=os.environ.get('SKYLINE_ORIGIN','https://skyline-studio-build.hatchable.site').rstrip('/')
SECRET=os.environ['SKYLINE_RENDER_SECRET']
if not ORIGIN.startswith('https://'): raise ValueError('HTTPS origin required')
def call(payload):
    raw=json.dumps(payload,separators=(',',':')).encode(); ts=str(int(time.time()))
    signature=hmac.new(SECRET.encode(),ts.encode()+b'.'+raw,hashlib.sha256).hexdigest()
    request=urllib.request.Request(ORIGIN+'/api/render/worker',data=raw,headers={'Content-Type':'application/json','X-Skyline-Timestamp':ts,'X-Skyline-Signature':signature})
    with urllib.request.urlopen(request,timeout=60) as r: return json.load(r)
def process(job):
    stop=threading.Event()
    def heartbeat():
        while not stop.wait(180):
            try: call({'action':'heartbeat','id':job['id'],'token':job['token']})
            except Exception: stop.set(); return
    thread=threading.Thread(target=heartbeat,daemon=True); thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix='skyline-render-') as work:
            work=pathlib.Path(work); (work/'job.json').write_text(json.dumps(job))
            subprocess.run([os.environ.get('BLENDER_BIN','blender'),'--background','--factory-startup','--python',str(pathlib.Path(__file__).with_name('scene.py')),'--',str(work/'job.json'),str(work)],check=True,timeout=3600)
            # Constrained output fits the upload budget; no shell or user-controlled commands.
            subprocess.run(['ffmpeg','-y','-framerate','24','-i',str(work/'frame_%04d.png'),'-c:v','libx264','-b:v','900k','-maxrate','1100k','-bufsize','2200k','-pix_fmt','yuv420p','-movflags','+faststart',str(work/'render.mp4')],check=True,timeout=180,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            data=(work/'render.mp4').read_bytes()
            if len(data)>3_000_000: raise ValueError('Video exceeds worker upload budget')
            if stop.is_set(): raise ValueError('Worker lease lost')
            call({'action':'complete','id':job['id'],'token':job['token'],'revision':job['revision'],'video':base64.b64encode(data).decode()})
    except Exception:
        try: call({'action':'fail','id':job['id'],'token':job['token']})
        except Exception: pass
        raise
    finally: stop.set();thread.join(timeout=2)
if __name__=='__main__':
    while True:
        job=call({'action':'claim'}).get('job')
        if job:
            try: process(job)
            except Exception: print('Rendering failed; inspect worker service logs.',file=sys.stderr)
        if '--once' in sys.argv: break
        time.sleep(15)
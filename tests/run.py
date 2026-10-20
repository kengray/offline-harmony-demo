import json, subprocess, time, sys
from playwright.sync_api import sync_playwright
import os
D=os.path.dirname(os.path.abspath(__file__))
B="/offline-harmony-demo/index.html"
servers={}
def up(port):
    servers[port]=subprocess.Popen(["node",f"{D}/serve.js",str(port)],cwd=D,stdout=subprocess.DEVNULL); time.sleep(0.8)
def down(port):
    servers[port].terminate(); servers[port].wait(); time.sleep(0.3)   # a real loss of connection: connection refused
results=[]
def check(name,cond,detail=""):
    results.append((name,bool(cond),detail)); print(("PASS " if cond else "FAIL ")+name+("  | "+str(detail) if detail else ""),flush=True)
msg=lambda pg: pg.inner_text("#msg"); acc=lambda pg: pg.inner_text("#access")
def token(pg,url_has="valid until"):
    pg.click("#getToken"); pg.wait_for_function("document.getElementById('access').innerText.includes('valid until')",timeout=5000)
def fresh(ctx,url):
    pg=ctx.new_page(); pg.goto(url); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector("#play"); return pg
up(8080); up(8081)
try:
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium",args=["--autoplay-policy=no-user-gesture-required","--no-sandbox"])
        # ===== Run 1: with service worker =====
        ctx=b.new_context(); page=fresh(ctx,"http://localhost:8080"+B+"")
        page.wait_for_function("window.__state.swActive===true",timeout=10000)
        check("1 service worker installed on first online visit",True)
        token(page); check("2 signed access token fetched and verified on device",True,acc(page))
        page.select_option("#song","song-a"); page.click("#save"); page.wait_for_function("document.getElementById('msg').innerText.startsWith('Saved')",timeout=15000)
        check("3 Song A saved for offline (Song B is not)",True,msg(page))
        down(8080)                                              # ---- server gone: no connection ----
        page.reload(); page.wait_for_selector("#play",timeout=10000)
        check("4 player itself loads after reload with server unreachable",True)
        page.select_option("#song","song-a"); page.wait_for_timeout(300)
        check("5 Song A shows 'saved'", "saved on this device" in page.inner_text("#saved"), page.inner_text("#saved"))
        page.click("#play"); page.wait_for_timeout(1500); st=page.evaluate("window.__state")
        check("6 Song A plays with no connection (4 parts decoded)", st["playing"] and st["decoded"]==[12.0]*4, st)
        page.click("#stop"); page.select_option("#song","song-b"); page.wait_for_timeout(300)
        check("7 Song B shows 'not saved'", "not saved" in page.inner_text("#saved"), page.inner_text("#saved"))
        page.click("#play"); page.wait_for_timeout(1500)
        check("8 Song B (never saved) refuses cleanly", not page.evaluate("window.__state.playing") and "not saved" in msg(page), msg(page))
        page.close(); p2=ctx.new_page(); p2.goto("http://localhost:8080"+B+""); p2.wait_for_selector("#play",timeout=10000)
        p2.select_option("#song","song-a"); p2.click("#play"); p2.wait_for_timeout(1500)
        check("9 tab closed and reopened with no connection: Song A still plays", p2.evaluate("window.__state.playing"), msg(p2))
        p2.close()
        # ---- expiry: short-lived token (3 s), saved song, no connection ----
        up(8080)
        p3=ctx.new_page(); p3.goto("http://localhost:8080"+B+"?ttl=3"); p3.evaluate("localStorage.clear()"); p3.reload(); p3.wait_for_selector("#play")
        token(p3); first=acc(p3)
        down(8080); p3.wait_for_timeout(4500)
        p3.select_option("#song","song-a"); p3.click("#play"); p3.wait_for_timeout(1000)
        check("10 expired token blocks playback even though Song A is saved", (not p3.evaluate("window.__state.playing")) and "expired" in msg(p3), msg(p3))
        # ---- renew online, then lose connection again ----
        up(8080)
        p4=ctx.new_page(); p4.goto("http://localhost:8080"+B+""); p4.wait_for_selector("#play"); token(p4)
        down(8080); p4.select_option("#song","song-a"); p4.click("#play"); p4.wait_for_timeout(1500)
        check("11 renewed token restores playback with no connection", p4.evaluate("window.__state.playing"), acc(p4))
        est=p4.evaluate("navigator.storage.estimate().then(e=>({usage:e.usage,quota:e.quota}))")
        check("12 storage used (one saved song + player), MB", True, {k:round(v/1e6,2) for k,v in est.items()})
        p4.evaluate("(()=>{const t=localStorage.getItem('poc-token').split('.');const pl=JSON.parse(atob(t[0].replace(/-/g,'+').replace(/_/g,'/')));pl.exp=Date.now()+1e12;localStorage.setItem('poc-token',btoa(JSON.stringify(pl)).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')+'.'+t[1]);})()")
        p4.click("#stop"); p4.click("#play"); p4.wait_for_timeout(800)
        check("13 edited token (expiry pushed out) is rejected", (not p4.evaluate("window.__state.playing")) and "signature invalid" in acc(p4), acc(p4))
        ctx.close()
        # ===== Run 2: weakness - clock set back =====
        up(8080); ctx=b.new_context(); pg=fresh(ctx,"http://localhost:8080"+B+"?ttl=3"); pg.wait_for_function("window.__state.swActive===true")
        token(pg); pg.select_option("#song","song-a"); pg.click("#save"); pg.wait_for_function("document.getElementById('msg').innerText.startsWith('Saved')")
        down(8080); pg.wait_for_timeout(4500)
        pg.click("#play"); pg.wait_for_timeout(800); before=pg.evaluate("window.__state.playing")
        pg.evaluate("(()=>{const real=Date.now;Date.now=()=>real()-3600*1000;})()")   # device clock set back one hour
        pg.click("#play"); pg.wait_for_timeout(1500); after=pg.evaluate("window.__state.playing")
        check("14 KNOWN WEAKNESS: expired before clock change, plays after setting clock back", (not before) and after, f"before={before} after={after}")
        ctx.close()
        # ===== Run 3: control - same code, no service worker, separate origin =====
        ctx=b.new_context(); pg=fresh(ctx,"http://localhost:8081"+B+"?sw=0"); token(pg)
        pg.select_option("#song","song-a"); pg.click("#play"); pg.wait_for_timeout(1500)
        check("15 CONTROL (no service worker) plays while online", pg.evaluate("window.__state.playing"))
        down(8081); pg.click("#stop"); pg.click("#play"); pg.wait_for_timeout(1500)
        check("16 CONTROL: page left open, connection lost, song reloaded -> cannot play (nothing was saved)", not pg.evaluate("window.__state.playing"), msg(pg))
        try: pg.reload(timeout=8000); reloaded=pg.query_selector("#play") is not None
        except Exception: reloaded=False
        check("17 CONTROL: reload with no connection fails (browser error page)", not reloaded)
        ctx.close(); b.close()
finally:
    for pr in servers.values():
        try: pr.terminate()
        except Exception: pass
fails=[r for r in results if not r[1]]
json.dump(results,open(f"{D}/results.json","w"),indent=1,default=str)
print("\n%d checks, %d failed"%(len(results),len(fails)))
sys.exit(1 if fails else 0)

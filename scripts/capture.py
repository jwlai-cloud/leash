"""Record the live Leash demo for the video.

Drives https://leash-i813.onrender.com in a visible Chrome window, records the page,
and saves screenshots at each key moment into video/capture/.
The only manual step: you click the PayPal button and log in to the sandbox popup yourself.

Run: python3 scripts/capture.py
"""
import os, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'https://leash-i813.onrender.com'
OUT = Path(os.environ.get('OUT', 'video/capture')); OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'marks.tsv').write_text('')
W, H = 1440, 900
t0 = time.time()
marks = []

def log(msg):
    print(f'[{time.time() - t0:6.1f}s] {msg}', flush=True)

def shot(page, name, el=None):
    path = OUT / f'{name}.png'
    (page.locator(el).screenshot(path=path) if el else page.screenshot(path=path))
    with open(OUT / 'marks.tsv', 'a') as f:  # written as we go, so a failed run still keeps its marks
        f.write(f'{time.time() - t0:.1f}\t{name}\n')
    log(f'shot {name}')

def show(page, sel):
    page.locator(sel).first.evaluate("e => e.scrollIntoView({behavior: 'smooth', block: 'center'})")
    page.wait_for_timeout(700)

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=bool(os.environ.get('HEADLESS')), args=[f'--window-size={W},{H + 120}'])
    ctx = browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2,
                              record_video_dir=str(OUT), record_video_size={'width': W, 'height': H})
    page = ctx.new_page()
    page.bring_to_front()
    log('opening site (Render may take up to a minute to wake)')
    page.goto(URL, timeout=120_000)
    page.wait_for_function("document.querySelector('#modes') && document.querySelector('#modes').textContent.includes('PayPal')", timeout=120_000)
    page.wait_for_timeout(1500)
    shot(page, '01-landing')

    # Request: type it so the video shows it.
    req = page.locator('#req')
    req.fill('')
    req.type("A drawing set for my niece's 10th birthday, under $40", delay=35)
    if not page.locator('#scam').is_checked():
        page.locator('#scam').check()
    page.wait_for_timeout(600)
    shot(page, '03-request')
    page.locator('#go').click()

    # Negotiation: flipbook frames while it runs.
    page.wait_for_function("/\\$\\d/.test(document.querySelector('#mandate').textContent)", timeout=60_000)
    page.wait_for_timeout(500)
    shot(page, '03-mandate', '#mandate')
    shot(page, '03-mandate-page')
    for i in range(30):
        page.wait_for_timeout(700)
        shot(page, f'neg-{i:02d}')
        if page.locator('#checks li').count() > 0:
            break
    page.wait_for_timeout(800)
    for name, sel in [('04-feed', '#feed'), ('05-removed', '#removed'), ('06-chart', '#chart'), ('06-price', '#price'), ('07-checks', '#checks')]:
        try:
            show(page, sel); shot(page, name, sel)
        except Exception as e:
            log(f'skip {name}: {e}')
    show(page, '#verdictWord'); shot(page, '07-verdict-page')
    show(page, '#payGate'); shot(page, '08-paygate-page')

    # Manual step: PayPal login is yours.
    page.bring_to_front()
    subprocess.run(['osascript', '-e', 'display notification "Click the PayPal button and pay in the Leash window" with title "Leash capture" sound name "Glass"'])
    log('>>> YOUR TURN: if it says Needs you, tick the box. Click the PayPal button, log in with the sandbox buyer account, and pay.')
    sim = page.get_by_role('button', name='(simulated)')
    if sim.count():  # dry run against a server without PayPal keys
        sim.first.click()
    page.wait_for_function("/Paid/.test(document.querySelector('#payMsg').textContent)", timeout=1_800_000)
    log('paid')
    show(page, '#payMsg'); shot(page, '08-paid-page')

    # After payment: seller ships, buyer verifies (settle stream), then refund twice.
    page.get_by_role('button', name='Pull the leash · refund').wait_for(timeout=120_000)
    show(page, '#feed'); shot(page, '09-settled-feed', '#feed'); shot(page, '09-settled-page')
    show(page, '#payGate')
    page.get_by_role('button', name='Pull the leash · refund').click()
    page.get_by_role('button', name='Try refunding again').wait_for(timeout=120_000)
    page.wait_for_timeout(800)
    shot(page, '09-refunded-page')
    page.get_by_role('button', name='Try refunding again').click()
    page.wait_for_function("/Leash blocked/.test(document.querySelector('#payMsg').textContent)", timeout=120_000)
    page.wait_for_timeout(800)
    shot(page, '09-blocked-page'); shot(page, '09-blocked-panel', '#payMsg')

    log('waiting up to 90s for PayPal webhooks')
    for _ in range(30):
        if page.locator('#feed').get_by_text('signature verified').count() >= 2:
            break
        page.wait_for_timeout(3000)
    show(page, '#feed'); shot(page, '09-webhooks-feed', '#feed'); shot(page, '09-webhooks-page')

    # Bonus: a deal that doesn't match the mandate never becomes a PayPal order.
    page.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})"); page.wait_for_timeout(800)
    req.fill('')
    req.type('A $50 gift card for my nephew, under $60', delay=35)
    page.locator('#go').click()
    page.wait_for_function("document.querySelectorAll('#checks li').length > 0", timeout=90_000)
    page.wait_for_timeout(1200)
    show(page, '#verdictWord'); shot(page, '10-giftcard-page')
    page.wait_for_timeout(1500)

    ctx.close(); browser.close()
log('done. files in video/capture/')

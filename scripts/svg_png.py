"""Save the diagram from an Archify HTML file as a PNG, so GitHub can show it.
Run: python3 scripts/svg_png.py docs/architecture.html docs/architecture.png"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
src, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    pg = b.new_page(viewport={'width': 1600, 'height': 1100}, device_scale_factor=2, color_scheme='light')
    pg.goto(Path(src).resolve().as_uri()); pg.wait_for_timeout(2000)
    # hide the viewer's floating toolbar (it reads PATH / MAP / LENS) so only the diagram is captured
    pg.evaluate("""() => {
      const main = [...document.querySelectorAll('svg')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
      for (const e of document.querySelectorAll('body *')) {
        const pos = getComputedStyle(e).position;
        if ((pos === 'fixed' || pos === 'absolute') && /LENS/.test(e.innerText || '') && !e.contains(main)) e.style.display = 'none';
      }
    }""")
    pg.evaluate("() => [...document.querySelectorAll('svg')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0].setAttribute('data-main', '1')")
    pg.locator('svg[data-main]').screenshot(path=out)
    b.close()

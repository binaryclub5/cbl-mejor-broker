from playwright.sync_api import sync_playwright
import pathlib
url = "file://"+str(pathlib.Path("index.html").resolve())
with sync_playwright() as p:
    b = p.chromium.launch()
    for w,tag in [(360,"360"),(390,"390"),(412,"412")]:
        pg = b.new_page(viewport={"width":w,"height":300}, device_scale_factor=2)
        pg.goto(url); pg.wait_for_timeout(400)
        pg.locator(".top").screenshot(path=f"hdr_{tag}.png")
        pg.close()
    b.close()
print("ok")

from playwright.sync_api import sync_playwright
import pathlib
url = "file://"+str(pathlib.Path("index.html").resolve())
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width":390,"height":844}, device_scale_factor=2)
    pg.goto(url); pg.wait_for_timeout(600)
    pg.screenshot(path="top.png")
    b.close()
print("ok")

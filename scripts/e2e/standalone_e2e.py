"""端到端：单文件产物（dist-standalone/rift-chronicles.html）用 file:// 直接打开能进入标题并开始新游戏。
运行前先执行：npm run build:standalone。运行：python3 scripts/e2e/standalone_e2e.py（仓库根目录）"""
import asyncio
import pathlib
from playwright.async_api import async_playwright

PATH = pathlib.Path("dist-standalone/rift-chronicles.html").resolve()


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--allow-file-access-from-files=false"])
        pg = await b.new_page(viewport={"width": 1280, "height": 720})
        errs, requests = [], []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("request", lambda r: requests.append(r.url) if not r.url.startswith(("file:", "data:", "blob:")) else None)
        await pg.goto(PATH.as_uri())
        await pg.wait_for_function("window.__game && window.__game.scene.getScene('TitleScene').scene.isActive()", timeout=30000)
        await pg.wait_for_timeout(500)
        await pg.keyboard.press("Enter")
        await pg.wait_for_function("window.__game.scene.getScene('OverworldScene').scene.isActive()", timeout=15000)
        print("entered overworld from file://")
        print("external requests:", requests)
        print("errors:", errs[:5])
        assert not errs, "page errors"
        assert not requests, "unexpected network requests"
        print("ALL OK")
        await b.close()

asyncio.run(main())

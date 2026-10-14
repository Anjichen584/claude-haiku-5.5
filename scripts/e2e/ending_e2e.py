"""端到端：主线第 24 章完成后显示结局面板，按 E 关闭。
运行前先启动开发服务器：npx vite --host 0.0.0.0 --port 5173
运行：python3 scripts/e2e/ending_e2e.py（在仓库根目录执行）"""
import asyncio
from playwright.async_api import async_playwright

URL = "http://localhost:5173/"
OVER = "window.__game.scene.getScene('OverworldScene')"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1280, "height": 720})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.wait_for_function("window.__game && window.__game.scene.getScene('TitleScene').scene.isActive()", timeout=20000)
        await pg.wait_for_timeout(500)
        await pg.keyboard.press("Enter")
        await pg.wait_for_function(f"{OVER}.scene.isActive()", timeout=10000)
        await pg.wait_for_timeout(300)

        # 模拟：第 24 章主线完成（无任何抉择，应得到默认结局）
        await pg.evaluate(f"() => {OVER}.rewardLines([{{ questId: 'main_24', rewards: {{}} }}])")
        await pg.wait_for_timeout(200)
        visible = await pg.evaluate(f"() => {OVER}.endingPanel.visible")
        text = await pg.evaluate(f"() => {OVER}.endingPanel.text")
        reached = await pg.evaluate(f"() => {OVER}.session.world.hasFlag('ending_reached')")
        print("ending panel:", visible, "| flag:", reached, "|", text.split("\n")[0])
        assert visible and reached and "【结局：" in text, "ending panel not shown"

        # 按 E 关闭
        await pg.keyboard.press("e")
        await pg.wait_for_timeout(200)
        closed = not await pg.evaluate(f"() => {OVER}.endingPanel.visible")
        print("closed with E:", closed)
        assert closed, "ending panel did not close"

        print("errors:", errs[:5])
        assert not errs, "page errors"
        print("ALL OK")
        await b.close()

asyncio.run(main())

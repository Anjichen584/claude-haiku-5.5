"""端到端：第 4 章主线完成后出现关键抉择，数字键选择后写入标记并消失。
运行前先启动开发服务器：npx vite --host 0.0.0.0 --port 5173
运行：python3 scripts/e2e/key_choice_e2e.py（在仓库根目录执行）"""
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

        # 模拟：第 4 章主线已完成
        await pg.evaluate(f"""() => {{ const s = {OVER};
            s.session.world.setQuest('main_04', {{ status: 'completed', progress: [] }});
            s.refreshKeyChoice(); }}""")
        await pg.wait_for_timeout(200)
        visible = await pg.evaluate(f"() => {OVER}.choicePrompt.visible")
        text = await pg.evaluate(f"() => {OVER}.choicePrompt.text")
        print("prompt visible:", visible, "|", text.replace("\n", " / "))
        assert visible and "裂隙核心" in text, "key choice prompt not shown"

        # 选择第 2 项：研究它
        await pg.keyboard.press("2")
        await pg.wait_for_timeout(300)
        flag = await pg.evaluate(f"() => {OVER}.session.world.hasFlag('studied_rift_core')")
        still = await pg.evaluate(f"() => {OVER}.choicePrompt.visible")
        print("flag studied_rift_core:", flag, "| prompt still visible:", still)
        assert flag and not still, "choice was not recorded"

        print("errors:", errs[:5])
        assert not errs, "page errors"
        print("ALL OK")
        await b.close()

asyncio.run(main())

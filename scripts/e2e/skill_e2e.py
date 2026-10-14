"""端到端：技能面板（G 打开、数字键学习、X 重置分支、金币不足时不重置）。
运行前先启动开发服务器：npx vite --host 0.0.0.0 --port 5173
运行：python3 scripts/e2e/skill_e2e.py（在仓库根目录执行）"""
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

        # 给 5 点技能点
        await pg.evaluate(f"() => {{ {OVER}.session.player.skills.points = 5; }}")
        await pg.keyboard.press("g")
        await pg.wait_for_timeout(300)
        visible = await pg.evaluate(f"() => {OVER}.skillPanel.visible")
        text = await pg.evaluate(f"() => {OVER}.skillPanel.text")
        print("skill panel:", visible, "|", text.split("\n")[1])
        assert visible and "技能点 5" in text, "skill panel not shown"

        # 学习第 1 个技能
        await pg.keyboard.press("1")
        await pg.wait_for_timeout(300)
        unlocked = await pg.evaluate(f"() => {OVER}.session.player.skills.unlocked.slice()")
        points = await pg.evaluate(f"() => {OVER}.session.player.skills.points")
        print("learned:", unlocked, "| points:", points)
        assert len(unlocked) == 1 and points == 4, "learning did not apply"

        # 金币不足时不重置
        await pg.evaluate(f"() => {{ {OVER}.session.player.gold = 0; }}")
        await pg.keyboard.press("x")
        await pg.wait_for_timeout(300)
        still = await pg.evaluate(f"() => {OVER}.session.player.skills.unlocked.length")
        print("reset without gold kept skills:", still == 1)
        assert still == 1, "reset should not happen without gold"

        # 有金币时重置，技能点返还
        await pg.evaluate(f"() => {{ {OVER}.session.player.gold = 10000; }}")
        await pg.keyboard.press("x")
        await pg.wait_for_timeout(300)
        after = await pg.evaluate(f"() => [{OVER}.session.player.skills.unlocked.length, {OVER}.session.player.skills.points]")
        print("after reset (unlocked, points):", after)
        assert after[0] == 0 and after[1] == 5, "reset did not refund points"

        await pg.keyboard.press("g")
        print("errors:", errs[:5])
        assert not errs, "page errors"
        print("ALL OK")
        await b.close()

asyncio.run(main())

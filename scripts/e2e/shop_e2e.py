"""端到端：地牢商店（打开、购买、金币不足、关闭后数字键恢复移动）。
运行前先启动开发服务器：npx vite --host 0.0.0.0 --port 5173
运行：python3 scripts/e2e/shop_e2e.py（在仓库根目录执行）"""
import asyncio
import json
import os
from playwright.async_api import async_playwright

URL = "http://localhost:5173/"
HERE = os.path.dirname(os.path.abspath(__file__))
GATE = json.load(open(os.path.join(HERE, "gate.json")))
OVER = "window.__game.scene.getScene('OverworldScene')"
DUNGEON = "window.__game.scene.getScene('DungeonScene')"


async def active(pg, key, timeout=10000):
    await pg.wait_for_function(f"window.__game.scene.getScene('{key}').scene.isActive()", timeout=timeout)
    await pg.wait_for_timeout(300)


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
        await active(pg, "OverworldScene")

        # 进入地牢
        await pg.evaluate(f"""(g) => {{ const s = {OVER};
            s.tileX = g.x; s.tileY = g.y; s.player.setPosition(g.x*8, g.y*8); }}""", GATE)
        await pg.wait_for_timeout(300)
        await pg.keyboard.press("e")
        await active(pg, "DungeonScene")

        # 走到商店房间
        shop_id = await pg.evaluate(f"""() => {{ const s = {DUNGEON};
            const r = s.run.layout.rooms.find((x) => x.kind === 'shop'); s.run.current = r.id; return r.id; }}""")
        await pg.evaluate(f"() => {{ {DUNGEON}.session.player.gold = 100; }}")
        await pg.keyboard.press("e")
        await pg.wait_for_timeout(300)
        opened = await pg.evaluate(f"() => {DUNGEON}.shopOpen")
        msg = await pg.evaluate(f"() => {DUNGEON}.message.text")
        print("shop opened:", opened, "|", msg.split("\n")[0])
        assert opened and "商店" in msg, "shop did not open"

        # 购买第 1 件（铁剑 40 金币）
        await pg.keyboard.press("1")
        await pg.wait_for_timeout(300)
        gold = await pg.evaluate(f"() => {DUNGEON}.session.player.gold")
        sword = await pg.evaluate(f"() => {DUNGEON}.session.world.getItemCount('iron_sword')")
        print("after buying item 1: gold", gold, "| iron_sword", sword)
        assert gold == 60 and sword == 1, "purchase did not apply"

        # 金币不足：第 2 件（灰烬头盔 220 金币）
        await pg.keyboard.press("2")
        await pg.wait_for_timeout(300)
        msg = await pg.evaluate(f"() => {DUNGEON}.message.text")
        helm = await pg.evaluate(f"() => {DUNGEON}.session.world.getItemCount('ash_helm')")
        print("insufficient gold message:", "金币不足" in msg, "| helm", helm)
        assert "金币不足" in msg and helm == 0, "insufficient gold not handled"

        # 关闭商店后，数字键恢复移动
        await pg.keyboard.press("e")
        await pg.wait_for_timeout(200)
        closed = not await pg.evaluate(f"() => {DUNGEON}.shopOpen")
        before = await pg.evaluate(f"() => {DUNGEON}.run.current")
        await pg.keyboard.press("1")
        await pg.wait_for_timeout(200)
        after = await pg.evaluate(f"() => {DUNGEON}.run.current")
        print("closed:", closed, "| moved after closing:", before != after)
        assert closed and before == shop_id and after != shop_id, "movement not restored after closing shop"

        print("errors:", errs[:5])
        assert not errs, "page errors"
        print("ALL OK")
        await b.close()

asyncio.run(main())

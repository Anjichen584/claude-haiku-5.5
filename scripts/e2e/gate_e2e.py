import asyncio, json
from playwright.async_api import async_playwright
URL = "http://localhost:5173/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1280, "height": 720})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append("console:"+m.text) if m.type == "error" else None)
        await pg.goto(URL)
        await pg.wait_for_function("window.__game && window.__game.scene.getScene('TitleScene') && window.__game.scene.getScene('TitleScene').scene.isActive()", timeout=20000)
        await pg.wait_for_timeout(500)
        await pg.keyboard.press("Enter")
        await pg.wait_for_function("window.__game.scene.getScene('OverworldScene').scene.isActive()", timeout=10000)
        await pg.wait_for_timeout(500)
        # use gate anchor from world: find via grep result in python instead
        gate = json.loads(open('scripts/e2e/gate.json').read())
        await pg.evaluate("""(g) => { const s = window.__game.scene.getScene('OverworldScene');
            s.tileX = g.x; s.tileY = g.y; s.player.setPosition(g.x*8, g.y*8); }""", gate)
        await pg.wait_for_timeout(300)
        await pg.keyboard.press("e")
        await pg.wait_for_function("window.__game.scene.getScene('DungeonScene').scene.isActive()", timeout=10000)
        await pg.wait_for_timeout(500)
        await pg.screenshot(path="/tmp/dungeon1.png")
        # 战斗往返：把当前房间设为一个战斗房间，进入战斗，击败敌人，回到地牢
        cid = await pg.evaluate("""() => { const s = window.__game.scene.getScene('DungeonScene');
            const r = s.run.layout.rooms.find((x) => x.kind === 'combat'); s.run.current = r.id; return r.id; }""")
        await pg.keyboard.press("e")
        await pg.wait_for_function("window.__game.scene.getScene('TestRoomScene').scene.isActive()", timeout=10000)
        await pg.wait_for_timeout(300)
        await pg.evaluate("""() => { const t = window.__game.scene.getScene('TestRoomScene');
            for (const e of [...t.enemies]) t.damageEnemy(e, 99999); }""")
        await pg.wait_for_timeout(300)
        await pg.keyboard.press("Space")
        await pg.wait_for_function("window.__game.scene.getScene('DungeonScene').scene.isActive()", timeout=10000)
        await pg.wait_for_timeout(300)
        cleared = await pg.evaluate("() => [...window.__game.scene.getScene('DungeonScene').run.cleared]")
        print("combat room", cid, "cleared after return:", cleared)
        assert cid in cleared, "combat room not marked cleared"
        print("combat round trip OK")
        # move through a neighbor
        await pg.keyboard.press("1")
        await pg.wait_for_timeout(200)
        await pg.screenshot(path="/tmp/dungeon2.png")
        # Boss 通关：设为 Boss 房间并击败，检查下一层解锁
        bid = await pg.evaluate("""() => { const s = window.__game.scene.getScene('DungeonScene');
            const r = s.run.layout.rooms.find((x) => x.kind === 'boss'); s.run.current = r.id; return r.id; }""")
        await pg.keyboard.press("e")
        await pg.wait_for_function("window.__game.scene.getScene('TestRoomScene').scene.isActive()", timeout=10000)
        await pg.wait_for_timeout(300)
        await pg.evaluate("""() => { const t = window.__game.scene.getScene('TestRoomScene');
            for (const e of [...t.enemies]) t.damageEnemy(e, 99999); }""")
        await pg.wait_for_timeout(300)
        await pg.keyboard.press("Space")
        await pg.wait_for_function("window.__game.scene.getScene('DungeonScene').scene.isActive()", timeout=10000)
        await pg.wait_for_timeout(300)
        floor = await pg.evaluate("() => window.__game.scene.getScene('DungeonScene').session.dungeonFloor")
        print("boss room", bid, "dungeonFloor after boss:", floor)
        assert floor == 2, "dungeon floor did not advance after boss"
        print("boss clear OK")
        await pg.keyboard.press("l")
        await pg.wait_for_function("window.__game.scene.getScene('OverworldScene').scene.isActive()", timeout=10000)
        print("OK back in overworld")
        print("errors:", errs[:5])
        await b.close()
asyncio.run(main())

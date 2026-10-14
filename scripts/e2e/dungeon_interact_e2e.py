"""端到端：地牢房间互动（宝箱/休息/事件）、战败回地表、背包 I 与装备 C 面板。
运行前先启动开发服务器：npx vite --host 0.0.0.0 --port 5173
运行：python3 scripts/e2e/dungeon_interact_e2e.py（在仓库根目录执行）"""
import asyncio, json, os
from playwright.async_api import async_playwright

URL = "http://localhost:5173/"
HERE = os.path.dirname(os.path.abspath(__file__))
GATE = json.load(open(os.path.join(HERE, "gate.json")))

DUNGEON = "window.__game.scene.getScene('DungeonScene')"
OVER = "window.__game.scene.getScene('OverworldScene')"
TEST = "window.__game.scene.getScene('TestRoomScene')"


async def active(pg, key, timeout=10000):
    await pg.wait_for_function(f"window.__game.scene.getScene('{key}').scene.isActive()", timeout=timeout)
    await pg.wait_for_timeout(300)


async def enter_dungeon(pg):
    await pg.evaluate("""(g) => { const s = window.__game.scene.getScene('OverworldScene');
        s.tileX = g.x; s.tileY = g.y; s.player.setPosition(g.x*8, g.y*8); }""", GATE)
    await pg.wait_for_timeout(300)
    await pg.keyboard.press("e")
    await active(pg, "DungeonScene")


async def room_of_kind(pg, kind):
    return await pg.evaluate(f"""() => {{ const s = {DUNGEON};
        const r = s.run.layout.rooms.find((x) => x.kind === '{kind}' && !s.run.cleared.has(x.id));
        s.run.current = r.id; return r.id; }}""")


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
        await enter_dungeon(pg)

        # ---- 宝箱：获得金币，房间标记为已清理 ----
        rid = await room_of_kind(pg, "chest")
        await pg.evaluate(f"() => {{ {DUNGEON}.session.player.gold = 0; }}")
        await pg.keyboard.press("e")
        await pg.wait_for_timeout(300)
        gold = await pg.evaluate(f"() => {DUNGEON}.session.player.gold")
        cleared = await pg.evaluate(f"() => {DUNGEON}.run.cleared.has({rid})")
        print("chest: gold", gold, "cleared", cleared)
        assert gold > 0 and cleared, "chest reward failed"

        # ---- 休息点：恢复生命 ----
        rid = await room_of_kind(pg, "rest")
        await pg.evaluate(f"() => {{ {DUNGEON}.session.player.hp = 50; }}")
        await pg.keyboard.press("e")
        await pg.wait_for_timeout(300)
        hp = await pg.evaluate(f"() => {DUNGEON}.session.player.hp")
        print("rest: hp", hp)
        assert hp > 50, "rest did not heal"

        # ---- 事件：获得经验 ----
        rid = await room_of_kind(pg, "event")
        await pg.evaluate(f"() => {{ {DUNGEON}.session.player.exp = 0; }}")
        await pg.keyboard.press("e")
        await pg.wait_for_timeout(300)
        exp = await pg.evaluate(f"() => {DUNGEON}.session.player.exp")
        print("event: exp", exp)
        assert exp > 0, "event reward failed"

        # ---- 战败：玩家死亡后回到地表 ----
        rid = await room_of_kind(pg, "combat")
        await pg.keyboard.press("e")
        await active(pg, "TestRoomScene")
        await pg.evaluate(f"() => {{ const t = {TEST}; t.playerActor.hp = 0; t.checkEncounterEnd(); }}")
        await pg.wait_for_timeout(300)
        await pg.keyboard.press("Space")
        await active(pg, "OverworldScene")
        print("defeat: returned to overworld")

        # ---- 背包 I 面板 ----
        await pg.evaluate(f"() => {OVER}.session.world.addItem('ash_helm', 1)")
        await pg.keyboard.press("i")
        await pg.wait_for_timeout(300)
        inv_visible = await pg.evaluate(f"() => {OVER}.invPanel.visible")
        inv_text = await pg.evaluate(f"() => {OVER}.invPanel.text")
        print("inventory panel visible:", inv_visible, "| text:", inv_text.replace("\n", " / ")[:80])
        assert inv_visible and inv_text.strip(), "inventory panel not shown"
        await pg.keyboard.press("i")
        await pg.wait_for_timeout(200)
        assert not await pg.evaluate(f"() => {OVER}.invPanel.visible"), "inventory panel did not close"

        # ---- 装备 C 面板：数字键 2 装备头部 ----
        await pg.keyboard.press("c")
        await pg.wait_for_timeout(300)
        assert await pg.evaluate(f"() => {OVER}.equipPanel.visible"), "equip panel not shown"
        await pg.keyboard.press("2")
        await pg.wait_for_timeout(300)
        head = await pg.evaluate(f"() => {OVER}.session.player.equipment.head")
        count = await pg.evaluate(f"() => {OVER}.session.world.getItemCount('ash_helm')")
        panel = await pg.evaluate(f"() => {OVER}.equipPanel.text")
        print("equip: head =", head, "| ash_helm left in bag =", count)
        print("equip panel:", panel.replace("\n", " / "))
        assert head == "ash_helm" and count == 0, "equip via digit 2 failed"
        await pg.keyboard.press("c")

        # ---- 声望 R 面板 ----
        await pg.keyboard.press("r")
        await pg.wait_for_timeout(300)
        rep_text = await pg.evaluate(f"() => {OVER}.repPanel.text")
        print("reputation panel:", rep_text.replace("\n", " / ")[:90])
        assert await pg.evaluate(f"() => {OVER}.repPanel.visible") and "阵营声望" in rep_text, "reputation panel not shown"
        await pg.keyboard.press("r")

        print("errors:", errs[:5])
        assert not errs, "page errors"
        print("ALL OK")
        await b.close()

asyncio.run(main())

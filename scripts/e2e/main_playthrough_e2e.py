"""端到端：浏览器中按顺序完成 24 个主线任务，并走到结局面板。

真实路径：
- 抵达地点：把玩家放到地点坐标上，由游戏自己的 checkArrivals 判定（含区域门槛）。
- 关键抉择：按数字键（真实按键）选择选项。
- 奖励：由 OverworldScene.rewardLines 发放（与游戏内相同）。
注入的部分（战斗不在脚本中复现）：击杀事件直接上报给任务系统；收集物品直接加入背包。

运行前先启动开发服务器：npx vite --host 0.0.0.0 --port 5173
运行：python3 scripts/e2e/main_playthrough_e2e.py（在仓库根目录执行）
"""
import asyncio
import json
from playwright.async_api import async_playwright

URL = "http://localhost:5173/"
OVER = "window.__game.scene.getScene('OverworldScene')"

# 与 data/key-choices.json 对应：章节 -> (选择 id, 数字键 = 选项在列表中的序号)
CHOICES = {4: "seal", 10: "refuse", 16: "decline", 22: "answer"}

quests = [q for q in json.load(open("data/quests.json", encoding="utf-8"))["quests"] if q["type"] == "main"]
quests.sort(key=lambda q: q["chapter"])


async def digit(pg, option_id):
    idx = await pg.evaluate(
        f"() => {OVER}.pendingChoice ? {OVER}.pendingChoice.options.findIndex((o) => o.id === '{option_id}') : -2"
    )
    assert idx >= 0, f"pending choice does not offer {option_id}"
    await pg.keyboard.press(str(idx + 1))
    await pg.wait_for_timeout(120)


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
        # 区域门槛（拦截分支）：没有裂隙研究院声望时，走到裂隙核心不算抵达，并给出提示
        await pg.evaluate(f"() => {{ const p = {OVER}.places.find((x) => x.id === 'core_chamber'); "
                          f"{OVER}.tileX = p.x; {OVER}.tileY = p.y; {OVER}.session.player.tileX = p.x; {OVER}.session.player.tileY = p.y; "
                          f"{OVER}.checkArrivals(); }}")
        blocked = not await pg.evaluate(f"() => {OVER}.session.visited.has('core_chamber')")
        toast = await pg.evaluate(f"() => {OVER}.toast.text")
        print("gate blocks core_chamber without reputation:", blocked, "| hint:", toast)
        assert blocked, "gate did not block core_chamber"
        # 提升声望到友好档位后再次走到，应当算抵达
        await pg.evaluate(f"() => {{ {OVER}.world.addReputation('rift_institute', 10); {OVER}.checkArrivals(); }}")
        allowed = await pg.evaluate(f"() => {OVER}.session.visited.has('core_chamber')")
        print("arrives after reaching friendly:", allowed)
        assert allowed, "arrival not allowed after friendly reputation"
        # 重新开始：为了之后的主线检查，回到干净的新游戏状态
        await pg.evaluate(f"() => {{ {OVER}.session.visited.delete('core_chamber'); {OVER}.world.addReputation('rift_institute', -10); }}")

        # 新游戏开始时主线第 1 章自动接取
        await pg.evaluate(f"() => {OVER}.quests.acceptAvailable((d) => d.type !== 'side')")

        for q in quests:
            ch = q["chapter"]
            for obj in q["objectives"]:
                t = obj["type"]
                if t == "kill":
                    amount = obj.get("count") or 1
                    await pg.evaluate(
                        f"() => {{ const done = {OVER}.quests.report({{ type: 'kill', target: '{obj['target']}', amount: {amount} }}); "
                        f"{OVER}.rewardLines(done); }}"
                    )
                elif t == "reach":
                    # 放到地点坐标上，由游戏内的抵达检测处理（区域门槛在这里生效）
                    await pg.evaluate(
                        f"() => {{ const p = {OVER}.places.find((x) => x.id === '{obj['target']}'); "
                        f"{OVER}.tileX = p.x; {OVER}.tileY = p.y; {OVER}.session.player.tileX = p.x; {OVER}.session.player.tileY = p.y; "
                        f"{OVER}.checkArrivals(); }}"
                    )
                    visited = await pg.evaluate(f"() => {OVER}.session.visited.has('{obj['target']}')")
                    assert visited, f"{q['id']}: could not reach {obj['target']}"
                elif t == "collect":
                    need = obj.get("count") or 1
                    await pg.evaluate(
                        f"() => {{ const held = {OVER}.world.getItemCount('{obj['target']}'); "
                        f"if (held < {need}) {OVER}.world.addItem('{obj['target']}', {need} - held); }}"
                    )
                    await pg.evaluate(f"() => {{ {OVER}.rewardLines([]); }}")
            await pg.wait_for_timeout(50)

            status = await pg.evaluate(f"() => {OVER}.session.world.questStatus('{q['id']}')")
            assert status == "completed", f"{q['id']} status is {status}"
            print(f"ch{ch:02d} {q['id']}: completed")

            # 关键抉择：章节完成后出现，按数字键选择
            if ch in CHOICES:
                pending = await pg.evaluate(f"() => !!{OVER}.pendingChoice")
                assert pending, f"ch{ch} key choice not pending"
                await digit(pg, CHOICES[ch])
                print(f"  key choice ch{ch}: {CHOICES[ch]}")

            # 接取下一章的主线任务（与游戏内抵达/交付时的行为一致）
            await pg.evaluate(f"() => {OVER}.quests.acceptAvailable((d) => d.type !== 'side')")
            await pg.evaluate(f"() => {{ {OVER}.refreshKeyChoice(); }}")

        visible = await pg.evaluate(f"() => {OVER}.endingPanel.visible")
        text = await pg.evaluate(f"() => {OVER}.endingPanel.text")
        print("ending panel:", visible, "|", text.split("\n")[0])
        assert visible and "【结局：" in text, "ending panel not shown after main_24"
        await pg.keyboard.press("e")
        await pg.wait_for_timeout(150)
        assert not await pg.evaluate(f"() => {OVER}.endingPanel.visible"), "ending panel did not close"
        print("errors:", errs[:5])
        assert not errs, "page errors"
        print("ALL OK")
        await b.close()


asyncio.run(main())

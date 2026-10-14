"""端到端：地表视野只显示视野内的敌人刷新点；HUD 显示视野格数。
运行前先启动开发服务器：npx vite --host 0.0.0.0 --port 5173
运行：python3 scripts/e2e/vision_e2e.py（在仓库根目录执行）"""
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
        await pg.wait_for_timeout(800)

        # 把角色移到一个刷新点附近，确认该刷新点的标记会显示
        near = await pg.evaluate(f"""() => {{ const s = {OVER};
            let first = null;
            for (const loaded of s.chunks.values()) for (const m of loaded.markers) {{ if (!first) first = m.spawn; }}
            if (!first) return null;
            s.tileX = first.tileX + 2; s.tileY = first.tileY; s.player.setPosition(s.tileX * 8, s.tileY * 8);
            return first.key; }}""")
        assert near is not None, "no spawn to test near"
        await pg.wait_for_timeout(400)
        near_visible = await pg.evaluate(f"""() => {{ const s = {OVER};
            for (const loaded of s.chunks.values()) for (const m of loaded.markers) {{
              if (m.spawn.key === '{near}') return m.objs.some((o) => o.visible);
            }}
            return false; }}""")
        print("marker near player visible:", near_visible)
        assert near_visible, "marker next to the player is not visible"

        stats = await pg.evaluate(f"""() => {{ const s = {OVER};
            let total = 0, visible = 0, wrong = 0;
            for (const loaded of s.chunks.values()) for (const m of loaded.markers) {{
              const d = Math.hypot(s.tileX - m.spawn.tileX, s.tileY - m.spawn.tileY);
              const expect = d <= s.sightTiles;
              for (const o of m.objs) {{ total++; if (o.visible) visible++; if (o.visible !== expect) wrong++; }}
            }}
            return {{ total, visible, wrong, sight: s.sightTiles, hud: s.hud.text }}; }}""")
        print("markers total:", stats["total"], "visible:", stats["visible"], "mismatch:", stats["wrong"])
        print("sight:", round(stats["sight"], 1), "| HUD:", stats["hud"].split("\n")[1])
        assert stats["total"] > 0, "no spawn markers loaded"
        assert stats["wrong"] == 0, "marker visibility does not follow sight radius"
        assert "视野" in stats["hud"], "HUD does not show sight"

        print("errors:", errs[:5])
        assert not errs, "page errors"
        print("ALL OK")
        await b.close()

asyncio.run(main())

"""Encounter fixture + learned fireball; all movement, attacks, damage and settlement use real input.
No position, HP, enemy AI or damage injection. Requires dev server and Playwright Chromium.
"""
import asyncio
from playwright.async_api import async_playwright
C="window.__game.scene.getScene('TestRoomScene')"
O="window.__game.scene.getScene('OverworldScene')"

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(args=['--no-sandbox'])
        page=await browser.new_page(viewport={'width':1280,'height':720})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.goto('http://localhost:5173/')
        await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
        await page.wait_for_timeout(400)
        await page.keyboard.press('Enter')
        await page.wait_for_function(f'{O}.scene.isActive()')
        await page.evaluate(f"""() => {{
            const s={O};s.session.player.skills.unlocked=['fireball'];s.session.player.skills.equipped=['fireball'];
            s.scene.start('TestRoomScene',{{encounter:{{enemyIds:['ash_wolf'],spawnKey:'e2e-engagement'}}}});
        }}""")
        await page.wait_for_function(f'{C}.scene.isActive()')
        await page.wait_for_function(f'{C}.openingLeftMs===0')
        await page.wait_for_function(f'{C}.enemies[0].x<665')
        assert await page.evaluate(f'{C}.px===420'), 'player moved without input'
        await page.keyboard.down('j')
        await page.wait_for_function(f'{C}.px>440')
        await page.keyboard.up('j')
        position=await page.evaluate(f'[ {C}.px, {C}.py ]')
        await page.wait_for_timeout(160)
        assert await page.evaluate(f'Math.abs({C}.px-{position[0]})<1 && Math.abs({C}.py-{position[1]})<1'), 'release did not stop pursuit'
        await page.keyboard.down('j');await page.keyboard.down('s')
        await page.wait_for_function(f'{C}.py>{position[1]}+12')
        await page.keyboard.up('j');await page.keyboard.up('s')
        await page.keyboard.press('Space')
        await page.wait_for_function(f'{C}.runtime.dodgeCooldownMs>0')
        await page.wait_for_function(f'{C}.dodgeLeftMs===0')
        hp=await page.evaluate(f'{C}.enemies[0].actor.hp')
        await page.keyboard.press('1')
        await page.wait_for_function(f"({C}.runtime.cooldowns.get('fireball')??0)>0")
        assert await page.evaluate(f'{C}.enemies[0].actor.hp<{hp}'), 'stationary skill assist failed'
        await page.keyboard.down('j')
        await page.wait_for_function(f'{C}.finished',timeout=20000)
        await page.keyboard.up('j')
        assert await page.evaluate(f'{C}.won'), 'basic encounter lost'
        gold=await page.evaluate(f'{C}.session.player.gold')
        await page.wait_for_timeout(200)
        assert await page.evaluate(f'{C}.session.player.gold==={gold}'), 'settlement repeated'
        await page.keyboard.press('Space')
        await page.wait_for_function(f'{O}.scene.isActive()')
        assert await page.evaluate(f"{O}.session.defeated.has('e2e-engagement')"), 'victory not retained'
        assert not errors,errors
        print('PASS: immediate enemy engagement, J approach/release, WASD override, dodge, skill auto-facing, real-input victory and settlement; no page errors')
        await browser.close()

asyncio.run(main())

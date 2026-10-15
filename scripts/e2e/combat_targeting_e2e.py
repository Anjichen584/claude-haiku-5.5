"""Targeting integration: real Tab/click inputs; crowd/anchor/death fixtures use game methods.
This is not a no-injection combat playthrough. Run with localhost:5173 and Playwright Chromium.
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
        await page.evaluate(f"{O}.scene.start('TestRoomScene',{{encounter:{{enemyIds:['ash_wolf','moss_golem','ash_crow'],spawnKey:'e2e-target-lock'}}}})")
        await page.wait_for_function(f'{C}.scene.isActive()')
        await page.wait_for_function(f"{C}.lockedTargetId==='enemy-0'")
        await page.keyboard.press('Tab')
        await page.wait_for_function(f"{C}.lockedTargetId==='enemy-1'")
        point=await page.evaluate(f"(() => {{ const b={C}.enemies[2].body.getBounds();return {{x:b.centerX,y:b.centerY}}; }})()")
        await page.mouse.click(point['x'],point['y'])
        await page.wait_for_function(f"{C}.lockedTargetId==='enemy-2'")
        await page.wait_for_timeout(250)
        assert await page.evaluate(f"{C}.lockedTargetId==='enemy-2' && {C}.targetLabel.text.includes('灰烬乌鸦')"), 'click lock not retained'
        # Isolate crowd correction from attacks. No reward or damage values are changed here.
        await page.evaluate(f"""() => {{
            const s={C};s.openingLeftMs=0;
            for(const e of s.enemies) {{ e.x=800;e.y=380;e.windup=0;e.brain.attackCooldownMs=100000; }}
            s.updateEnemies(16);
        }}""")
        assert await page.evaluate(f"""() => {{
            const es={C}.enemies;
            return es.every((a,i)=>es.every((b,j)=>j<=i || Math.hypot(a.x-b.x,a.y-b.y)>71.8));
        }}"""), 'crowd still piled up'
        anchor=await page.evaluate(f"""() => {{
            const s={C},a=s.enemies[0],b=s.enemies[1];
            a.x=600;a.y=350;a.windup=900;a.aimX=600;a.aimY=350;
            b.x=610;b.y=350;b.windup=0;
            s.updateEnemies(16);
            return [a.x,a.y,a.aimX,a.aimY];
        }}""")
        assert anchor==[600,350,600,350],anchor
        # Fixture death through the real damage callback must invalidate the lock.
        await page.evaluate(f"{C}.damageEnemy({C}.enemies[2],99999)")
        await page.wait_for_function(f"{C}.lockedTargetId!=='enemy-2' && {C}.lockedTargetId!==null")
        assert not await page.evaluate(f'{C}.enemies[2].body.input.enabled'), 'corpse still clickable'
        await page.keyboard.down('s')
        await page.wait_for_function(f'{C}.py===500')
        await page.keyboard.up('s')
        assert not errors,errors
        print('PASS: Tab and click lock, retained target, crowd correction, anchored windup, death retarget, noninteractive corpse, HUD-safe lower boundary; no page errors')
        await browser.close()

asyncio.run(main())

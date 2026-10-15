"""Result UI fixture test: inject item changes and kill through game callback; real keys/clicks.
Requires localhost:5173, Playwright Chromium. Does not claim a no-injection fight.
"""
import asyncio
import os
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
        await page.evaluate(f"{O}.scene.start('TestRoomScene',{{encounter:{{enemyIds:['ash_wolf'],spawnKey:'e2e-results'}}}})")
        await page.wait_for_function(f'{C}.scene.isActive()')
        await page.keyboard.down('Space')
        await page.evaluate(f"""async () => {{
            const s={C};
            window.__originalSetItem=Storage.prototype.setItem;
            Storage.prototype.setItem=()=>{{throw new DOMException('full','QuotaExceededError');}};
            const data=await import('/src/data/loader.ts');
            for(const item of data.loadGameData().items.slice(0,18))s.session.world.addItem(item.id,2);
            s.damageEnemy(s.enemies[0],s.enemies[0].actor.hp);s.checkEncounterEnd();
        }}""")
        await page.wait_for_function(f'{C}.finished && {C}.resultView!==null')
        await page.wait_for_timeout(700)
        assert await page.evaluate(f"{C}.scene.isActive() && !{C}.resultInputGate.ready && {C}.resultView.status.text.includes('保存失败')"), 'held dodge skipped result or missing save error'
        state=await page.evaluate(f'[{C}.session.player.exp,{C}.session.player.gold]')
        first=await page.evaluate(f'{C}.resultView.details.text')
        await page.keyboard.press('n')
        await page.wait_for_function(f'{C}.resultView.details.text!=='+repr(first))
        await page.mouse.click(320,548)
        await page.wait_for_function(f'{C}.resultView.details.text==='+repr(first))
        assert await page.evaluate(f'{C}.resultView.details.getBounds().bottom<492'), 'result details overlap save status'
        await page.keyboard.press('r')
        await page.evaluate('() => {Storage.prototype.setItem=window.__originalSetItem;}')
        await page.keyboard.press('r')
        await page.wait_for_function(f"{C}.resultView.status.text.includes('已保存')")
        assert await page.evaluate(f'[{C}.session.player.exp,{C}.session.player.gold]')==state,'retry duplicated rewards'
        if os.environ.get('RESULT_SCREENSHOT'):
            await page.screenshot(path=os.environ['RESULT_SCREENSHOT'])
        await page.keyboard.up('Space')
        await page.wait_for_function(f'{C}.resultInputGate.ready')
        await page.mouse.click(780,603)
        await page.wait_for_function(f'{O}.scene.isActive()')
        assert await page.evaluate(f"{O}.session.defeated.has('e2e-results')"),'return lost victory'
        await page.reload()
        await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
        await page.wait_for_timeout(400)
        await page.keyboard.press('s');await page.keyboard.press('Enter')
        await page.wait_for_function(f'{O}.scene.isActive()')
        assert await page.evaluate(f'[{O}.session.player.exp,{O}.session.player.gold]')==state
        assert not errors,errors
        print('PASS: bounded paginated results, held-Space guard, save failure/retry feedback, no duplicate rewards, click return and reload; no page errors')
        await browser.close()

asyncio.run(main())

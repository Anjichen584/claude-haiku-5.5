"""Real quest-panel tracking and reload; fixture accepts one available side quest."""
import asyncio
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(args=['--no-sandbox'])
        page=await browser.new_page(viewport={'width':1280,'height':720});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.goto('http://localhost:5173/')
        await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
        await page.wait_for_timeout(400);await page.keyboard.press('Enter')
        await page.wait_for_function(f'{O}.scene.isActive()')
        target=await page.evaluate(f"""() => {{const s={O};
            const q=s.questDefs.filter(q=>q.type==='side'&&s.world.questStatus(q.id)==='available').sort((a,b)=>a.id.localeCompare(b.id))[0];
            s.quests.accept(q.id);return {{id:q.id,title:q.title}};}}""")
        await page.keyboard.press('q')
        await page.wait_for_function(f'{O}.questPanelOpen')
        await page.keyboard.press('2')
        await page.wait_for_function(f"{O}.session.trackedQuestId==='{target['id']}'")
        await page.keyboard.press('Escape')
        await page.wait_for_function(f'{O}.tracker.text.includes('+repr(target['title'])+')')
        await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
        await page.wait_for_timeout(400);await page.keyboard.press('s');await page.keyboard.press('Enter')
        await page.wait_for_function(f'{O}.scene.isActive()')
        assert await page.evaluate(f"{O}.session.trackedQuestId==='{target['id']}'"), 'tracking lost on reload'
        await page.keyboard.press('q');await page.wait_for_function(f'{O}.questPanelOpen')
        await page.mouse.click(600,280)
        await page.wait_for_function(f"{O}.session.trackedQuestId==='main_01_first_rift'")
        assert not errors,errors
        print('PASS: Q panel, numeric side selection, tracker update, save/reload, click main tracking; no page errors')
        await browser.close()
asyncio.run(main())

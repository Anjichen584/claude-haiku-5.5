"""NPC fixture teleport only; acceptance, tracking, dialogue, saves and retries use real inputs.
Run with localhost:5173 and Playwright Chromium. Not a no-teleport exploration playthrough.
"""
import asyncio
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"

async def continue_save(page):
    await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
    await page.wait_for_timeout(400);await page.keyboard.press('s');await page.keyboard.press('Enter')
    await page.wait_for_function(f'{O}.scene.isActive()')

async def finish_dialogue(page):
    for _ in range(40):
        if not await page.evaluate(f'!!{O}.talk'):return
        choices=await page.evaluate(f'{O}.talk.runner.choices().length')
        await page.keyboard.press('1' if choices else 'Space')
        await page.wait_for_timeout(100)
    raise AssertionError('dialogue did not end')

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(args=['--no-sandbox'])
        page=await browser.new_page(viewport={'width':1280,'height':720});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.goto('http://localhost:5173/')
        await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
        await page.wait_for_timeout(400);await page.keyboard.press('Enter')
        await page.wait_for_function(f'{O}.scene.isActive()')
        await page.evaluate(f"""() => {{const s={O},n=s.npcTile('ashguard_captain');
            s.tileX=n.x;s.tileY=n.y;s.player.setPosition(n.x*16,n.y*16);s.syncChunks();s.graceMs=100000;}}""")
        await page.wait_for_function(f"{O}.npcQuestMarkers.get('ashguard_captain').text==='!' && {O}.npcQuestMarkers.get('ashguard_captain').visible")
        await page.keyboard.press('e')
        await page.wait_for_function(f"{O}.world.questStatus('side_01_lost_map')==='active'")
        await continue_save(page)
        assert await page.evaluate(f"{O}.world.questStatus('side_01_lost_map')==='active'"),'NPC acceptance not autosaved'
        await page.wait_for_function(f"{O}.npcQuestMarkers.get('ashguard_captain').text==='?'")
        await page.keyboard.press('q');await page.wait_for_function(f'{O}.questPanelOpen')
        await page.keyboard.press('2');await page.wait_for_function(f"{O}.session.trackedQuestId==='side_01_lost_map'")
        await page.keyboard.press('v');await page.wait_for_function(f'{O}.questDetails')
        assert await page.evaluate(f"{O}.cards.root.list.some(x=>x.text?.includes('把地图交给守望队长'))"),'missing full objective details'
        await page.keyboard.press('v');await page.wait_for_function(f'!{O}.questDetails')
        await page.keyboard.press('Escape')
        await page.wait_for_function(f"{O}.tracker.text.includes('守望队长') && {O}.contextHint.text.includes('交付任务')")
        assert await page.evaluate(f'{O}.tracker.getBounds().bottom<472'),'tracker overflow'
        await page.evaluate("() => {window.__originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('full','QuotaExceededError');};}")
        await page.keyboard.press('e');await page.wait_for_function(f'!!{O}.talk')
        await finish_dialogue(page)
        await page.wait_for_function(f"{O}.world.questStatus('side_01_lost_map')==='completed'")
        assert await page.evaluate(f'{O}.saveWarning.visible'),'missing delivery save failure'
        assert await page.evaluate(f"{O}.session.trackedQuestId!=='side_01_lost_map'"),'finished quest still tracked'
        gold=await page.evaluate(f'{O}.session.player.gold')
        await page.evaluate('() => {Storage.prototype.setItem=window.__originalSetItem;}')
        await page.keyboard.press('k');await page.wait_for_function(f'!{O}.saveWarning.visible')
        assert await page.evaluate(f'{O}.session.player.gold')==gold,'save retry duplicated quest rewards'
        await continue_save(page)
        assert await page.evaluate(f"{O}.world.questStatus('side_01_lost_map')==='completed' && {O}.session.trackedQuestId!=='side_01_lost_map'")
        assert await page.evaluate(f'{O}.session.player.gold')==gold
        await page.keyboard.press('e');await page.wait_for_function(f'!!{O}.talk')
        await finish_dialogue(page)
        assert await page.evaluate(f'{O}.session.player.gold')==gold,'repeat dialogue duplicated rewards'
        assert not errors,errors
        print('PASS: NPC !/? states, real E acceptance autosave, Q side tracking/details, real NPC direction, delivery failure warning/retry, completed tracking fallback, reload and no repeated rewards; no page errors')
        await browser.close()
asyncio.run(main())

"""Chapter-three HUD regression using quest-state/event fixtures, not a walking playthrough."""
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
        await page.evaluate(f"""() => {{const s={O};
          s.world.setQuest('main_01_first_rift',{{status:'completed',progress:[5]}});
          s.world.setQuest('main_02_ash_road',{{status:'completed',progress:[1,3]}});
          s.world.setQuest('main_03',{{status:'active',progress:[0,0]}});
          s.session.trackedQuestId='main_03';
        }}""")
        assert await page.evaluate(f"[...{O}.chunks.values()].flatMap(c=>c.spawns).every(s=>!s.enemyIds.includes('frost_wolf'))"),'fixture requires no nearby frost wolves'
        await page.wait_for_function(f"{O}.tracker.text.includes('先探索：雪门')&&{O}.tracker.text.includes('击杀目标仍需另寻')")
        assert await page.evaluate(f"JSON.stringify({O}.world.getQuest('main_03').progress)")=='[0,0]','guidance changed progress'
        assert await page.evaluate(f'{O}.tracker.getBounds().bottom<472'),'tracker overflow'
        await page.evaluate(f"{O}.quests.report({{type:'reach',target:'snow_gate'}})")
        await page.wait_for_function(f"!{O}.tracker.text.includes('先探索：雪门')")
        assert await page.evaluate(f"{O}.world.questStatus('main_03')==='active'"),'arrival bypassed required kills'
        assert await page.evaluate(f"JSON.stringify({O}.world.getQuest('main_03').progress)")=='[0,1]'
        assert not errors,errors
        print('PASS: chapter-three exploration waypoint HUD, honest kill hint, unchanged progress, no stale reached waypoint; quest fixtures, not real walking')
        await browser.close()
asyncio.run(main())

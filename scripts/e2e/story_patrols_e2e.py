"""Story patrol lifecycle with position/quest fixtures. Not a walking playthrough."""
import asyncio
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
C="window.__game.scene.getScene('TestRoomScene')"

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(args=['--no-sandbox'])
        page=await browser.new_page(viewport={'width':1280,'height':720});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.goto('http://localhost:5173/')
        await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
        await page.wait_for_timeout(400);await page.keyboard.press('Enter')
        await page.wait_for_function(f'{O}.scene.isActive()')
        await page.evaluate(f"""() => {{const s={O},p=s.snowPatrols[0];
            s.tileX=p.tileX;s.tileY=p.tileY;s.player.setPosition(p.tileX*16,p.tileY*16);s.syncChunks();s.graceMs=0;
            // Isolate story gating from unrelated natural encounters in this lifecycle fixture.
            for(const c of s.chunks.values())c.spawns=c.spawns.filter(p=>p.requiredQuest);
        }}""")
        await page.wait_for_timeout(600)
        assert await page.evaluate(f'{O}.scene.isActive()'),'pre-quest patrol entered combat'
        markers=f"{O}.surface.targets().filter(e=>e.spawn.key==='snow-gate-patrol-0')"
        assert await page.evaluate(f'{markers}.length===0'),'pre-quest marker visible'
        await page.evaluate(f"() => {{{O}.graceMs=100000;{O}.session.trackedQuestId='main_03';{O}.world.setQuest('main_03',{{status:'active',progress:[0,0]}});}}")
        await page.wait_for_function(f'{markers}.length===2')
        await page.wait_for_function(f"{O}.tracker.text.includes('剧情巡逻队')")
        await page.evaluate(f"() => {{{O}.world.setQuest('main_03',{{status:'completed',progress:[6,1]}});{O}.graceMs=0;}}")
        await page.wait_for_function(f'{markers}.length===0')
        await page.wait_for_timeout(400)
        assert await page.evaluate(f'{O}.scene.isActive()'),'completed patrol entered combat'
        await page.evaluate(f"{O}.world.setQuest('main_03',{{status:'active',progress:[0,0]}})")
        await page.wait_for_function(f'{O}.surface.engaged')
        assert await page.evaluate(f"{O}.scene.isActive() && {markers}.some(e=>e.engaged)")
        assert not errors,errors
        print('PASS: already-loaded patrols hidden/non-hostile before quest, activate without chunk reload, hide after completion, active patrol fights without scene transition; explicit lifecycle fixtures')
        await browser.close()
asyncio.run(main())

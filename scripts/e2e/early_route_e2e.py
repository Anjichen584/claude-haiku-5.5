"""Real-input early route: no teleport, HP/items/stats/quest-event injection.
Reads positions to drive WASD, uses J/H/Space, visits the camp and completes a dialogue side quest.
Requires production preview on localhost:5173. This is an early-route check, not an hour-long playthrough.
"""
import asyncio
import sys
import time
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
C="window.__game.scene.getScene('TestRoomScene')"

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(args=['--no-sandbox'])
        page=await browser.new_page(viewport={'width':1280,'height':720});errors=[];battles=0;held=set();started=time.monotonic();budget=900 if '--snow' in sys.argv else 300
        page.on('pageerror',lambda e:errors.append(str(e)))
        async def movement(keys):
            nonlocal held
            for k in held-keys:await page.keyboard.up(k)
            for k in keys-held:await page.keyboard.down(k)
            held=set(keys)
        async def battle():
            nonlocal battles
            await movement(set());battles+=1
            await page.keyboard.down('j')
            while not await page.evaluate(f'{C}.finished'):
                if time.monotonic()-started>budget:raise AssertionError(f'early route exceeded {budget} seconds')
                status=await page.evaluate(f"""() => {{const s={C};return {{hp:s.playerActor.hp,
                    potionReady:Date.now()>=(s.session.player.consumableReadyAt??0),
                    dodge:s.runtime.dodgeCooldownMs===0&&s.runtime.stamina>=24,
                    danger:s.enemies.some(e=>e.alive&&e.windup>0&&Math.hypot(s.px-e.aimX,s.py-e.aimY)<e.tactics.hitRadius)}};}}""")
                if status['hp']<55 and status['potionReady']:await page.keyboard.press('h')
                if status['dodge'] and status['danger']:await page.keyboard.press('Space')
                await page.wait_for_timeout(100)
            await page.keyboard.up('j')
            assert await page.evaluate(f'{C}.won'),f'player lost encounter {battles}'
            await page.wait_for_function(f'{C}.resultInputGate.ready')
            await page.keyboard.press('Space');await page.wait_for_function(f'{O}.scene.isActive()')
            resources=await page.evaluate(f"[ {O}.session.player.hp,{O}.world.getItemCount('health_potion') ]")
            print(f'encounter {battles}: hp={resources[0]}, health potions={resources[1]}',flush=True)
        async def walk(x,y):
            while True:
                if time.monotonic()-started>budget:raise AssertionError('walk timeout')
                state=await page.evaluate(f"""() => ({{combat:{C}.scene.isActive(),x:{O}.tileX,y:{O}.tileY}})""")
                if state['combat']:await battle();continue
                dx=x-state['x'];dy=y-state['y']
                if (dx*dx+dy*dy)**.5<1.1:await movement(set());return
                keys=set()
                if abs(dx)>.45:keys.add('d' if dx>0 else 'a')
                if abs(dy)>.45:keys.add('s' if dy>0 else 'w')
                await movement(keys)
                await page.wait_for_timeout(60)
        await page.goto('http://localhost:5173/')
        await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
        await page.wait_for_timeout(400);await page.keyboard.press('Enter')
        await page.wait_for_function(f'{O}.scene.isActive()')
        for pack in range(3):
            point=await page.evaluate(f"""() => {{const s={O};return [...s.chunks.values()].flatMap(c=>c.spawns).find(x=>x.key==='camp-wolves-{pack}')??null;}}""")
            assert point,f'starter encounter {pack} missing'
            await walk(point['tileX'],point['tileY'])
            if not await page.evaluate(f"{O}.session.defeated.has('camp-wolves-{pack}')"):
                await page.wait_for_function(f'{C}.scene.isActive()')
                await battle()
            print(f'starter pack {pack}: defeated',flush=True)
        assert await page.evaluate(f"{O}.world.questStatus('main_01_first_rift')==='completed'")
        camp=await page.evaluate(f"{O}.places.find(p=>p.id==='ash_road_camp')")
        await walk(camp['x']-4,camp['y'])
        assert await page.evaluate(f"{O}.tracker.text.includes('营地中心')&&{O}.tracker.text.includes('首次补给')&&!{O}.tracker.text.includes('可能掉落')"),'approach lost the guaranteed-supplies guidance'
        assert await page.evaluate(f"{O}.world.questStatus('main_02_ash_road')==='active'"),'supplies claimed too far from center'
        await walk(camp['x'],camp['y'])
        await page.wait_for_function(f"{O}.world.questStatus('main_02_ash_road')==='completed'")
        assert await page.evaluate(f"{O}.world.getItemCount('rift_shard')>=3")
        captain=await page.evaluate(f"{O}.npcTile('ashguard_captain')")
        await walk(captain['x'],captain['y'])
        await page.keyboard.press('e');await page.wait_for_function(f"{O}.world.questStatus('side_01_lost_map')==='active'")
        await page.keyboard.press('q');await page.wait_for_function(f'{O}.questPanelOpen')
        await page.keyboard.press('2');await page.wait_for_function(f"{O}.session.trackedQuestId==='side_01_lost_map'")
        await page.keyboard.press('Escape');await page.keyboard.press('e')
        await page.wait_for_function(f'!!{O}.talk')
        for _ in range(40):
            if not await page.evaluate(f'!!{O}.talk'):break
            count=await page.evaluate(f'{O}.talk.runner.choices().length')
            await page.keyboard.press('1' if count else 'Space');await page.wait_for_timeout(100)
        assert await page.evaluate(f"{O}.world.questStatus('side_01_lost_map')==='completed'")
        state=await page.evaluate(f"[ {O}.session.player.gold,{O}.world.getItemCount('rift_shard'),{O}.world.getItemCount('health_potion') ]")
        await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
        await page.wait_for_timeout(400);await page.keyboard.press('s');await page.keyboard.press('Enter')
        await page.wait_for_function(f'{O}.scene.isActive()')
        assert await page.evaluate(f"[ {O}.session.player.gold,{O}.world.getItemCount('rift_shard'),{O}.world.getItemCount('health_potion') ]")==state,'reload changed settled rewards/supplies'
        reputation=await page.evaluate(f"{O}.world.getReputation('ashguard')")
        for _ in range(3):
            await page.keyboard.press('e');await page.wait_for_function(f'!!{O}.talk')
            choices=await page.evaluate(f'{O}.talk.runner.choices()')
            assert not any(c['text']=='我需要帮助。' for c in choices),'first-help reward remained available'
            pick=next(i+1 for i,c in enumerate(choices) if c['text']=='我想确认一下接下来的路。')
            await page.keyboard.press(str(pick));await page.keyboard.press('Space')
            await page.wait_for_function(f'!{O}.talk')
            assert await page.evaluate(f"{O}.world.getReputation('ashguard')")==reputation,'revisit changed reputation'
        if '--snow' in sys.argv:
            print('starting real-input chapter-three route',flush=True)
            patrols=await page.evaluate(f'{O}.snowPatrols')
            # Known fixed patrol positions are read, never injected. Travel and combat remain real inputs.
            for patrol in reversed(patrols):
                if await page.evaluate(f"{O}.world.questStatus('main_03')==='completed'"):break
                await walk(patrol['tileX'],patrol['tileY'])
                if not await page.evaluate(f"{O}.session.defeated.has('{patrol['key']}')"):
                    await page.wait_for_function(f'{C}.scene.isActive()');await battle()
                print('patrol defeated:',patrol['key'],flush=True)
            gate=await page.evaluate(f"{O}.places.find(p=>p.id==='snow_gate')")
            await walk(gate['x'],gate['y'])
            await page.wait_for_function(f"{O}.world.questStatus('main_03')==='completed'")
            assert await page.evaluate(f"{O}.world.getQuest('main_03').progress[0]===6")
            print('chapter three complete; real encounters:',battles,flush=True)
            snapshot=await page.evaluate(f"[...{O}.session.defeated]")
            await page.keyboard.press('k');await page.reload()
            await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
            await page.wait_for_timeout(400);await page.keyboard.press('s');await page.keyboard.press('Enter')
            await page.wait_for_function(f'{O}.scene.isActive()')
            assert await page.evaluate(f"{O}.world.questStatus('main_03')==='completed'")
            assert sorted(await page.evaluate(f"[...{O}.session.defeated]"))==sorted(snapshot)
            print('PASS: real WASD from camp to snow gate, real frost-wolf fights, chapter three and reload',flush=True)
        assert not errors,errors
        print(f'PASS: real WASD route, {battles} real encounters, chapters 1–{3 if "--snow" in sys.argv else 2}, camp supplies, Q side tracking, captain dialogue/reload and three neutral revisits; {time.monotonic()-started:.1f}s; no page errors')
        await browser.close()
asyncio.run(main())

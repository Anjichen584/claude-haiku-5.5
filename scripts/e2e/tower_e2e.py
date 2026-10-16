"""Production tower loop. Gear/skills/potions are explicit fixtures, combat uses real input.
No enemy HP mutation or direct damage/reward/finish callback calls.
"""
import asyncio, os, json, time
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
T="window.__game.scene.getScene('TowerScene')"
B="window.__game.scene.getScene('TestRoomScene')"
KEY='rift-chronicles-save-v1'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1280,'height':720})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('GAME_URL','http://localhost:5173/'))
  await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  await page.evaluate(f"""()=>{{const s={O};
   s.session.player.equipment={{main_hand:'ash_sword',head:'ash_helm',chest:'ash_plate',feet:'ash_boots',hands:'ash_gloves',neck:'ash_amulet'}};
   s.session.player.skills.unlocked=['fireball','mana_shield','trap_set'];
   s.session.player.skills.equipped=['fireball','mana_shield','trap_set'];
   s.session.world.addItem('health_potion',20);s.session.world.addItem('mana_potion',10);
  }}""")
  await page.keyboard.press('y');await page.wait_for_function(f'{T}.scene.isActive()')
  assert await page.evaluate(f'{T}.session.tower.best')==0
  await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
  # Reload a live fight: it must restore the same unclaimed floor, not partial kills.
  await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.keyboard.press('s');await page.keyboard.press('Enter')
  await page.wait_for_function(f'{T}.scene.isActive()')
  assert await page.evaluate(f'{T}.session.tower.run.cleared')==0
  start_gold=await page.evaluate(f'{T}.session.player.gold')
  start_exp=await page.evaluate(f'{T}.session.player.exp')
  baseline=await page.evaluate(f'JSON.stringify({T}.session.world.snapshot().quests)')
  for floor in range(1,6):
   print(f'starting floor {floor}',flush=True)
   await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
   assert await page.evaluate(f'{B}.encounter.tower.floor')==floor
   start=time.monotonic();await page.keyboard.down('j')
   while not await page.evaluate(f'{B}.finished'):
    if time.monotonic()-start>80:raise AssertionError(f'floor {floor} exceeded budget')
    hp=await page.evaluate(f'{B}.playerActor.hp')
    if hp<100:await page.keyboard.press('h')
    await page.keyboard.press('1');await page.keyboard.press('2')
    await page.wait_for_timeout(150)
   await page.keyboard.up('j')
   assert await page.evaluate(f'{B}.won'),f'geared fixture defeated on floor {floor}'
   assert await page.evaluate(f'{B}.session.player.gold')==start_gold
   assert await page.evaluate(f'{B}.session.player.exp')==start_exp
   assert await page.evaluate(f'JSON.stringify({B}.session.world.snapshot().quests)')==baseline
   await page.wait_for_function(f'{B}.resultInputGate.ready')
   await page.keyboard.press('Space');await page.wait_for_function(f'{T}.scene.isActive()')
   assert await page.evaluate(f'{T}.session.tower.run.cleared')==floor
   assert await page.evaluate(f'{T}.session.tower.run.phase')=='boon'
   if floor==1:
    await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
    await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{T}.scene.isActive()')
    assert await page.evaluate(f'{T}.session.tower.run.phase')=='boon'
   if floor<5:
    await page.keyboard.press('1')
    await page.wait_for_function(f"{T}.session.tower.run.phase==='ready'")
  await page.keyboard.press('l');await page.wait_for_function(f'{O}.scene.isActive()')
  assert await page.evaluate(f'{O}.session.tower.run') is None
  assert await page.evaluate(f'{O}.session.tower.best')==5
  assert await page.evaluate(f'{O}.session.player.gold')==start_gold+240
  assert await page.evaluate(f'{O}.session.player.exp')==start_exp+450
  assert await page.evaluate(f"{O}.session.world.getItemCount('rift_shard')")==2
  saved=json.loads(await page.evaluate(f"localStorage.getItem('{KEY}')"));assert saved['tower']['run'] is None
  await page.keyboard.press('y');await page.wait_for_function(f'{T}.scene.isActive()')
  assert await page.evaluate(f'{T}.session.player.gold')==start_gold+240
  assert not errors,errors
  if os.environ.get('TOWER_SCREENSHOT'):await page.screenshot(path=os.environ['TOWER_SCREENSHOT'])
  print(json.dumps({'tower':'passed','real_input_floors':5,'midfight_reload':True,'boon_reload':True,'no_kill_rewards_or_quests':True,'cashout_once':True,'errors':errors}))
  await browser.close()
asyncio.run(main())

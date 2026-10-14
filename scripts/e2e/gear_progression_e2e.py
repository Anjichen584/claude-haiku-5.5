"""Real keyboard/pointer UI checks with explicit fixture gold, equipment inventory,
encounter selection and enemy health/positions. Not a no-injection campaign run."""
import asyncio
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
C="window.__game.scene.getScene('TestRoomScene')"
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(args=['--no-sandbox']);pg=await b.new_page(viewport={'width':1280,'height':720});errors=[]
  pg.on('pageerror',lambda e:errors.append(str(e)))
  await pg.goto('http://localhost:5173');await pg.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await pg.keyboard.press('Enter');await pg.wait_for_function(f'{O}.scene.isActive()')
  assert await pg.evaluate(f"{O}.world.getItemCount('health_potion')===2 && {O}.world.getItemCount('mana_potion')===1")
  await pg.evaluate(f'{O}.session.player.gold=5000;{O}.session.player.hp=20;{O}.session.player.mana=0;{O}.tileX=4;{O}.tileY=4;')
  await pg.keyboard.press('e');await pg.wait_for_function(f'{O}.shop.visible')
  idx=await pg.evaluate(f"{O}.shop.stock.findIndex(i=>i.id==='health_potion')")
  for page in range(idx//6):
   await pg.keyboard.press('n');await pg.wait_for_function(f'{O}.shop.page==={page+1}')
  await pg.screenshot(path='/home/user/review-shots/merchant-paginated.png')
  await pg.mouse.click(220+(idx%2)*430+200,262+((idx%6)//2)*98+42);await pg.wait_for_function(f"{O}.world.getItemCount('health_potion')===3")
  assert await pg.evaluate(f'{O}.session.player.gold')==4982
  await pg.keyboard.press('v');await pg.wait_for_function(f"{O}.shop.mode==='sell'")
  await pg.keyboard.press('1');await pg.wait_for_function(f"{O}.world.getItemCount('health_potion')===2")
  assert await pg.evaluate(f'{O}.session.player.gold')==4988
  await pg.keyboard.press('e');await pg.wait_for_function(f'!{O}.shop.visible')
  await pg.keyboard.press('h');await pg.wait_for_function(f'{O}.session.player.hp===70')
  ready=await pg.evaluate(f'{O}.session.player.consumableReadyAt')
  await pg.keyboard.press('m');await pg.wait_for_timeout(200)
  assert await pg.evaluate(f"{O}.world.getItemCount('mana_potion')") == 1
  await pg.reload();await pg.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await pg.keyboard.press('s');await pg.keyboard.press('Enter');await pg.wait_for_function(f'{O}.scene.isActive()')
  assert await pg.evaluate(f'{O}.session.player.hp')==70
  assert await pg.evaluate(f'{O}.session.player.consumableReadyAt')==ready
  assert await pg.evaluate(f"{O}.world.getItemCount('health_potion')")==1
  # All 18 set pieces injected, but equip them through the actual six-slot key UI.
  await pg.evaluate(f"{O}.itemDefs.filter(i=>i.setId).forEach(i=>{O}.world.addItem(i.id,1))")
  await pg.keyboard.press('c');await pg.wait_for_function(f'{O}.equipPanelOpen')
  for key in '1234564':
   await pg.keyboard.press(key);await pg.wait_for_timeout(160)
  assert await pg.evaluate(f"Object.values({O}.session.player.equipment).every(id=>{O}.itemDefs.find(i=>i.id===id)?.setId==='ash_warden')")
  assert await pg.evaluate(f'Object.keys({O}.session.player.equipment).length')==6
  await pg.screenshot(path='/home/user/review-shots/six-piece-equipment.png')
  await pg.keyboard.press('c');await pg.keyboard.press('i');await pg.wait_for_function(f'{O}.invPanelOpen')
  # Reach an inventory item on a later page and equip exactly that item by clicking.
  for _ in range(5):
   idx=await pg.evaluate(f"{O}.inventoryPageItems().findIndex(i=>i.id==='wild_amulet')")
   if idx>=0:break
   await pg.keyboard.press('n');await pg.wait_for_timeout(180)
  assert idx>=0
  await pg.mouse.click(306+(idx%2)*340+140,252+(idx//2)*96+42)
  await pg.wait_for_function(f"{O}.session.player.equipment.neck==='wild_amulet'",timeout=3000)
  await pg.screenshot(path='/home/user/review-shots/inventory-paginated.png')
  await pg.keyboard.press('Escape');await pg.wait_for_function(f'!{O}.anyPanel()')
  # Real combat potion button and real attack/settlement. Isolate by postponing enemy attack.
  await pg.evaluate(f"{O}.session.player.hp=10;{O}.session.player.mana=0;{O}.session.player.consumableReadyAt=0;{O}.scene.start('TestRoomScene',{{encounter:{{enemyIds:['ash_wolf'],spawnKey:'e2e-gear'}}}})")
  await pg.wait_for_function(f'{C}.scene.isActive()')
  await pg.evaluate(f'{C}.enemies[0].brain.attackCooldownMs=999999')
  await pg.mouse.click(970,531);await pg.wait_for_function(f'{C}.playerActor.hp>=60')
  assert await pg.evaluate(f"{C}.session.world.getItemCount('health_potion')")==0
  await pg.keyboard.press('m');await pg.wait_for_timeout(150)
  assert await pg.evaluate(f"{C}.session.world.getItemCount('mana_potion')")==1
  await pg.screenshot(path='/home/user/review-shots/combat-potions.png')
  # Wait actual shared cooldown, then M must really consume and restore mana.
  await pg.wait_for_function(f'{C}.session.player.consumableReadyAt<=Date.now()')
  before=await pg.evaluate(f'{C}.runtime.mana')
  await pg.keyboard.press('m');await pg.wait_for_function(f"{C}.session.world.getItemCount('mana_potion')===0")
  assert await pg.evaluate(f'{C}.runtime.mana')>before
  await pg.evaluate(f"const s={C},e=s.enemies[0];e.actor.hp=1;e.x=s.px+35;e.y=s.py;s.facing={{x:1,y:0}}")
  await pg.keyboard.down('j');await pg.wait_for_function(f'{C}.finished');await pg.keyboard.up('j')
  assert await pg.evaluate(f'{C}.runtime.profile.bonuses.maxHp')>=40
  inventory=await pg.evaluate(f'{C}.session.world.snapshot().inventory')
  # Potion consumption and six-slot gear persist when reloading victory immediately.
  await pg.reload();await pg.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await pg.keyboard.press('s');await pg.keyboard.press('Enter');await pg.wait_for_function(f'{O}.scene.isActive()')
  assert await pg.evaluate(f'Object.keys({O}.session.player.equipment).length')==6
  assert await pg.evaluate(f"{O}.session.player.equipment.neck==='wild_amulet'")
  assert await pg.evaluate(f"{O}.session.defeated.has('e2e-gear')")
  assert await pg.evaluate(f'{O}.world.snapshot().inventory')==inventory
  await pg.evaluate(f"{O}.scene.start('DungeonScene')");await pg.wait_for_function("window.__game.scene.isActive('DungeonScene')")
  D="window.__game.scene.getScene('DungeonScene')"
  await pg.evaluate(f"{D}.session.player.hp=10;{D}.session.player.consumableReadyAt=0;{D}.session.world.addItem('health_potion',1)")
  before=await pg.evaluate(f"{D}.session.world.getItemCount('health_potion')")
  await pg.keyboard.press('h');await pg.wait_for_function(f'{D}.session.player.hp>=60')
  assert await pg.evaluate(f"{D}.session.world.getItemCount('health_potion')")==before-1
  assert not errors,errors
  print('PASS: paginated shop buy/resell, starter supplies, health/mana shared cooldown+reload, six-piece equipment via real keys, paginated inventory pointer-equip, combat potion pointer/key use, settled gear/save reload; no page errors')
  await b.close()
asyncio.run(main())

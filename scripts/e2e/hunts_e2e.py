"""Optional hunt browser regression. Explicit quest/position/gear/learned-skill fixtures.
Combat uses real J/1/2/3/H input; no enemy HP, damage or reward callback injection.
"""
import asyncio, os, time
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(args=['--no-sandbox']);page=await b.new_page(viewport={'width':1280,'height':720});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('GAME_URL','http://localhost:5173/'))
  await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  await page.evaluate(f"""() => {{const s={O},h=s.hunts[0];
   s.world.setQuest('main_01_first_rift',{{status:'completed',progress:[5]}});
   s.world.setQuest('main_02_ash_road',{{status:'completed',progress:[1,3]}});
   s.session.player.equipment={{main_hand:'ash_sword',head:'ash_helm',chest:'ash_plate',feet:'ash_boots',hands:'ash_gloves',neck:'ash_amulet'}};
   s.session.player.skills.unlocked=['fireball','mana_shield','trap_set'];s.session.player.skills.equipped=['fireball','mana_shield','trap_set'];
   s.world.addItem('health_potion',10);
   s.tileX=h.tileX;s.tileY=h.tileY;s.player.setPosition(h.tileX*16,h.tileY*16);s.syncChunks();
   for(const c of s.chunks.values())c.spawns=c.spawns.filter(p=>!!p.hunt);
  }}""")
  await page.wait_for_function(f"{O}.huntHud.visible && {O}.huntHud.text.includes('接受挑战')")
  assert await page.evaluate(f"!{O}.surface.targets().some(e=>e.spawn.key==='hunt:ash-drake')"),'hunt auto-started'
  assert await page.evaluate(f'{O}.huntHud.getBounds().left>=450 && {O}.huntHud.getBounds().right<=950 && {O}.huntHud.getBounds().bottom<118'), 'hunt HUD overlaps character/minimap/streak HUD'
  await page.keyboard.press('f')
  await page.wait_for_function(f"{O}.surface.targets().filter(e=>e.spawn.key==='hunt:ash-drake').length===3")
  await page.wait_for_function("window.__audio.mood==='boss'")
  # Acceptance persists before combat completion.
  await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  await page.wait_for_function(f"{O}.world.hasFlag('hunt-active:ash-drake') && {O}.surface.engaged")
  await page.keyboard.press('2');await page.wait_for_function(f'{O}.surface.runtime.shield>0')
  await page.wait_for_function(f"{O}.surface.runtime.canCast('trap_set')===undefined")
  await page.keyboard.press('3')
  await page.wait_for_function(f"({O}.surface.runtime.cooldowns.get('trap_set')??0)>0")
  await page.wait_for_function(f'{O}.surfaceEffects.commandBuffer.length>0')
  started=time.monotonic();await page.keyboard.down('j')
  while not await page.evaluate(f"{O}.session.defeated.has('hunt:ash-drake')"):
   if time.monotonic()-started>75:raise AssertionError('hunt fight exceeded budget')
   state=await page.evaluate(f"[ {O}.session.player.hp,{O}.tileX,{O}.tileY ]")
   assert state[1]!=0 or state[2]!=0,'geared hunt fixture was defeated'
   if state[0]<65:await page.keyboard.press('h')
   await page.keyboard.press('1');await page.wait_for_timeout(180)
  await page.keyboard.up('j')
  await page.wait_for_function(f'!{O}.surfaceSavePending')
  assert await page.evaluate(f'{O}.scene.isActive()')
  assert await page.evaluate(f"{O}.world.getItemCount('ash_gloves')>=1")
  assert await page.evaluate(f'{O}.session.player.gold>=90')
  assert await page.evaluate(f'{O}.streak.best>=2')
  saved=await page.evaluate(f"[ {O}.session.player.gold,{O}.session.player.exp,{O}.world.getItemCount('ash_gloves') ]")
  if os.environ.get('HUNT_SCREENSHOT'):await page.screenshot(path=os.environ['HUNT_SCREENSHOT'])
  await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  assert await page.evaluate(f"[ {O}.session.player.gold,{O}.session.player.exp,{O}.world.getItemCount('ash_gloves') ]")==saved
  await page.keyboard.press('f');await page.wait_for_timeout(250)
  assert await page.evaluate(f"!{O}.surface.targets().some(e=>e.spawn.key==='hunt:ash-drake')")
  assert await page.evaluate(f"[ {O}.session.player.gold,{O}.session.player.exp,{O}.world.getItemCount('ash_gloves') ]")==saved
  assert not errors,errors
  print('PASS: opt-in hunt, acceptance reload, elite music, shield/trap visuals, real-input geared victory, cosmetic streak, guaranteed reward and no duplicate on reload; explicit fixtures')
  await b.close()
asyncio.run(main())

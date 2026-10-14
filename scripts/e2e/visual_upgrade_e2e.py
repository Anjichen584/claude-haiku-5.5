"""UI/character smoke + actual keyboard/pointer trading; setup injections are explicit.
Start npm run dev, then python3 scripts/e2e/visual_upgrade_e2e.py.
Requires pip install playwright and playwright install chromium.
"""
import asyncio
from playwright.async_api import async_playwright
OVER="window.__game.scene.getScene('OverworldScene')"
DUN="window.__game.scene.getScene('DungeonScene')"
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(args=['--no-sandbox']);pg=await b.new_page(viewport={'width':1280,'height':720})
  errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  await pg.goto('http://localhost:5173');await pg.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await pg.keyboard.press('Enter');await pg.wait_for_function(f"{OVER}.scene.isActive()")
  assert await pg.evaluate("window.__game.textures.exists('enemy-ash_wolf') && window.__game.textures.exists('actor-merchant')")
  # Test fixture: money. Position is reached through real WASD input.
  await pg.evaluate(f'{OVER}.session.player.gold=100')
  await pg.keyboard.down('d');await pg.wait_for_function(f'{OVER}.tileX>=3.5');await pg.keyboard.up('d')
  await pg.keyboard.down('s');await pg.wait_for_function(f'{OVER}.tileY>=3.5');await pg.keyboard.up('s')
  await pg.keyboard.press('e');await pg.wait_for_timeout(200)
  assert await pg.evaluate(f'{OVER}.shop.visible'),'merchant not reached'
  await pg.keyboard.press('1');await pg.wait_for_timeout(100)
  assert await pg.evaluate(f"{OVER}.session.player.gold===60 && {OVER}.session.world.getItemCount('iron_sword')===1")
  await pg.keyboard.press('2');await pg.wait_for_timeout(100)
  assert await pg.evaluate(f"{OVER}.shop.note.text.includes('金币不足')")
  await pg.mouse.click(1040,116);await pg.wait_for_timeout(100)
  assert not await pg.evaluate(f'{OVER}.shop.visible')
  await pg.keyboard.press('c');await pg.wait_for_function(f'{OVER}.equipPanelOpen');await pg.keyboard.press('1');await pg.wait_for_timeout(100)
  assert await pg.evaluate(f"{OVER}.session.player.equipment.main_hand==='iron_sword'")
  await pg.keyboard.press('g');await pg.wait_for_timeout(100)
  assert await pg.evaluate(f'{OVER}.skillPanelOpen && !{OVER}.equipPanelOpen')
  await pg.keyboard.press('Escape');await pg.wait_for_timeout(100)
  assert not await pg.evaluate(f'{OVER}.anyPanel()')
  await pg.keyboard.press('t');await pg.wait_for_function("window.__game.scene.isActive('TestRoomScene')")
  await pg.keyboard.press('j');await pg.keyboard.press('Escape');await pg.wait_for_function(f'{OVER}.scene.isActive()')
  assert not await pg.evaluate(f'{OVER}.skillPanelOpen || {OVER}.repPanelOpen')
  # Fixture: teleport to gate to isolate dungeon UI, not a full traversal test.
  await pg.evaluate(f'{OVER}.tileX=400;{OVER}.tileY=0')
  await pg.keyboard.press('e');await pg.wait_for_function(f'{DUN}.scene.isActive()')
  await pg.evaluate(f"{DUN}.run.current={DUN}.run.layout.rooms.find(r=>r.kind==='shop').id;{DUN}.render()")
  await pg.keyboard.press('e');await pg.wait_for_timeout(100)
  assert await pg.evaluate(f'{DUN}.shop.visible')
  await pg.keyboard.press('Escape');await pg.wait_for_function(f'!{DUN}.shopOpen');await pg.keyboard.press('l');await pg.wait_for_function(f'{OVER}.scene.isActive()')
  # Fixture: valid equipment-derived hp; save through the real K key, reload through title.
  await pg.evaluate(f"{OVER}.session.player.equipment.head='ash_helm';{OVER}.session.player.hp=135")
  await pg.keyboard.press('k');await pg.wait_for_timeout(100);await pg.reload()
  await pg.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await pg.keyboard.press('s');await pg.keyboard.press('Enter');await pg.wait_for_function(f'{OVER}.scene.isActive()')
  assert await pg.evaluate(f'{OVER}.session.player.hp===135')
  assert not errors,errors
  print('PASS: textures, real movement, merchant keyboard/pointer, insufficient funds, equip, exclusive panels, scene return, dungeon shop, 135hp save/reload; no page errors')
  await b.close()
asyncio.run(main())

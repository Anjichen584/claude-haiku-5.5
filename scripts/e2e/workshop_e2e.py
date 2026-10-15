"""Production workshop UI: guarded confirmations, real profile, durable shared blueprints."""
import asyncio,os,json,re
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
KEY='rift-chronicles-save-v1'
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(args=['--no-sandbox']);page=await b.new_page(viewport={'width':1280,'height':720});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('GAME_URL','http://localhost:5173/'))
  await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  # Explicit fixture: do not pretend materials/gold came from normal play.
  await page.evaluate(f"""()=>{{const s={O};s.tileX=4;s.tileY=4;s.player.setPosition(64,64);s.session.player.tileX=4;s.session.player.tileY=4;s.session.player.gold=10000;s.session.world.addItem('rift_shard',100);s.session.world.addItem('rift_blade',2);s.syncChunks();}}""")
  await page.get_by_role('button',name='存档 / 帮助',exact=True).click();await page.locator('#tab-forge').click()
  await page.locator('#forge-item').select_option('rift_blade')
  assert await page.locator('#forge-refine').is_enabled()
  await page.locator('#forge-refine').click();await page.locator('#forge-cancel').click()
  assert await page.evaluate(f'{O}.session.player.gold')==10000
  await page.locator('#forge-refine').click();await page.locator('#forge-confirm').click()
  assert await page.evaluate(f'{O}.session.player.crafting.rift_blade.rank')==1
  assert await page.evaluate(f'{O}.session.player.gold')==9920
  assert '已保存' in await page.locator('#forge-status').inner_text()
  await page.locator('#forge-equip').click();await page.locator('#forge-confirm').click()
  assert await page.evaluate(f'{O}.session.player.equipment.main_hand')=='rift_blade'
  await page.locator('#forge-reforge').click();await page.locator('#forge-confirm').click()
  assert await page.evaluate(f'{O}.session.player.crafting.rift_blade.reforges.length')==1
  await page.locator('#forge-salvage').click();await page.locator('#forge-confirm').click()
  assert await page.locator('#forge-salvage').is_disabled()
  assert await page.evaluate(f'{O}.session.player.equipment.main_hand')=='rift_blade'
  assert await page.evaluate(f"{O}.session.world.getItemCount('rift_blade')")==0
  expected_attack=float(re.search(r'攻击：([\d.]+)',await page.locator('#forge-compare').inner_text()).group(1))
  # Confirmation cannot survive leaving the tab.
  await page.locator('#forge-refine').click();await page.locator('#tab-help').click();await page.locator('#tab-forge').click()
  assert not await page.locator('#forge-confirmation').is_visible()
  # Location and encounter guards are evaluated again at execution time.
  await page.locator('#forge-refine').click();await page.evaluate(f'{O}.session.player.tileX=100')
  await page.locator('#forge-confirm').click()
  assert await page.evaluate(f'{O}.session.player.crafting.rift_blade.rank')==1
  saved=json.loads(await page.evaluate(f"localStorage.getItem('{KEY}')"));assert saved['player']['crafting']['rift_blade']=={'rank':1,'reforges':[0]}
  await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')");await page.keyboard.press('s')
  await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  assert await page.evaluate(f'{O}.session.player.crafting.rift_blade.rank')==1
  assert await page.evaluate(f'{O}.session.player.crafting.rift_blade.reforges.length')==1
  await page.wait_for_function(f'{O}.surface.runtime.profile.attack==={expected_attack}')
  assert not errors,errors
  print(json.dumps({'workshop':'passed','confirmation_cancel':True,'spare_only_salvage':True,'durable_blueprint':True,'errors':errors}))
  await b.close()
asyncio.run(main())

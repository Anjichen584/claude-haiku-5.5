"""Read-only journal, paused state, late-hunt fixtures and local save persistence.
Fixtures set quest status and partial defeated keys, not a real combat playthrough.
"""
import asyncio, os, json
from playwright.async_api import async_playwright
O = "window.__game.scene.getScene('OverworldScene')"

async def main():
 async with async_playwright() as p:
  browser = await p.chromium.launch(args=['--no-sandbox'])
  page = await browser.new_page(viewport={'width':1280,'height':720})
  errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  await page.goto(os.environ.get('GAME_URL','http://localhost:5173/'))
  await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.get_by_role('button',name='存档 / 帮助',exact=True).click()
  await page.locator('#tab-hunts').click()
  assert '返回地表' in await page.locator('#panel-hunts').inner_text()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await page.wait_for_function(f'{O}.scene.isActive()')
  await page.get_by_role('button',name='存档 / 帮助',exact=True).click()
  await page.locator('#tab-hunts').click()
  assert await page.locator('#panel-hunts article').count()==6
  assert await page.locator('#panel-hunts article[data-state="locked"]').count()==6
  assert '0/6' in await page.locator('#hunt-journal-summary').inner_text()
  assert await page.locator('#panel-hunts button').count()==0
  before=await page.evaluate(f'JSON.stringify({O}.session.world.snapshot())')
  elapsed=await page.evaluate(f'{O}.elapsedMs')
  await page.keyboard.press('w')
  await page.wait_for_timeout(150)
  assert await page.evaluate(f'{O}.elapsedMs')==elapsed
  assert await page.evaluate(f'JSON.stringify({O}.session.world.snapshot())')==before
  # Explicit model-state fixture to test displayed states, not combat results.
  await page.evaluate(f"""()=>{{const s={O};const h=s.hunts[3];
   s.session.world.setQuest(h.unlockQuest,{{status:'completed',progress:[]}});
   s.session.world.setFlag(h.requiredFlag);
   s.session.defeated.add('surface-member:'+h.key+':0');
  }}""")
  await page.locator('#tab-help').click();await page.locator('#tab-hunts').click()
  witch=page.locator('article[data-hunt-key="hunt:grove-witch"]')
  assert await witch.get_attribute('data-state')=='active'
  assert '学者手套' in await witch.inner_text()
  assert '已击败 1/3' in await witch.inner_text()
  swamp=page.locator('article[data-hunt-key="hunt:mire-shaman"]')
  assert '治疗药剂' in await swamp.inner_text() and '魔力药剂' in await swamp.inner_text()
  await page.keyboard.press('Escape')
  await page.keyboard.press('k')
  await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.keyboard.press('s');await page.keyboard.press('Enter')
  await page.wait_for_function(f'{O}.scene.isActive()')
  await page.get_by_role('button',name='存档 / 帮助',exact=True).click();await page.locator('#tab-hunts').click()
  assert await page.locator('article[data-hunt-key="hunt:grove-witch"]').get_attribute('data-state')=='active'
  assert '已击败 1/3' in await page.locator('article[data-hunt-key="hunt:grove-witch"]').inner_text()
  await page.set_viewport_size({'width':390,'height':844})
  assert await page.locator('#tab-hunts').is_visible()
  assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  assert not errors,errors
  print(json.dumps({'journal':'passed','entries':6,'paused':True,'read_only':True,'reload':True,'errors':errors}))
  await browser.close()

asyncio.run(main())

"""Local file/DOM integration. Imported JSON has explicit gold/flag fixtures.
Checks real download, preview/cancel, quota failure, confirm, old-save recovery and Continue.
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
KEY='rift-chronicles-save-v1'
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(args=['--no-sandbox']);page=await b.new_page(viewport={'width':1280,'height':720},accept_downloads=True);errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('GAME_URL','http://localhost:5173/'))
  await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  await page.keyboard.press('k');await page.wait_for_function(f"localStorage.getItem('{KEY}')!==null")
  saved=await page.evaluate(f"localStorage.getItem('{KEY}')")
  await page.get_by_role('button',name='存档 / 帮助',exact=True).click()
  await page.get_by_role('button',name='操作帮助',exact=True).click()
  assert await page.get_by_role('heading',name='旅人操作手册').is_visible()
  await page.get_by_role('button',name='存档',exact=True).click()
  # Export must not serialize an uncommitted live session.
  await page.evaluate(f'{O}.session.player.gold=999')
  async with page.expect_download() as result:
   await page.get_by_role('button',name='导出最近存档',exact=True).click()
  download=await result.value
  assert Path(await download.path()).read_text()==saved
  await page.evaluate(f"{O}.session.player.gold={json.loads(saved)['player']['gold']}")
  file=page.get_by_label('选择存档文件',exact=True)
  async def choose(content,name='transfer.json'):
   await file.set_input_files({'name':name,'mimeType':'application/json','buffer':content.encode()})
  await choose(saved)
  await page.wait_for_function("document.querySelector('#save-status').textContent.includes('游戏进行中不能导入')")
  await page.get_by_role('button',name='保存并返回标题',exact=True).click()
  await page.wait_for_function("window.__game.scene.isActive('TitleScene')")
  original=await page.evaluate(f"localStorage.getItem('{KEY}')")
  await choose('broken')
  await page.wait_for_function("document.querySelector('#save-status').textContent.includes('JSON')")
  assert await page.evaluate(f"localStorage.getItem('{KEY}')")==original
  incoming=json.loads(original);incoming['player']['gold']=777;incoming['world']['flags'].append('transfer-fixture')
  raw=json.dumps(incoming,ensure_ascii=False)
  await choose(raw)
  await page.wait_for_function("!document.querySelector('#save-confirmation').hidden")
  assert await page.get_by_text('777 金币',exact=False).count()>0
  assert await page.evaluate(f"localStorage.getItem('{KEY}')")==original
  await page.get_by_role('button',name='取消导入',exact=True).click()
  assert await page.evaluate(f"localStorage.getItem('{KEY}')")==original
  await choose(raw)
  await page.wait_for_function("!document.querySelector('#save-confirmation').hidden")
  await page.evaluate("() => {window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.endsWith('-before-import'))throw new DOMException('full','QuotaExceededError');return window.__set.call(this,k,v);};}")
  await page.get_by_role('button',name='确认导入并替换',exact=True).click()
  await page.wait_for_function("document.querySelector('#save-status').textContent.includes('无法保留导入前备份')")
  assert await page.evaluate(f"localStorage.getItem('{KEY}')")==original
  await page.evaluate('() => {Storage.prototype.setItem=window.__set;}')
  await page.get_by_role('button',name='确认导入并替换',exact=True).click()
  await page.wait_for_function("document.querySelector('#save-status').textContent.includes('导入成功')")
  assert json.loads(await page.evaluate(f"localStorage.getItem('{KEY}')"))['player']['gold']==777
  async with page.expect_download() as result:
   await page.get_by_role('button',name='导出导入前备份',exact=True).click()
  old=await result.value;assert Path(await old.path()).read_text()==original
  if os.environ.get('SAVE_SCREENSHOT'):await page.screenshot(path=os.environ['SAVE_SCREENSHOT'])
  await page.get_by_role('button',name='返回游戏',exact=True).click()
  assert await page.evaluate("document.activeElement?.tagName==='CANVAS'"), 'closing settings did not restore game keyboard focus'
  await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  assert await page.evaluate(f"{O}.session.player.gold===777 && {O}.world.hasFlag('transfer-fixture')")
  await page.keyboard.press('k')
  assert await page.evaluate(f"localStorage.getItem('{KEY}-before-import')")==original
  assert not errors,errors
  print('PASS: game help, checkpoint-only JSON download, title-only import, invalid rejection, preview/cancel, quota failure preserves primary, confirmed replacement, independent old-save download, Continue and subsequent autosave safety; explicit imported fixtures')
  await b.close()
asyncio.run(main())

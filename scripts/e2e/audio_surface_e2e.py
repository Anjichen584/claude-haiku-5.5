"""Browser integration with explicit position/skill/death fixtures.
Real keys/clicks exercise skills, dodge, settings, save recovery and audio signal.
The separate early_route test covers uninjected WASD+combat progression.
"""
import asyncio, os
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
A='window.__audio'
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(args=['--no-sandbox']);page=await b.new_page(viewport={'width':1280,'height':720});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('GAME_URL','http://localhost:5173/'))
  await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  await page.wait_for_function(f"{A}.state==='running'")
  # A nonzero Web Audio analyser signal proves synthesis, not just UI state.
  await page.evaluate(f"""() => {{const a={A};window.__meter=a.context.createAnalyser();a.master.connect(window.__meter);}}""")
  await page.wait_for_function("(()=>{const x=new Float32Array(window.__meter.fftSize);window.__meter.getFloatTimeDomainData(x);return x.some(v=>Math.abs(v)>.0001)})()")
  await page.get_by_role('button',name='♫ 声音设置').click()
  await page.wait_for_function(f'{A}.panelOpen')
  await page.get_by_label('背景音乐',exact=True).focus();await page.keyboard.press('Home')
  for _ in range(30):await page.keyboard.press('ArrowRight')
  assert await page.evaluate(f'{A}.settings.music')==.3
  await page.get_by_role('button',name='全部静音',exact=True).click()
  await page.wait_for_timeout(1000)
  assert await page.evaluate("(()=>{const x=new Float32Array(window.__meter.fftSize);window.__meter.getFloatTimeDomainData(x);return x.every(v=>Math.abs(v)<.0001)})()")
  await page.get_by_role('button',name='返回游戏').click()
  # Position/learned-skill fixture: never change enemy HP or invoke damage callbacks.
  await page.evaluate(f"""() => {{const s={O};s.tileX=15;s.tileY=-5;s.player.setPosition(240,-80);s.session.player.skills.unlocked=['fireball'];s.session.player.skills.equipped=['fireball'];s.syncChunks();}}""")
  await page.wait_for_function(f'{O}.surface.engaged')
  await page.get_by_role('button',name='存档 / 帮助',exact=True).click()
  await page.get_by_role('button',name='保存并返回标题',exact=True).click()
  await page.wait_for_function("document.querySelector('#save-status').textContent.includes('先结束战斗')")
  assert await page.evaluate(f'{O}.scene.isActive()'), 'save tools escaped active combat'
  await page.keyboard.press('Escape')
  await page.keyboard.press('1');await page.wait_for_function(f"({O}.surface.runtime.cooldowns.get('fireball')??0)>0")
  await page.keyboard.press('Space');await page.wait_for_function(f'{O}.surface.runtime.dodgeCooldownMs>0')
  await page.keyboard.down('j');await page.wait_for_function(f"{O}.session.defeated.has('camp-wolves-0')",timeout=35000);await page.keyboard.up('j')
  assert await page.evaluate(f'{O}.scene.isActive()')
  await page.wait_for_function(f'!{O}.surfaceSavePending')
  reward=await page.evaluate(f'[{O}.session.player.gold,{O}.session.player.exp]')
  await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  assert await page.evaluate(f'{A}.settings.muted && {A}.settings.music===.3')
  await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  assert await page.evaluate(f'[{O}.session.player.gold,{O}.session.player.exp]')==reward
  assert await page.evaluate(f"!{O}.surface.targets().some(e=>e.spawn.key==='camp-wolves-0')")
  # Defeat recovery fixture, preserving already granted rewards.
  await page.evaluate(f'{O}.session.player.hp=0')
  await page.wait_for_function(f'{O}.tileX===0 && {O}.tileY===0 && {O}.session.player.hp>0')
  assert await page.evaluate(f'[{O}.session.player.gold,{O}.session.player.exp]')==reward
  await page.get_by_role('button',name='♫ 声音设置').click()
  hp=await page.evaluate(f'{O}.session.player.hp');await page.wait_for_timeout(400)
  assert await page.evaluate(f'{O}.session.player.hp')==hp
  await page.get_by_role('button',name='取消静音',exact=True).click();await page.keyboard.press('Escape')
  assert not await page.evaluate(f'{A}.panelOpen')
  if os.environ.get('SURFACE_SCREENSHOT'):await page.screenshot(path=os.environ['SURFACE_SCREENSHOT'])
  assert not errors,errors
  print('PASS: audible synthesis signal, independent music volume, actual mute, persisted settings, map skill/dodge/kill with no scene switch, reload reward stability, safe defeat rescue, paused audio panel; explicit fixtures')
  await b.close()
asyncio.run(main())

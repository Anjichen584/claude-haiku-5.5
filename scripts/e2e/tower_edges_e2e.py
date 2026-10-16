"""Explicit saved-run fixtures test boundary UI, not a claimed 30-floor playthrough."""
import asyncio, json, os, subprocess
from playwright.async_api import async_playwright
T="window.__game.scene.getScene('TowerScene')"
O="window.__game.scene.getScene('OverworldScene')"
B="window.__game.scene.getScene('TestRoomScene')"
KEY='rift-chronicles-save-v1'
SCRIPT="""
import {newSession,toSaveFile} from './src/state/session.ts';
import {loadGameData} from './src/data/loader.ts';
import {newTower,startTower,finishTowerFloor,boonChoices,chooseBoon} from './src/tower/run.ts';
const out={};for(const n of [4,29,30]){
 const s=newSession(loadGameData().quests);s.tower=newTower();startTower(s.tower);
 for(let i=1;i<=n;i++){finishTowerFloor(s.tower,1,i,true);if(s.tower.run.phase==='boon')chooseBoon(s.tower.run,boonChoices(s.tower.run)[0]);}
 if(n===29)s.player.hp=1;
 out[n]=toSaveFile(s);
}console.log(JSON.stringify(out));
"""
async def main():
 fixtures=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',SCRIPT],text=True))
 async with async_playwright() as p:
  browser=await p.chromium.launch(args=['--no-sandbox']);page=await browser.new_page(viewport={'width':1280,'height':720})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def load(n):
   await page.goto(os.environ.get('GAME_URL','http://localhost:5173/'))
   await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
   await page.evaluate("([key,save])=>{localStorage.clear();localStorage.setItem(key,JSON.stringify(save))}",[KEY,fixtures[str(n)]])
   await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
   await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{T}.scene.isActive()')
  await load(4)
  await page.keyboard.press('l');await page.wait_for_function(f'{O}.scene.isActive()')
  assert await page.evaluate(f'{O}.session.tower.run.cleared')==4
  assert await page.evaluate(f'{O}.session.player.gold')==0
  await page.keyboard.press('y');await page.wait_for_function(f'{T}.scene.isActive()')
  await page.keyboard.press('x');await page.wait_for_function(f'{T}.abandonArmed')
  assert await page.evaluate(f'{T}.session.tower.run.cleared')==4
  await page.keyboard.press('x');await page.wait_for_function(f'{T}.session.tower.run===null')
  assert await page.evaluate(f'{T}.session.tower.best')==4
  await load(30)
  assert await page.evaluate(f'{T}.session.tower.run.phase')=='complete'
  # Fail writes at the completion boundary. It must not leave or claim a second time.
  await page.evaluate("()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota fixture')}}")
  await page.keyboard.press('l');await page.wait_for_function(f'{T}.message.text.includes("保存失败")')
  assert await page.evaluate(f'{T}.scene.isActive()')
  assert await page.evaluate(f'{T}.session.tower.run') is None
  gold=await page.evaluate(f'{T}.session.player.gold');assert gold==7440
  await page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem}')
  await page.keyboard.press('l');await page.wait_for_function(f'{O}.scene.isActive()')
  assert await page.evaluate(f'{O}.session.player.gold')==gold
  assert await page.evaluate(f"{O}.session.world.getItemCount('rift_shard')")==12
  await load(29)
  await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
  assert await page.evaluate(f'{B}.encounter.tower.floor')==30
  assert await page.evaluate(f'{B}.enemies.some(e=>e.def.boss)')
  # Explicit one-HP fixture, real J approach/attacks and boss AI damage.
  await page.keyboard.down('j')
  await page.wait_for_function(f'{B}.finished',timeout=90000)
  await page.keyboard.up('j')
  assert not await page.evaluate(f'{B}.won')
  assert await page.evaluate(f'{B}.session.tower.run') is None
  assert await page.evaluate(f'{B}.session.tower.best')==29
  assert await page.evaluate(f'{B}.session.player.gold')==0
  assert await page.evaluate(f'{B}.session.player.hp')<=100
  await page.wait_for_function(f'{B}.resultInputGate.ready')
  await page.keyboard.press('Space');await page.wait_for_function(f'{T}.scene.isActive()')
  assert await page.evaluate(f'{T}.session.tower.run') is None
  assert not errors,errors
  print(json.dumps({'tower_edges':'passed','explicit_save_fixtures':True,'suspend':True,'abandon_confirm':True,'completion_cashout':True,'save_failure_retry':True,'real_ai_defeat':True,'errors':errors}))
  await browser.close()
asyncio.run(main())

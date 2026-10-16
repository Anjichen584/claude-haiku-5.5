"""Explicit 9/19/29-floor checkpoints and strong gear fixtures.
Tests actual hazard warning/pause/avoidance, lobby supplies, and real-input floor-10 combat.
Uses Phaser AUTO Canvas fallback (--disable-webgl) to avoid slow headless software WebGL.
Does not claim to have walked all preceding floors or established normal-player balance.
"""
import asyncio,json,os,subprocess,time
from playwright.async_api import async_playwright
T="window.__game.scene.getScene('TowerScene')"
B="window.__game.scene.getScene('TestRoomScene')"
O="window.__game.scene.getScene('OverworldScene')"
KEY='rift-chronicles-save-v1'
SCRIPT="""
import {newSession,toSaveFile} from './src/state/session.ts';
import {loadGameData} from './src/data/loader.ts';
import {newTower,startTower,finishTowerFloor,boonChoices,chooseBoon} from './src/tower/run.ts';
import {towerLobbyProfile} from './src/tower/supplies.ts';
const out={};for(const n of [9,19,29]){
 const s=newSession(loadGameData().quests);s.tower=newTower();startTower(s.tower);
 s.player.equipment={main_hand:'ash_sword',head:'ash_helm',chest:'ash_plate',feet:'ash_boots',hands:'ash_gloves',neck:'ash_amulet'};
 s.player.crafting=Object.fromEntries(Object.values(s.player.equipment).map(id=>[id,{rank:5,reforges:[]}]));
 s.player.skills.unlocked=['fireball','mana_shield','trap_set'];s.player.skills.equipped=['fireball','mana_shield','trap_set'];
 s.world.addItem('health_potion',20);s.world.addItem('mana_potion',20);
 for(let i=1;i<=n;i++){finishTowerFloor(s.tower,1,i,true);if(s.tower.run.phase==='boon'){const ids=boonChoices(s.tower.run);chooseBoon(s.tower.run,ids.includes('might')?'might':ids[0]);}}
 const p=towerLobbyProfile(s);s.player.hp=p.maxHp-25;s.player.mana=p.maxMana-40;out[n]=toSaveFile(s);
}console.log(JSON.stringify(out));
"""
async def main():
 fixtures=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',SCRIPT],text=True))
 async with async_playwright() as p:
  browser=await p.chromium.launch(args=['--no-sandbox','--disable-webgl']);page=await browser.new_page(viewport={'width':1280,'height':720})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def load(n):
   await page.goto(os.environ.get('GAME_URL','http://localhost:5173/'));await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
   await page.evaluate("([k,s])=>{localStorage.clear();localStorage.setItem(k,JSON.stringify(s))}",[KEY,fixtures[str(n)]])
   await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
   await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{T}.scene.isActive()')
  # Validate final-stage geometry and timing through real scene updates (no damage calls).
  for n in [19,29]:
   await load(n);await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
   try:
    await page.wait_for_function(f'{B}.hazards?.warning!=null',timeout=30000)
   except Exception:
    print(await page.evaluate(f'({{hazards:{B}.hazards,finished:{B}.finished,opening:{B}.openingLeftMs,encounter:{B}.encounter,elapsed:{B}.runtime.elapsedMs}})'),errors,flush=True)
    raise
   zones=await page.evaluate(f'{B}.hazards.warning.zones')
   assert len(zones)==(2 if n==29 else 1)
   assert zones[0]['kind']==('lane' if n==19 else 'circle')
   assert await page.evaluate(f'{B}.hazardGraphics.commandBuffer.length')>0
   print(f'floor {n+1} warning geometry passed',flush=True)
   await page.close();page=await browser.new_page(viewport={'width':1280,'height':720})
   page.on('pageerror',lambda e:errors.append(str(e)))
  await load(9)
  old_hp=await page.evaluate(f'{T}.session.player.hp')
  old_potions=await page.evaluate(f"{T}.session.world.getItemCount('health_potion')")
  await page.keyboard.press('h');await page.wait_for_function(f'{T}.message.text.includes("已保存")')
  assert await page.evaluate(f'{T}.session.player.hp')==old_hp+25
  assert await page.evaluate(f"{T}.session.world.getItemCount('health_potion')")==old_potions-1
  old_mana=await page.evaluate(f'{T}.session.player.mana')
  await page.keyboard.press('m');await page.wait_for_function(f'{T}.message.text.includes("冷却")')
  assert await page.evaluate(f'{T}.session.player.mana')==old_mana
  saved=json.loads(await page.evaluate(f"localStorage.getItem('{KEY}')"));assert saved['player']['hp']==old_hp+25
  await page.wait_for_function(f'{T}.session.player.consumableReadyAt<=Date.now()',timeout=10000)
  mana_count=await page.evaluate(f"{T}.session.world.getItemCount('mana_potion')")
  await page.evaluate("()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota fixture')}}")
  await page.keyboard.press('m');await page.wait_for_function(f'{T}.message.text.includes("保存失败")')
  assert await page.evaluate(f"{T}.session.world.getItemCount('mana_potion')")==mana_count-1
  await page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem}')
  await page.keyboard.press('k');await page.wait_for_function(f'{T}.message.text.includes("已保存")')
  assert await page.evaluate(f"{T}.session.world.getItemCount('mana_potion')")==mana_count-1
  await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
  await page.wait_for_function(f'{B}.hazards.warning!==null',timeout=30000)
  await page.get_by_role('button',name='♫ 声音设置',exact=True).click()
  paused=await page.evaluate(f'[{B}.hazards.elapsedMs,{B}.hazards.warning.remainingMs]')
  await page.wait_for_timeout(450)
  assert await page.evaluate(f'[{B}.hazards.elapsedMs,{B}.hazards.warning.remainingMs]')==paused
  await page.locator('#rift-audio-close').click()
  await page.keyboard.down('d')
  await page.wait_for_function(f"Math.hypot({B}.px-{B}.hazards.warning.zones[0].x,{B}.py-{B}.hazards.warning.zones[0].y)>110",timeout=20000)
  await page.keyboard.up('d')
  await page.wait_for_function(f'{B}.hazards.strikes>=1',timeout=15000)
  assert not await page.evaluate(f'{B}.log.some(x=>x.includes("余烬落火 命中"))')
  assert await page.evaluate(f'{B}.session.player.gold')==0
  started=time.monotonic();await page.keyboard.down('j')
  while not await page.evaluate(f'{B}.finished'):
   if time.monotonic()-started>110:raise AssertionError('geared floor-10 fight exceeded budget')
   if await page.evaluate(f'{B}.playerActor.hp')<160:await page.keyboard.press('h')
   await page.keyboard.press('1');await page.keyboard.press('2');await page.keyboard.press('3')
   await page.wait_for_timeout(160)
  await page.keyboard.up('j')
  assert await page.evaluate(f'{B}.won')
  assert await page.evaluate(f'{B}.hazardGraphics.commandBuffer.length')==0
  await page.wait_for_function(f'{B}.resultInputGate.ready');await page.keyboard.press('Space');await page.wait_for_function(f'{T}.scene.isActive()')
  assert await page.evaluate(f'{T}.session.tower.run.cleared')==10
  await page.keyboard.press('l');await page.wait_for_function(f'{O}.scene.isActive()')
  assert await page.evaluate(f'{O}.session.player.gold')==880
  assert await page.evaluate(f'{O}.session.player.exp')==1650
  assert await page.evaluate(f"{O}.session.world.getItemCount('rift_shard')")==4
  assert not errors,errors
  print(json.dumps({'tower_hazards':'passed','warning_floors':[10,20,30],'pause':True,'move_out_avoids_pulse':True,'lobby_supply_saved':True,'shared_cooldown':True,'real_input_floor10_victory':True,'explicit_gear_and_checkpoint_fixtures':True,'errors':errors}))
  await browser.close()
asyncio.run(main())

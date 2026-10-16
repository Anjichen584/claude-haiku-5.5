"""Real input two wing orders / seal vs loot, ice hazard, retreat and checkpoint tests.
Explicit completed-chapter/full +5 ash/skills/potions fixture, NOT ordinary-player balance.
No direct move/damage/choice/settlement injection. Canvas fallback.
"""
import asyncio,json,os,subprocess,time
from playwright.async_api import async_playwright
V="window.__game.scene.getScene('TidalVaultScene')"
B="window.__game.scene.getScene('TestRoomScene')"
O="window.__game.scene.getScene('OverworldScene')"
SCRIPT="""
import {newSession,toSaveFile} from './src/state/session.ts';
import {loadGameData} from './src/data/loader.ts';
import {combatProfile} from './src/combat/profile.ts';
const d=loadGameData(),s=newSession(d.quests);
for(const id of ['main_01_first_rift','main_02_ash_road','main_03'])s.world.setQuest(id,{status:'completed',progress:[]});
s.player.equipment={main_hand:'ash_sword',head:'ash_helm',chest:'ash_plate',feet:'ash_boots',hands:'ash_gloves',neck:'ash_amulet'};
s.player.crafting=Object.fromEntries(Object.values(s.player.equipment).map(id=>[id,{rank:5,reforges:[]}]));
s.player.skills.unlocked=['fireball','mana_shield','trap_set'];s.player.skills.equipped=['fireball','mana_shield','trap_set'];
s.world.addItem('health_potion',30);s.world.addItem('mana_potion',30);
const p=combatProfile(s.player.equipment,d.items,d.affixes,d.itemSets,s.player.crafting);s.player.hp=p.maxHp;s.player.mana=p.maxMana;
console.log(JSON.stringify(toSaveFile(s)));
"""
async def main():
 fixture=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',SCRIPT],text=True))
 async with async_playwright() as p:
  browser=await p.chromium.launch(args=['--no-sandbox','--disable-webgl']);page=await browser.new_page(viewport={'width':1280,'height':720})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('GAME_URL','http://localhost:5173'));await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  # New game is locked by actual O input.
  await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()');await page.keyboard.press('o')
  assert await page.evaluate(f'{O}.scene.isActive()')
  await page.wait_for_function(f'{O}.toast.text.includes("完成第三章")')
  await page.evaluate("s=>localStorage.setItem('rift-chronicles-save-v1',JSON.stringify(s))",fixture)
  async def reload_scene(scene):
   await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')");await page.keyboard.press('s');await page.wait_for_function("window.__game.scene.getScene('TitleScene').selected===1");await page.keyboard.press('Enter');await page.wait_for_function(f'{scene}.scene.isActive()')
  await reload_scene(O);await page.keyboard.press('o');await page.wait_for_function(f'{V}.scene.isActive()')
  if os.environ.get('VAULT_SCREENSHOT'):await page.screenshot(path=os.environ['VAULT_SCREENSHOT'])
  async def fight(room,loot,reload_battle=False):
   gold=await page.evaluate(f'{V}.session.player.gold');xp=await page.evaluate(f'{V}.session.player.exp')
   await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
   if reload_battle:
    await reload_scene(V);assert await page.evaluate(f'{V}.session.vault.run.room')==room
    await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
   if room=='boss':
    assert await page.evaluate(f'{B}.enemies.length')==(3 if loot else 1)
    assert await page.evaluate(f'{B}.hazards.rule.intervalMs')==(5000 if loot else 8000)
    await page.wait_for_function(f'{B}.hazards.warning!==null',timeout=15000)
    assert await page.evaluate(f'{B}.hazards.warning.zones[0].kind')=='lane'
    assert await page.evaluate(f'{B}.hazards.rule.element')=='ice'
   t=time.monotonic();await page.keyboard.down('j')
   while not await page.evaluate(f'{B}.finished'):
    if time.monotonic()-t>110:raise AssertionError('battle input budget')
    hp,mana=await page.evaluate(f'[{B}.playerActor.hp,{B}.runtime.mana]')
    if hp<125:await page.keyboard.press('h')
    if mana<25:await page.keyboard.press('m')
    for key in ['1','2','3']:await page.keyboard.press(key)
    await page.wait_for_timeout(110)
   await page.keyboard.up('j');assert await page.evaluate(f'{B}.won'),room
   assert await page.evaluate(f'{B}.session.player.gold')==gold
   assert await page.evaluate(f'{B}.session.player.exp')==xp
   await page.wait_for_function(f'{B}.resultInputGate.ready');await page.keyboard.press('Space');await page.wait_for_function(f'{V}.scene.isActive()')
  for index,loot in enumerate([False,True]):
   await page.keyboard.press('e');await page.wait_for_function(f'{V}.session.vault.run?.room==="hub"')
   await page.keyboard.press('e');await page.wait_for_function(f'{V}.message.text.includes("先完成两个侧翼")')
   for step,key in enumerate(['2','1'] if loot else ['1','2']):
    room='stacks' if key=='1' else 'cistern'
    await page.keyboard.press(key);await page.wait_for_function(f'{V}.session.vault.run.room==="{room}"')
    await fight(room,loot,reload_battle=index==0 and step==0)
    # A won wing remains pending across refresh until a single disposition is chosen.
    if index==0 and step==0:
     await reload_scene(V);assert await page.evaluate(f'{V}.session.vault.run.cleared.length')==1
     assert await page.evaluate(f'{V}.session.vault.run.decisions.length')==0
    await page.keyboard.press('2' if loot else '1');await page.wait_for_function(f'{V}.session.vault.run.room==="hub"')
    assert await page.evaluate(f'{V}.session.vault.run.decisions.length')==step+1
   await page.keyboard.press('e');await page.wait_for_function(f'{V}.session.vault.run.room==="boss"')
   await fight('boss',loot)
   await page.wait_for_function(f'{V}.session.vault.run.room==="exit"')
   if loot:await page.evaluate("()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota fixture')}}")
   await page.keyboard.press('e');await page.wait_for_function(f'{V}.session.vault.run===null')
   assert await page.evaluate(f'{V}.session.vault.pages')==(6 if loot else 2)
   assert await page.evaluate(f'{V}.session.vault.clears')==index+1
   if loot:
    assert '保存失败' in await page.evaluate(f'{V}.message.text')
    await page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem}')
    await page.keyboard.press('k');await page.wait_for_function(f'{V}.message.text.includes("已保存")')
   print(f'completed vault loot={loot}',flush=True)
  assert await page.evaluate(f'{V}.session.player.gold')==560
  assert await page.evaluate(f'{V}.session.player.exp')==880
  await page.keyboard.press('1');await page.wait_for_function(f'{V}.pendingGear==="scholar_staff"')
  await page.keyboard.press('1');await page.wait_for_function(f"{V}.session.world.getItemCount('scholar_staff')===1")
  assert await page.evaluate(f'{V}.session.vault.pages')==3
  await reload_scene(O);await page.keyboard.press('o');await page.wait_for_function(f'{V}.scene.isActive()')
  assert await page.evaluate(f'{V}.session.vault.clears')==2
  # Real partial retreat does not mint pages or clear credit.
  await page.keyboard.press('e');await page.wait_for_function(f'{V}.session.vault.run?.room==="hub"')
  await page.keyboard.press('l');await page.wait_for_function(f'{O}.scene.isActive()')
  await page.keyboard.press('u');await page.wait_for_function(f'{O}.toast.text.includes("档案馆远征")')
  await page.keyboard.press('y');await page.wait_for_function(f'{O}.toast.text.includes("档案馆远征")')
  await page.keyboard.press('o');await page.wait_for_function(f'{V}.scene.isActive()')
  await page.keyboard.press('1');await page.wait_for_function(f'{V}.session.vault.run.room==="stacks"');await fight('stacks',False)
  await page.keyboard.press('1');await page.wait_for_function(f'{V}.session.vault.run.room==="hub"')
  await page.keyboard.press('r');await page.wait_for_function(f'{V}.armed==="retreat"')
  assert await page.evaluate(f'{V}.session.vault.run!==null')
  await page.keyboard.press('r');await page.wait_for_function(f'{V}.session.vault.run===null')
  assert await page.evaluate(f'{V}.session.vault.retreats')==1
  assert await page.evaluate(f'{V}.session.vault.pages')==3
  assert await page.evaluate(f'{V}.session.vault.clears')==2
  assert await page.evaluate(f'{V}.session.player.gold')==585
  await reload_scene(O);assert await page.evaluate(f'{O}.session.vault.retreats')==1
  assert not errors,errors
  print(json.dumps({'tidal_vault':'passed','both_wing_orders':True,'sealed_and_looted_routes':True,'real_battles':7,'battle_and_pending_choice_reload':True,'lane_hazard':True,'save_failure_retry':True,'targeted_exchange_reload':True,'mutual_gate_and_partial_retreat':True,'explicit_strong_fixture':True,'errors':errors}))
  await browser.close()
if __name__=='__main__':asyncio.run(main())

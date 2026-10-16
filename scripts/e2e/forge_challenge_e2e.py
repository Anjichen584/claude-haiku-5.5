"""Real-input normal unlock then both challenge routes, with checkpoint/currency checks.
Explicit chapter/full +5 ash set/skills/full-resource initial fixture. Canvas fallback.
No enemy HP mutation or direct move/damage/reward callback injection.
"""
import asyncio,json,os,subprocess,time
from playwright.async_api import async_playwright
F="window.__game.scene.getScene('AshForgeScene')"
B="window.__game.scene.getScene('TestRoomScene')"
O="window.__game.scene.getScene('OverworldScene')"
SCRIPT="""
import {newSession,toSaveFile} from './src/state/session.ts';
import {loadGameData} from './src/data/loader.ts';
import {combatProfile} from './src/combat/profile.ts';
const d=loadGameData(),s=newSession(d.quests);
s.world.setQuest('main_01_first_rift',{status:'completed',progress:[]});s.world.setQuest('main_02_ash_road',{status:'completed',progress:[]});
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
  await page.goto(os.environ.get('GAME_URL','http://localhost:5173/'));await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.evaluate("s=>localStorage.setItem('rift-chronicles-save-v1',JSON.stringify(s))",fixture)
  async def reload_forge():
   await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
   await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{F}.scene.isActive()')
  await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  await page.keyboard.press('u');await page.wait_for_function(f'{F}.scene.isActive()')
  await page.keyboard.press('c');await page.wait_for_function(f'{F}.message.text.includes("先完成一次普通")')
  assert await page.evaluate(f'{F}.session.forge.attempts')==0
  async def move(room,x,y):
   await page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
   await page.mouse.click(x,y);await page.wait_for_function(f'{F}.session.forge.run.current==="{room}"')
  async def fight(room,hard,extra,reload_battle=False):
   gold=await page.evaluate(f'{F}.session.player.gold');xp=await page.evaluate(f'{F}.session.player.exp')
   await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
   if reload_battle:
    await reload_forge();assert await page.evaluate(f'{F}.session.forge.run.difficulty')=='challenge'
    assert await page.evaluate(f'{F}.session.forge.run.current')==room
    await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
   count=await page.evaluate(f'{B}.enemies.length')
   assert count==({'hall':4,'cache':3,'boss':2}[room] if hard else {'hall':3,'cache':2,'boss':1}[room])
   if room=='boss':
    hp=await page.evaluate(f'{B}.enemies.find(e=>e.def.boss).def.hp')
    assert hp==((1040 if extra else 1300) if hard else (800 if extra else 1000))
    if hard:
     await page.wait_for_function(f'{B}.hazards.warning!==null',timeout=15000)
     assert await page.evaluate(f'{B}.hazards.warning.zones.length')==2
     assert await page.evaluate(f'{B}.hazards.rule.element')=='fire'
     assert await page.evaluate(f'{B}.hazards.rule.name')=='熔炉双焰'
   start=time.monotonic();await page.keyboard.down('j')
   while not await page.evaluate(f'{B}.finished'):
    if time.monotonic()-start>100:raise AssertionError(f'room {room} exceeded budget')
    hp,mana=await page.evaluate(f'[ {B}.playerActor.hp,{B}.runtime.mana ]')
    if hp<120:await page.keyboard.press('h')
    if mana<25:await page.keyboard.press('m')
    await page.keyboard.press('1');await page.keyboard.press('2');await page.keyboard.press('3');await page.wait_for_timeout(110)
   await page.keyboard.up('j');assert await page.evaluate(f'{B}.won'),(room,hard)
   assert await page.evaluate(f'{B}.session.player.gold')==gold
   assert await page.evaluate(f'{B}.session.player.exp')==xp
   await page.wait_for_function(f'{B}.resultInputGate.ready');await page.keyboard.press('Space');await page.wait_for_function(f'{F}.scene.isActive()')
  expected_gold=expected_exp=expected_embers=0
  for index,(hard,extra) in enumerate([(False,False),(True,False),(True,True)]):
   await page.keyboard.press('c' if hard else 'e');await page.wait_for_function(f'{F}.session.forge.run!=null')
   assert await page.evaluate(f'{F}.session.forge.run.difficulty??"normal"')==('challenge' if hard else 'normal')
   await page.keyboard.press('e');await page.wait_for_function(f'{F}.session.forge.run.current==="hall"')
   await fight('hall',hard,extra,reload_battle=index==1)
   await move('valves',555,245)
   clue=await page.evaluate(f"{F}.children.list.find(o=>typeof o.text==='string'&&o.text.startsWith('检修铭文')).text.split('\\n')[0]")
   names=['赤铜','鎏金','青钢'];order=[names.index(x.strip())+1 for x in clue.split('：')[1].split('→')]
   for step,valve in enumerate(order,1):
    await page.keyboard.press(str(valve));await page.wait_for_function(f'{F}.session.forge.run.valveStep==={step}')
   if extra:await move('cache',770,160);await fight('cache',hard,extra)
   await move('boss',985,245);await fight('boss',hard,extra)
   assert await page.evaluate(f'{F}.session.forge.challengeClears')==max(0,index-1)
   await move('exit',1160,245);await page.keyboard.press('e');await page.wait_for_function(f'{F}.session.forge.run===null')
   expected_gold+=420 if extra else 300 if hard else 120
   expected_exp+=800 if extra else 600 if hard else 240
   expected_embers+=8 if extra else 6 if hard else 3
   assert await page.evaluate(f'{F}.session.forge.clears')==index+1
   assert await page.evaluate(f'{F}.session.forge.challengeClears')==index
   assert await page.evaluate(f'{F}.session.player.gold')==expected_gold
   assert await page.evaluate(f'{F}.session.player.exp')==expected_exp
   assert await page.evaluate(f'{F}.session.forge.embers')==expected_embers
   print(f'completed {"challenge" if hard else "normal"} elite_route={extra}',flush=True)
  await page.keyboard.press('2');await page.wait_for_function(f'{F}.pendingGear==="ash_helm"')
  await page.keyboard.press('2');await page.wait_for_function(f"{F}.session.world.getItemCount('ash_helm')===1")
  assert await page.evaluate(f'{F}.session.forge.embers')==14
  await page.keyboard.press('c');await page.wait_for_function(f'{F}.session.forge.run?.difficulty==="challenge"')
  await page.keyboard.press('x');await page.wait_for_function(f'{F}.abandonArmed')
  await page.keyboard.press('x');await page.wait_for_function(f'{F}.session.forge.run===null')
  assert await page.evaluate(f'{F}.session.forge.challengeClears')==2
  assert await page.evaluate(f'{F}.session.forge.embers')==14
  await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
  assert await page.evaluate(f'{O}.session.forge.challengeClears')==2
  assert await page.evaluate(f'{O}.session.forge.embers')==14
  assert not errors,errors
  print(json.dumps({'forge_challenge':'passed','real_input_normal_unlock':True,'both_challenge_routes':True,'mirrored_fire_warning':True,'battle_reload_mode_preserved':True,'cashout_counters_exchange_reload':True,'abandon_keeps_banked_currency':True,'explicit_strong_gear_fixture':True,'errors':errors}))
  await browser.close()
asyncio.run(main())

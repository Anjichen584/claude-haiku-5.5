"""Reproducible small-sample forge resource observation, not global balance certification.
Initial fixture: chapter 2 complete, full unrefined ash set, learned/equipped skills,
full resources and a stocked bag. Real route, valve and combat input; no enemy mutation.
"""
import asyncio,json,os,subprocess,time
from playwright.async_api import async_playwright
F="window.__game.scene.getScene('AshForgeScene')"
B="window.__game.scene.getScene('TestRoomScene')"
SCRIPT="""
import {newSession,toSaveFile} from './src/state/session.ts';
import {loadGameData} from './src/data/loader.ts';
import {combatProfile} from './src/combat/profile.ts';
const d=loadGameData(),s=newSession(d.quests);s.player.exp=1000;
s.world.setQuest('main_01_first_rift',{status:'completed',progress:[]});s.world.setQuest('main_02_ash_road',{status:'completed',progress:[]});
s.player.equipment={main_hand:'ash_sword',head:'ash_helm',chest:'ash_plate',feet:'ash_boots',hands:'ash_gloves',neck:'ash_amulet'};
s.player.skills.unlocked=['fireball','mana_shield','trap_set'];s.player.skills.equipped=['fireball','mana_shield','trap_set'];
s.world.addItem('health_potion',8);s.world.addItem('mana_potion',8);
const p=combatProfile(s.player.equipment,d.items,d.affixes,d.itemSets);s.player.hp=p.maxHp;s.player.mana=p.maxMana;
console.log(JSON.stringify(toSaveFile(s)));
"""
async def main():
 fixture=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',SCRIPT],text=True));results=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(args=['--no-sandbox','--disable-webgl'])
  for extra in [False,True]:
   page=await browser.new_page(viewport={'width':1280,'height':720});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(os.environ.get('GAME_URL','http://localhost:5173/'));await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
   await page.evaluate("s=>localStorage.setItem('rift-chronicles-save-v1',JSON.stringify(s))",fixture)
   await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
   await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function("window.__game.scene.isActive('OverworldScene')")
   await page.keyboard.press('u');await page.wait_for_function(f'{F}.scene.isActive()')
   await page.keyboard.press('e');await page.wait_for_function(f'{F}.session.forge.run!=null')
   started=time.monotonic();room_seconds=[];won=True
   async def move(room,x,y):
    await page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    await page.mouse.click(x,y);await page.wait_for_function(f'{F}.session.forge.run.current==="{room}"')
   async def fight(room):
    await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
    start=time.monotonic();await page.keyboard.down('j')
    while not await page.evaluate(f'{B}.finished'):
     if time.monotonic()-start>100:raise AssertionError(f'sample room {room} exceeded input budget')
     state=await page.evaluate(f'[ {B}.playerActor.hp,{B}.stats.maxHp,{B}.runtime.mana ]')
     if state[0]<state[1]*.6:await page.keyboard.press('h')
     if state[2]<25:await page.keyboard.press('m')
     await page.keyboard.press('1');await page.keyboard.press('2');await page.keyboard.press('3');await page.wait_for_timeout(120)
    await page.keyboard.up('j');success=await page.evaluate(f'{B}.won')
    room_seconds.append({'room':room,'combat_seconds':round(await page.evaluate(f'{B}.runtime.elapsedMs/1000'),2),'won':success})
    await page.wait_for_function(f'{B}.resultInputGate.ready');await page.keyboard.press('Space');await page.wait_for_function(f'{F}.scene.isActive()')
    return success
   await page.keyboard.press('e');await page.wait_for_function(f'{F}.session.forge.run.current==="hall"');won=await fight('hall')
   if won:
    await move('valves',555,245)
    clue=await page.evaluate(f"{F}.children.list.find(o=>typeof o.text==='string'&&o.text.startsWith('检修铭文')).text.split('\\n')[0]")
    names=['赤铜','鎏金','青钢'];order=[names.index(x.strip())+1 for x in clue.split('：')[1].split('→')]
    for step,index in enumerate(order,1):
     await page.keyboard.press(str(index));await page.wait_for_function(f'{F}.session.forge.run.valveStep==={step}')
    if extra:await move('cache',770,160);won=await fight('cache')
    if won:await move('boss',985,245);won=await fight('boss')
    if won:
     await move('exit',1160,245);await page.keyboard.press('e');await page.wait_for_function(f'{F}.session.forge.run===null')
   state=await page.evaluate(f"({{hp:{F}.session.player.hp,mana:{F}.session.player.mana,gold:{F}.session.player.gold,health:{F}.session.world.getItemCount('health_potion'),magic:{F}.session.world.getItemCount('mana_potion'),embers:{F}.session.forge.embers}})")
   results.append({'elite_route':extra,'won':won,'wall_seconds':round(time.monotonic()-started,2),'rooms':room_seconds,'health_potions_used':fixture['world']['inventory']['health_potion']-state['health'],'mana_potions_used':fixture['world']['inventory']['mana_potion']-state['magic'],'final':state,'errors':errors})
   assert not errors,errors;await page.close()
  await browser.close()
 report={'fixture':'Lv5 unrefined full ash set, preset skills and full resources; correct valves; Canvas; one sample per route','runs':results}
 if os.environ.get('FORGE_BALANCE_OUTPUT'):
  with open(os.environ['FORGE_BALANCE_OUTPUT'],'w') as f:json.dump(report,f,ensure_ascii=False,indent=2)
 print(json.dumps(report,ensure_ascii=False))
asyncio.run(main())

"""Both forge routes, real map/puzzle/combat inputs and deterministic reward exchange.
Chapter completion, full +5 gear, skills and supplies are explicit initial save fixtures.
Canvas fallback avoids slow headless software WebGL. No combat damage/settlement injection.
"""
import asyncio,json,os,subprocess,time
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
F="window.__game.scene.getScene('AshForgeScene')"
B="window.__game.scene.getScene('TestRoomScene')"
KEY='rift-chronicles-save-v1'
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
  browser=await p.chromium.launch(args=['--no-sandbox','--disable-webgl'])
  results=[]
  for extra in [False,True]:
   page=await browser.new_page(viewport={'width':1280,'height':720});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(os.environ.get('GAME_URL','http://localhost:5173/'));await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
   if not extra:
    await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
    await page.keyboard.press('u');await page.wait_for_function(f'{O}.toast.text.includes("完成第二章")')
    assert await page.evaluate(f'{O}.scene.isActive()')
   await page.evaluate("([k,s])=>{localStorage.clear();localStorage.setItem(k,JSON.stringify(s))}",[KEY,fixture])
   await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
   await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
   await page.keyboard.press('u');await page.wait_for_function(f'{F}.scene.isActive()')
   await page.keyboard.press('e');await page.wait_for_function(f'{F}.session.forge.run?.current==="entry"')
   await page.keyboard.press('e');await page.wait_for_function(f'{F}.session.forge.run.current==="hall"')
   quests=await page.evaluate(f'JSON.stringify({F}.session.world.snapshot().quests)')
   async def move(room,x,y):
    # Wait for the new scene's interactive hit areas, not just its active flag.
    await page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    await page.mouse.click(x,y)
    try:
     await page.wait_for_function(f'{F}.session.forge.run.current==="{room}"')
    except Exception:
     print(await page.evaluate(f'({{run:{F}.session.forge.run,message:{F}.message.text}})'),errors,flush=True)
     raise
   async def fight(room):
    await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
    if room=='hall' and not extra:
     await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
     await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{F}.scene.isActive()')
     assert await page.evaluate(f'{F}.session.forge.run.current')=='hall'
     assert await page.evaluate(f'{F}.session.forge.run.cleared')==[]
     await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()')
    assert await page.evaluate(f'{B}.encounter.forge.room')==room
    if room=='boss':
     assert await page.evaluate(f'{B}.enemies[0].def.hp')==(800 if extra else 1000)
     assert await page.evaluate(f'{B}.enemies[0].def.attack')==43
     assert await page.evaluate(f'{B}.hazards.rule.name')=='余烬落火'
    started=time.monotonic();await page.keyboard.down('j')
    while not await page.evaluate(f'{B}.finished'):
     if time.monotonic()-started>70:raise AssertionError(f'room {room} fight exceeded budget')
     if await page.evaluate(f'{B}.playerActor.hp')<150:await page.keyboard.press('h')
     await page.keyboard.press('1');await page.keyboard.press('2');await page.keyboard.press('3');await page.wait_for_timeout(100)
    await page.keyboard.up('j');assert await page.evaluate(f'{B}.won'),room
    assert await page.evaluate(f'{B}.session.player.gold')==0
    assert await page.evaluate(f'{B}.session.player.exp')==0
    assert await page.evaluate(f'JSON.stringify({B}.session.world.snapshot().quests)')==quests
    assert not await page.evaluate(f"[...{B}.session.defeated].some(k=>k.startsWith('forge:'))")
    await page.wait_for_function(f'{B}.resultInputGate.ready');await page.keyboard.press('Space');await page.wait_for_function(f'{F}.scene.isActive()')
   await fight('hall')
   await move('valves',555,245)
   clue=await page.evaluate(f"{F}.children.list.find(o=>typeof o.text==='string'&&o.text.startsWith('检修铭文')).text.split('\\n')[0]")
   names=['赤铜','鎏金','青钢'];order=[names.index(x.strip())+1 for x in clue.split('：')[1].split('→')]
   await page.keyboard.press(str(order[1]));await page.wait_for_function(f'{F}.session.forge.run.pressure===1')
   await page.keyboard.press(str(order[0]));await page.wait_for_function(f'{F}.session.forge.run.valveStep===1')
   # Reload the partially solved puzzle; order, pressure and progress must survive.
   await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
   await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{F}.scene.isActive()')
   assert await page.evaluate(f'{F}.session.forge.run.pressure')==1
   assert await page.evaluate(f'{F}.session.forge.run.valveStep')==1
   for step,index in enumerate(order[1:],2):
    await page.keyboard.press(str(index));await page.wait_for_function(f'{F}.session.forge.run.valveStep==={step}')
   if extra:
    await move('cache',770,160);await fight('cache')
   await move('boss',985,245);await fight('boss')
   await move('exit',1160,245)
   if not extra:
    await page.evaluate("()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota fixture')}}")
   await page.keyboard.press('e');await page.wait_for_function(f'{F}.session.forge.run===null')
   assert await page.evaluate(f'{F}.session.forge.embers')==(5 if extra else 3)
   assert await page.evaluate(f'{F}.session.player.gold')==(180 if extra else 120)
   assert await page.evaluate(f'{F}.session.player.exp')==(360 if extra else 240)
   if not extra:
    assert '保存失败' in await page.evaluate(f'{F}.message.text')
    await page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem}')
    await page.keyboard.press('k');await page.wait_for_function(f'{F}.message.text.includes("已保存")')
   # A two-step targeted exchange must consume exactly three embers and grant one piece.
   await page.keyboard.press('1');await page.wait_for_function(f'{F}.pendingGear==="ash_sword"')
   assert await page.evaluate(f"{F}.session.world.getItemCount('ash_sword')")==0
   await page.keyboard.press('1');await page.wait_for_function(f"{F}.session.world.getItemCount('ash_sword')===1")
   assert await page.evaluate(f'{F}.session.forge.embers')==(2 if extra else 0)
   await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
   await page.keyboard.press('s');await page.keyboard.press('Enter');await page.wait_for_function(f'{O}.scene.isActive()')
   assert await page.evaluate(f'{O}.session.forge.clears')==1
   assert await page.evaluate(f"{O}.session.world.getItemCount('ash_sword')")==1
   assert await page.evaluate(f'{O}.session.forge.embers')==(2 if extra else 0)
   assert not errors,errors
   results.append({'elite_route':extra,'real_input_rooms':3 if extra else 2,'puzzle_reload':True,'cashout_exchange_reload':True,'errors':errors})
   await page.close()
  print(json.dumps({'ash_forge':'passed','routes':results,'explicit_chapter_and_gear_fixtures':True}))
  await browser.close()
asyncio.run(main())

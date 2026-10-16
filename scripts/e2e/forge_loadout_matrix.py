"""Budgeted Lv4 / legally learned fireball, low/mixed gear, consecutive attempts.
Explicit chapter-complete fixture, not a natural playthrough. No refill between attempts.
Deaths are observations, not test failures. Real room/puzzle/combat input only.
"""
import asyncio,json,os,subprocess,time
from playwright.async_api import async_playwright
F="window.__game.scene.getScene('AshForgeScene')"
B="window.__game.scene.getScene('TestRoomScene')"
SCRIPT="""
import {newSession,toSaveFile} from './src/state/session.ts';
import {loadGameData} from './src/data/loader.ts';
import {combatProfile} from './src/combat/profile.ts';
import {applyGains} from './src/state/rewards.ts';
import {buyItem} from './src/state/shop.ts';
import {createSkillTree,unlockSkill} from './src/skills/skillTree.ts';
import {equipItem} from './src/state/equipment.ts';
const d=loadGameData(),out={};for(const mixed of [false,true]){
 const s=newSession(d.quests);
 for(const id of ['main_01_first_rift','main_02_ash_road']){const q=d.quests.find(q=>q.id===id);s.world.setQuest(id,{status:'completed',progress:q.objectives.map(o=>o.count??1)});applyGains(s,{exp:q.rewards.exp??0,gold:q.rewards.gold??0,items:q.rewards.items??[]});}
 const ids=[mixed?'wild_blade':'iron_sword','leather_cap','leather_vest'];
 for(const id of ids){const item=d.items.find(i=>i.id===id);if(!buyItem(s,item,1).ok)throw new Error('budget');if(!equipItem(s,id,d.items,d.affixes,d.itemSets))throw new Error('equip');}
 for(const id of ['health_potion','mana_potion'])for(let i=0;i<(mixed?2:4);i++)if(!buyItem(s,d.items.find(i=>i.id===id),1).ok)throw new Error('potion budget');
 // Fireball is tier 1, one point, no prerequisites. Lv4 grants three points.
 const tree=createSkillTree(s.player.skills.points);unlockSkill(tree,d.skills.find(x=>x.id==='fireball'));s.player.skills={unlocked:[...tree.unlocked],points:tree.points,equipped:['fireball']};
 const p=combatProfile(s.player.equipment,d.items,d.affixes,d.itemSets);s.player.hp=p.maxHp;s.player.mana=p.maxMana;
 out[mixed?'mixed':'starter']=toSaveFile(s);
}console.log(JSON.stringify(out));
"""
async def run_route(page,extra):
 async def move(room,x,y):
  await page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  await page.mouse.click(x,y);await page.wait_for_function(f'{F}.session.forge.run.current==="{room}"')
 async def snapshot():
  return await page.evaluate(f"({{hp:{F}.session.player.hp,mana:{F}.session.player.mana,gold:{F}.session.player.gold,exp:{F}.session.player.exp,health:{F}.session.world.getItemCount('health_potion'),magic:{F}.session.world.getItemCount('mana_potion'),embers:{F}.session.forge.embers}})")
 before=await snapshot();rooms=[];start=time.monotonic()
 async def fight(room):
  await page.keyboard.press('e');await page.wait_for_function(f'{B}.scene.isActive()');t=time.monotonic();await page.keyboard.down('j')
  while not await page.evaluate(f'{B}.finished'):
   if time.monotonic()-t>150:raise AssertionError('combat input budget exceeded')
   hp,maxhp,mana=await page.evaluate(f'[{B}.playerActor.hp,{B}.stats.maxHp,{B}.runtime.mana]')
   if os.environ.get('FORGE_MATRIX_DODGE')=='1':
    danger=await page.evaluate(f'''() => {{const s={B};return s.runtime.dodgeCooldownMs===0&&s.runtime.stamina>=24&&s.enemies.some(e=>e.alive&&e.windup>0&&e.windup<220&&Math.hypot(s.px-e.aimX,s.py-e.aimY)<e.tactics.hitRadius+25)}}''')
    if danger:
     await page.keyboard.down('a');await page.keyboard.press('Space');await page.wait_for_timeout(35);await page.keyboard.up('a')
   if hp<maxhp*.65:await page.keyboard.press('h')
   if mana<20:await page.keyboard.press('m')
   await page.keyboard.press('1');await page.wait_for_timeout(120)
  await page.keyboard.up('j');won=await page.evaluate(f'{B}.won')
  rooms.append({'room':room,'won':won,'combat_seconds':round(await page.evaluate(f'{B}.runtime.elapsedMs/1000'),2)})
  assert await page.evaluate(f'{B}.session.player.gold')==before['gold']
  assert await page.evaluate(f'{B}.session.player.exp')==before['exp']
  await page.wait_for_function(f'{B}.resultInputGate.ready');await page.keyboard.press('Space');await page.wait_for_function(f'{F}.scene.isActive()');return won
 await page.keyboard.press('e');await page.wait_for_function(f'{F}.session.forge.run!==null')
 await page.keyboard.press('e');await page.wait_for_function(f'{F}.session.forge.run.current==="hall"');won=await fight('hall')
 if won:
  await move('valves',555,245)
  clue=await page.evaluate(f"{F}.children.list.find(o=>typeof o.text==='string'&&o.text.startsWith('检修铭文')).text.split('\\n')[0]")
  names=['赤铜','鎏金','青钢'];order=[names.index(x.strip())+1 for x in clue.split('：')[1].split('→')]
  for step,key in enumerate(order,1):await page.keyboard.press(str(key));await page.wait_for_function(f'{F}.session.forge.run.valveStep==={step}')
  if extra:await move('cache',770,160);won=await fight('cache')
  if won:await move('boss',985,245);won=await fight('boss')
  if won:await move('exit',1160,245);await page.keyboard.press('e');await page.wait_for_function(f'{F}.session.forge.run===null')
 after=await snapshot();hp=before['health']-after['health'];mp=before['magic']-after['magic'];gold=after['gold']-before['gold']
 assert gold==((180 if extra else 120) if won else 0)
 assert after['embers']-before['embers']==((5 if extra else 3) if won else 0)
 return {'elite_route':extra,'won':won,'wall_seconds':round(time.monotonic()-start,2),'rooms':rooms,'before':before,'after':after,'health_used':hp,'mana_used':mp,'gold_delta':gold,'potion_replacement_cost':hp*18+mp*15,'gold_minus_used_potion_cost':gold-hp*18-mp*15,'reactive_dodge':os.environ.get('FORGE_MATRIX_DODGE')=='1'}
async def main():
 fixtures=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',SCRIPT],text=True));results=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(args=['--no-sandbox','--disable-webgl'])
  for name,fixture in fixtures.items():
   for extra in [False,True]:
    page=await browser.new_page(viewport={'width':1280,'height':720});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    await page.goto(os.environ.get('GAME_URL','http://localhost:5173'));await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
    await page.evaluate("s=>localStorage.setItem('rift-chronicles-save-v1',JSON.stringify(s))",fixture)
    await page.reload();await page.wait_for_function("window.__game?.scene.isActive('TitleScene')");await page.keyboard.press('s');await page.wait_for_function("window.__game.scene.getScene('TitleScene').selected===1");await page.keyboard.press('Enter');await page.wait_for_function("window.__game?.scene.isActive('OverworldScene')")
    await page.keyboard.press('u');await page.wait_for_function(f'{F}.scene.isActive()')
    for attempt in range(1,int(os.environ.get('FORGE_MATRIX_ATTEMPTS','2'))+1):
     run=await run_route(page,extra);run.update({'loadout':name,'attempt':attempt});results.append(run);print(json.dumps(run,ensure_ascii=False),flush=True)
    assert not errors,errors;await page.close()
  await browser.close()
 report={'fixture':'Two main quest rewards only (800XP/320gold), actual shop transactions; Lv4, one legal fireball, starter/mixed gear; each route starts full; consecutive attempts carry HP/mana/potions/cooldown; no refill. Auto-approach J plus fireball; reactive_dodge field identifies optional real A+Space enemy-windup dodging. NOT natural exploration or optimal play. Canvas.','runs':results}
 if os.environ.get('FORGE_MATRIX_OUTPUT'):
  with open(os.environ['FORGE_MATRIX_OUTPUT'],'w') as f:json.dump(report,f,ensure_ascii=False,indent=2)
 print(json.dumps({'matrix':'completed','runs':len(results),'wins':sum(r['won'] for r in results)}))
if __name__=='__main__':asyncio.run(main())

"""Dungeon checkpoint browser integration. Real gate, graph navigation and interactions.
Fixtures: teleport to gate; battle enemy HP/positions/cooldowns; unsaved mid-fight state;
forced death; intentional primary-save corruption. Not a campaign balance test."""
import asyncio,json,os
from collections import deque
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
D="window.__game.scene.getScene('DungeonScene')"
C="window.__game.scene.getScene('TestRoomScene')"
KEY='rift-chronicles-save-v1'
GATE=json.load(open(os.path.join(os.path.dirname(__file__),'gate.json')))
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(args=['--no-sandbox']);pg=await b.new_page(viewport={'width':1280,'height':720});errors=[]
  pg.on('pageerror',lambda e:errors.append(str(e)))
  async def active(name):await pg.wait_for_function(f"window.__game?.scene.isActive('{name}')")
  async def reload_continue(name):
   await pg.reload();await active('TitleScene');await pg.keyboard.press('s');await pg.keyboard.press('Enter');await active(name)
  async def enter_gate(teleport=False):
   if teleport:await pg.evaluate(f"const s={O};s.tileX={GATE['x']};s.tileY={GATE['y']};s.player.setPosition(s.tileX*16,s.tileY*16)")
   await pg.keyboard.press('e');await active('DungeonScene')
  async def travel(kind):
   state=await pg.evaluate(f"({{current:{D}.run.current,layout:{D}.run.layout}})")
   rooms=state['layout']['rooms'];target=next(r['id'] for r in rooms if r['kind']==kind)
   adj={r['id']:[] for r in rooms}
   for a,c in state['layout']['edges']:adj[a].append(c);adj[c].append(a)
   for v in adj.values():v.sort()
   q=deque([(state['current'],[])]);seen={state['current']};path=[]
   while q:
    node,route=q.popleft()
    if node==target:path=route;break
    for neighbor in adj[node]:
     if neighbor not in seen:seen.add(neighbor);q.append((neighbor,route+[neighbor]))
   current=state['current']
   for room in path:
    await pg.keyboard.press(str(adj[current].index(room)+1));await pg.wait_for_function(f'{D}.run.current==={room}');current=room
   return target
  async def win_current():
   await pg.keyboard.press('e');await active('TestRoomScene')
   await pg.evaluate(f"const s={C};s.enemies.forEach((e,i)=>{{e.actor.hp=1;e.x=s.px+35+i*5;e.y=s.py;e.brain.attackCooldownMs=999999;}});s.facing={{x:1,y:0}}")
   await pg.keyboard.down('j');await pg.wait_for_function(f'{C}.finished');await pg.keyboard.up('j')
   assert await pg.evaluate(f'{C}.won')
  await pg.goto('http://localhost:5173');await active('TitleScene');await pg.keyboard.press('Enter');await active('OverworldScene');await enter_gate(True)
  chest=await travel('chest');await pg.keyboard.press('e');await pg.wait_for_function(f'{D}.run.cleared.has({chest})')
  gold=await pg.evaluate(f'{D}.session.player.gold');shards=await pg.evaluate(f"{D}.session.world.getItemCount('rift_shard')");layout=await pg.evaluate(f'{D}.run.layout')
  assert gold==15 and shards==1
  await reload_continue('DungeonScene');assert await pg.evaluate(f'{D}.run.current')==chest;assert await pg.evaluate(f'{D}.run.layout')==layout
  await pg.keyboard.press('e');await pg.wait_for_timeout(150);assert await pg.evaluate(f'{D}.session.player.gold')==gold;assert await pg.evaluate(f"{D}.session.world.getItemCount('rift_shard')")==shards
  await pg.keyboard.press('l');await active('OverworldScene');await enter_gate();assert await pg.evaluate(f'{D}.run.current')==chest
  await pg.keyboard.press('e');assert await pg.evaluate(f'{D}.session.player.gold')==gold
  rest=await travel('rest');await pg.evaluate(f'{D}.session.player.hp=50;{D}.session.player.mana=0');await pg.keyboard.press('e');await pg.wait_for_function(f'{D}.run.cleared.has({rest})')
  assert await pg.evaluate(f'{D}.session.player.hp')==80
  await reload_continue('DungeonScene');await pg.keyboard.press('e');assert await pg.evaluate(f'{D}.session.player.hp')==80
  combat=await travel('combat');before=await pg.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")
  await pg.keyboard.press('e');await active('TestRoomScene')
  await pg.evaluate(f'{C}.session.player.gold+=9999;{C}.playerActor.hp=1;{C}.runtime.mana=0')
  await reload_continue('DungeonScene');assert await pg.evaluate(f'{D}.run.current')==combat;assert not await pg.evaluate(f'{D}.run.cleared.has({combat})');assert await pg.evaluate(f'{D}.session.player.gold')==before['player']['gold'];assert await pg.evaluate(f'{D}.session.player.hp')==before['player']['hp']
  # Quota failures must block departures, keep the active run, and support manual retry.
  await pg.evaluate("() => {window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('rift-chronicles-save-v1'))throw new DOMException('quota','QuotaExceededError');return window.__setItem.call(this,k,v)};}")
  await pg.keyboard.press('e');await pg.wait_for_function(f"{D}.message.text.includes('保存失败')")
  assert await pg.evaluate(f'{D}.scene.isActive()')
  await pg.keyboard.press('l');await pg.wait_for_timeout(180)
  assert await pg.evaluate(f'{D}.scene.isActive() && {D}.session.dungeon.activeFloor==={D}.run.floor')
  await pg.evaluate('()=>{Storage.prototype.setItem=window.__setItem;}')
  await pg.mouse.click(770,674);await pg.wait_for_function(f"{D}.message.text.includes('进度已保存')")
  await win_current();earned=await pg.evaluate(f'{C}.session.player.gold');await reload_continue('DungeonScene')
  assert await pg.evaluate(f'{D}.run.cleared.has({combat})');await pg.keyboard.press('e');assert await pg.evaluate(f'{D}.session.player.gold')==earned
  await travel('boss');await win_current();boss_gold=await pg.evaluate(f'{C}.session.player.gold');await reload_continue('DungeonScene')
  assert await pg.evaluate(f'{D}.run.finished && {D}.session.dungeonFloor===2');await pg.keyboard.press('e');assert await pg.evaluate(f'{D}.session.player.gold')==boss_gold
  await pg.keyboard.press('l');await active('OverworldScene');await enter_gate();assert await pg.evaluate(f'{D}.run.floor')==2;assert await pg.evaluate(f'{D}.session.dungeon.runs.length')==2
  await pg.screenshot(path='/home/user/review-shots/dungeon-checkpoint.png')
  # Save one move so the backup contains an active floor-2 checkpoint.
  next_id=await pg.evaluate(f"{D}.run.layout.edges.filter(([a,b])=>a==={D}.run.current||b==={D}.run.current).map(([a,b])=>a==={D}.run.current?b:a).sort((a,b)=>a-b)[0]")
  await pg.keyboard.press('1');await pg.wait_for_function(f'{D}.run.current==={next_id}')
  backup=await pg.evaluate(f"JSON.parse(localStorage.getItem('{KEY}-backup'))");await pg.evaluate(f"localStorage.setItem('{KEY}','{{broken')")
  await pg.reload();await active('TitleScene');assert await pg.evaluate("window.__game.scene.getScene('TitleScene').message.text.includes('备份')")
  await pg.screenshot(path='/home/user/review-shots/save-backup-recovery.png')
  await pg.keyboard.press('s');await pg.keyboard.press('Enter');await active('DungeonScene')
  assert await pg.evaluate(f'{D}.run.current')==backup['dungeon']['runs'][-1]['current'];assert await pg.evaluate(f'{D}.session.player.gold')==backup['player']['gold']
  # New game must discard the other character's in-memory active run.
  await pg.evaluate(f"{D}.scene.start('TitleScene')");await active('TitleScene');await pg.keyboard.press('Enter')
  await pg.wait_for_function("window.__game.scene.getScene('TitleScene').newGamePrompt !== null")
  await pg.keyboard.press('y');await active('OverworldScene');await enter_gate(True)
  assert await pg.evaluate(f'{D}.run.floor===1 && {D}.run.cleared.size===0')
  chest=await travel('chest');await pg.keyboard.press('e');await pg.wait_for_function(f'{D}.run.cleared.has({chest})')
  await travel('combat');await pg.keyboard.press('e');await active('TestRoomScene');await pg.evaluate(f'{C}.playerActor.hp=0');await pg.wait_for_function(f'{C}.finished')
  assert not await pg.evaluate(f'{C}.won');await reload_continue('OverworldScene');await enter_gate()
  assert await pg.evaluate(f'{D}.run.current===0 && {D}.run.cleared.has({chest})')
  assert not errors,errors
  print('PASS: real graph/chest/rest claims, reload+leave/re-enter, pre-fight rollback, real combat/Boss settlement+immediate reload, floor archive/unlock, corrupt-primary backup recovery, storage-failure blocking/manual retry, fresh character isolation, defeat retains claims at entrance; no page errors')
  await b.close()
asyncio.run(main())

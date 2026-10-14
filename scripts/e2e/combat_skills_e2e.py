"""Combat integration: learn/bind via real input, cast/combos/statuses, settle once, reload.
Fixture injections: skill points/gold; encounter selection; target positions/hp; enemy cooldowns
(to isolate skill tests). Damage, resources, kills, rewards and save/continue use game code.
This is not a complete no-injection campaign playthrough.
"""
import asyncio
from playwright.async_api import async_playwright
O="window.__game.scene.getScene('OverworldScene')"
C="window.__game.scene.getScene('TestRoomScene')"
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(args=['--no-sandbox'])
  pg=await b.new_page(viewport={'width':1280,'height':720});errors=[]
  pg.on('pageerror',lambda e:errors.append(str(e)))
  await pg.goto('http://localhost:5173');await pg.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await pg.keyboard.press('Enter');await pg.wait_for_function(f'{O}.scene.isActive()')
  await pg.evaluate(f'{O}.session.player.skills.points=50;{O}.session.player.gold=1000')
  await pg.keyboard.press('g');await pg.wait_for_function(f'{O}.skillPanelOpen')
  async def branch(name):
   while await pg.evaluate(f'{O}.currentBranch()')!=name:
    await pg.keyboard.press('b');await pg.wait_for_timeout(160)
  async def learn(id):
   idx=await pg.evaluate(f"{O}.skillPageItems().findIndex(s=>s.id==='{id}')")
   assert idx>=0,id
   await pg.keyboard.press(str(idx+1));await pg.wait_for_function(f"{O}.session.player.skills.unlocked.includes('{id}')")
  await branch('arcane');await learn('fireball')
  await branch('survival');await learn('first_aid')
  await branch('martial');await learn('guard_stance');await learn('armor_break')
  assert await pg.evaluate(f"{O}.session.player.skills.equipped.join(',')==='fireball,first_aid,guard_stance,armor_break'")
  await pg.screenshot(path='/home/user/review-shots/skills-combat-ready.png')
  await pg.keyboard.press('Escape');await pg.wait_for_function(f'!{O}.anyPanel()')
  await pg.evaluate(f"{O}.scene.start('TestRoomScene',{{encounter:{{enemyIds:['moss_golem','ash_wolf'],spawnKey:'e2e-skills'}}}})")
  await pg.wait_for_function(f'{C}.scene.isActive()')
  await pg.evaluate(f"const s={C};s.enemies[0].x=s.px+55;s.enemies[0].y=s.py;s.enemies[1].x=1000;s.enemies[1].y=400;for(const e of s.enemies)e.brain.attackCooldownMs=999999;")
  hp=await pg.evaluate(f'{C}.enemies[0].actor.hp')
  await pg.keyboard.press('1');await pg.wait_for_function(f"{C}.runtime.cooldowns.get('fireball')>0")
  assert await pg.evaluate(f'{C}.enemies[0].actor.hp')<hp
  assert await pg.evaluate(f'{C}.runtime.mana')<80
  await pg.wait_for_function(f'{C}.runtime.globalCooldownMs===0')
  await pg.keyboard.press('4');await pg.wait_for_function(f"{C}.runtime.lastCombo==='熔融'")
  assert await pg.evaluate(f'{C}.runtime.status({C}.enemies[0].combat).shred')==10
  await pg.wait_for_function(f'{C}.runtime.globalCooldownMs===0')
  await pg.evaluate(f'{C}.playerActor.hp=10')
  await pg.keyboard.press('2');await pg.wait_for_function(f'{C}.playerActor.hp>=35')
  await pg.screenshot(path='/home/user/review-shots/combat-skills.png')
  # Real attacks must issue kill rewards and close the encounter exactly once.
  await pg.wait_for_function(f'{C}.runtime.globalCooldownMs===0')
  gold=await pg.evaluate(f'{C}.session.player.gold')
  await pg.evaluate(f"const s={C};s.facing={{x:1,y:0}};s.enemies.forEach((e,i)=>{{e.actor.hp=1;e.x=s.px+40+i*8;e.y=s.py;}})")
  await pg.keyboard.down('j');await pg.wait_for_function(f'{C}.finished');await pg.keyboard.up('j')
  gold_after=await pg.evaluate(f'{C}.session.player.gold');assert gold_after==gold+12,(gold,gold_after)
  await pg.evaluate(f'{C}.finishEncounter(true)')
  assert await pg.evaluate(f'{C}.session.player.gold')==gold_after
  # Reload before dismissing victory: settled progress must already be durable.
  await pg.reload();await pg.wait_for_function("window.__game?.scene.isActive('TitleScene')")
  await pg.keyboard.press('s');await pg.keyboard.press('Enter');await pg.wait_for_function(f'{O}.scene.isActive()')
  assert await pg.evaluate(f"{O}.session.defeated.has('e2e-skills')")
  assert await pg.evaluate(f'{O}.session.player.gold')==gold_after
  assert await pg.evaluate(f'{O}.session.player.skills.equipped.length')==4
  # Independent ranged encounter: lock-on telegraph can be escaped by moving.
  await pg.evaluate(f"{O}.scene.start('TestRoomScene',{{encounter:{{enemyIds:['ash_crow'],spawnKey:'e2e-ranged'}}}})")
  await pg.wait_for_function(f'{C}.scene.isActive()')
  await pg.evaluate(f'const s={C};s.px=500;s.py=360;s.enemies[0].x=700;s.enemies[0].y=360;s.enemies[0].brain.attackCooldownMs=0;')
  await pg.wait_for_function(f'{C}.enemies[0].windup>0')
  hp=await pg.evaluate(f'{C}.playerActor.hp')
  await pg.keyboard.down('w');await pg.wait_for_function(f'{C}.py<270');await pg.keyboard.up('w')
  await pg.wait_for_function(f'{C}.enemies[0].windup===0')
  assert await pg.evaluate(f'{C}.playerActor.hp')==hp
  assert not errors,errors
  print('PASS: real learning/loadout, fireball damage+mana+cooldown, molten armor shred, first aid, real kills, once-only settlement, victory autosave/reload, ranged telegraph evasion; no page errors')
  await b.close()
asyncio.run(main())

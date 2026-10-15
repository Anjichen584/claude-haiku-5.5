"""NPC spacing, actual E targeting, label overlap and saved-position compatibility.
Run with dev server on localhost:5173 and Playwright Chromium installed.
"""
import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--no-sandbox'])
        page = await browser.new_page(viewport={'width':1280,'height':720})
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto('http://localhost:5173/')
        await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
        await page.wait_for_timeout(400)
        await page.keyboard.press('Enter')
        await page.wait_for_function("window.__game.scene.isActive('OverworldScene')")
        result=await page.evaluate("""() => {
            const s=window.__game.scene.getScene('OverworldScene');
            const npcs=[...s.npcPositions.values()];
            let minimum=Infinity;
            for(let i=0;i<npcs.length;i++) for(let j=i+1;j<npcs.length;j++)
                minimum=Math.min(minimum,Math.hypot(npcs[i].x-npcs[j].x,npcs[i].y-npcs[j].y));
            for(const npc of npcs) {
                s.tileX=npc.x;s.tileY=npc.y;
                if(s.nearestNpcId()!==npc.id) throw Error('unreachable NPC '+npc.id);
            }
            const captain=s.npcTile('ashguard_captain');
            s.tileX=captain.x;s.tileY=captain.y;
            s.player.setPosition(captain.x*16,captain.y*16);s.syncChunks();s.graceMs=100000;
            return {count:npcs.length,minimum};
        }""")
        assert result['count']==116 and result['minimum']>=6, result
        await page.wait_for_timeout(1600)
        assert await page.evaluate("""() => {
            const s=window.__game.scene.getScene('OverworldScene');
            const labels=[...s.npcLabels.values()].filter(x=>x.visible);
            if(!s.npcLabels.get('ashguard_captain').visible || !s.npcHighlights.get('ashguard_captain').visible) return false;
            for(let i=0;i<labels.length;i++) for(let j=i+1;j<labels.length;j++) {
                const a=labels[i].getBounds(),b=labels[j].getBounds();
                if(a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top) return false;
            }
            return s.contextHint.text.includes('守望队长');
        }"""), 'selected name/hint or label separation failed'
        if os.environ.get('NPC_SCREENSHOT'):
            target=Path(os.environ['NPC_SCREENSHOT']);target.parent.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(target))
        # First E accepts quests; second E must talk to the selected character, not a neighbor.
        await page.keyboard.press('e')
        await page.wait_for_timeout(120)
        await page.keyboard.press('e')
        await page.wait_for_timeout(200)
        assert await page.evaluate("window.__game.scene.getScene('OverworldScene').talk?.npcId === 'ashguard_captain'"), 'E selected a different NPC'
        await page.evaluate("""() => {
            const s=window.__game.scene.getScene('OverworldScene');
            s.talk=null;s.closePanels();s.saveGame();
        }""")
        await page.reload()
        await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
        await page.wait_for_timeout(400)
        await page.keyboard.press('s');await page.keyboard.press('Enter')
        await page.wait_for_function("window.__game.scene.isActive('OverworldScene')")
        assert await page.evaluate("""() => {
            const s=window.__game.scene.getScene('OverworldScene'),n=s.npcTile('ashguard_captain');
            return Math.hypot(s.tileX-n.x,s.tileY-n.y)<.01 && s.nearestNpcId()==='ashguard_captain';
        }"""), 'save/reload changed layout or player position'
        assert not errors, errors
        print('PASS:',result,'all NPCs targetable, labels separated, real E talks to captain, save/reload stable; no page errors')
        await browser.close()

asyncio.run(main())

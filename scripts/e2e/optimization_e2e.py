"""Requires dev server on port 5173 and Playwright Chromium."""
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--no-sandbox'])
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto('http://localhost:5173/')
        await page.wait_for_function("window.__game?.scene.isActive('TitleScene')")
        await page.wait_for_timeout(400)
        await page.keyboard.press('Enter')
        await page.wait_for_function("window.__game.scene.isActive('OverworldScene')")
        await page.evaluate("""() => {
            const s = window.__game.scene.getScene('OverworldScene');
            s.session.player.skills.points = 5;
            s.toggleSkillPanel();
            window.__card = s.cards.root.list[0];
            window.__slot = s.loadoutUI.list[0];
        }""")
        await page.wait_for_timeout(1200)
        assert await page.evaluate("""() => {
            const s = window.__game.scene.getScene('OverworldScene');
            return s.cards.root.list[0] === window.__card && s.loadoutUI.list[0] === window.__slot;
        }"""), 'unchanged cards/slots were recreated'
        await page.evaluate("""() => {
            const s = window.__game.scene.getScene('OverworldScene');
            window.__setItem = Storage.prototype.setItem;
            Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
            s.learnSkill(0);
        }""")
        assert await page.evaluate("window.__game.scene.getScene('OverworldScene').saveWarning.visible"), 'missing save failure warning'
        await page.evaluate("""() => {
            Storage.prototype.setItem = window.__setItem;
            window.__game.scene.getScene('OverworldScene').saveGame();
        }""")
        assert not await page.evaluate("window.__game.scene.getScene('OverworldScene').saveWarning.visible"), 'save recovery did not clear warning'
        assert not errors, errors
        print('PASS: retained cards/slots, failed autosave warning, successful retry; no page errors')
        await browser.close()

asyncio.run(main())

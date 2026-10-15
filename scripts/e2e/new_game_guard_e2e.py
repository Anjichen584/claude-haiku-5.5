"""Real keyboard/mouse regression: existing saves require explicit new-game consent.
Requires dev server on localhost:5173 and Playwright Chromium.
"""
import asyncio
import os
from playwright.async_api import async_playwright

T = "window.__game.scene.getScene('TitleScene')"
O = "window.__game.scene.getScene('OverworldScene')"
KEY = 'rift-chronicles-save-v1'

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--no-sandbox'])
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(os.environ.get('GAME_URL', 'http://localhost:5173/'))
        await page.wait_for_function(f'{T}.scene.isActive()')
        await page.wait_for_timeout(250)
        await page.keyboard.press('Enter')
        await page.wait_for_function(f'{O}.scene.isActive()')
        await page.keyboard.press('k')
        await page.wait_for_function(f"localStorage.getItem('{KEY}') !== null")
        original = await page.evaluate(f"localStorage.getItem('{KEY}')")

        async def title():
            await page.reload()
            await page.wait_for_function(f'{T}.scene.isActive()')
            await page.wait_for_timeout(250)

        for cancel in ['Escape', 'n']:
            await title()
            await page.keyboard.press('Enter')
            await page.wait_for_function(f'{T}.newGamePrompt !== null')
            # Repeated confirmation/menu keys must not dismiss or accept the warning.
            for key in ['Enter', 'Space', 's']:
                await page.keyboard.press(key)
            assert await page.evaluate(f'{T}.scene.isActive() && {T}.newGamePrompt !== null')
            assert await page.evaluate(f"localStorage.getItem('{KEY}')") == original
            await page.keyboard.press(cancel)
            await page.wait_for_function(f'{T}.newGamePrompt === null')
            await page.keyboard.press('s')
            await page.keyboard.press('Enter')
            await page.wait_for_function(f'{O}.scene.isActive()')

        await title()
        await page.mouse.click(200, 418)
        await page.wait_for_function(f'{T}.newGamePrompt !== null')
        await page.mouse.click(770, 424)
        await page.wait_for_function(f'{T}.newGamePrompt === null')
        await page.mouse.click(200, 418)
        await page.wait_for_function(f'{T}.newGamePrompt !== null')
        await page.mouse.click(450, 424)
        await page.wait_for_function(f'{O}.scene.isActive()')

        # Even a corrupt saved payload must not be silently replaced.
        await page.evaluate(f"localStorage.setItem('{KEY}', 'broken'); localStorage.removeItem('{KEY}-backup')")
        await title()
        await page.keyboard.press('Enter')
        await page.wait_for_function(f'{T}.newGamePrompt !== null')
        assert await page.evaluate(f"localStorage.getItem('{KEY}')") == 'broken'
        await page.keyboard.press('y')
        await page.wait_for_function(f'{O}.scene.isActive()')
        assert not errors, errors
        print('PASS: fresh start, existing/corrupt save guard, repeated-key safety, keyboard/mouse cancellation and confirmation, continue; no page errors')
        await browser.close()

asyncio.run(main())

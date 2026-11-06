import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@colyseus/sdk';
import { chromium } from 'playwright-core';
import { createGameServer } from '../../dist/app.js';

const results = new URL('../../../../test-results/', import.meta.url);
const landscape = { width: 844, height: 390 };

test(
  'production host and phone show the correct teams in a full session',
  { timeout: 90_000 },
  async (t) => {
    process.env.NODE_ENV = 'production';
    const { gameServer, httpServer } = createGameServer();
    await gameServer.listen(0, '127.0.0.1');
    t.after(() => gameServer.gracefullyShutdown(false));
    const port = httpServer.address().port;
    const browser = await chromium.launch({
      channel: process.env.CHROME_BIN ? undefined : 'chrome',
      executablePath: process.env.CHROME_BIN,
      args: [
        '--disable-webgl',
        '--no-proxy-server',
        '--host-resolver-rules=MAP escape.test 127.0.0.1',
      ],
    });
    t.after(() => browser.close());
    const errors = [];
    async function page(viewport) {
      const page = await browser.newPage({ viewport });
      page.on('pageerror', (error) => errors.push(error.message));
      return page;
    }
    const host = await page({ width: 1600, height: 900 });
    await host.goto(`http://escape.test:${port}`);
    await host.getByRole('button', { name: 'Create Game' }).click();
    await host.getByRole('img', { name: /Scan to join game/ }).waitFor();
    const join = await host.getByLabel('Player join link').inputValue();
    const code = new URL(join).pathname.split('/').pop();
    const phone = await page(landscape);
    await phone.goto(join);
    await phone.getByLabel('Your nickname').fill('Nick');
    await phone.locator('form button[type=submit]').click();
    await phone
      .getByText('You will be automatically assigned to one of two teams when the game starts.')
      .waitFor();

    const sdk = new Client(`ws://127.0.0.1:${port}`);
    const names = [
      'Lily',
      'Mike',
      'Moss',
      'Ember',
      'Kai',
      'Lark',
      'Finn',
      'Piper',
      'Iris',
      'Cleo',
      'Milo',
      'Juno',
      'Basil',
      'Jade',
      'Lux',
      'Leo',
      'Reed',
      'Ash',
      'Tess',
    ];
    const peers = await Promise.all(
      names.map((nickname) => sdk.joinById(code, { role: 'player', nickname })),
    );
    for (const peer of peers) peer.reconnection.enabled = false;
    await host.locator('.crew-heading').getByText('20', { exact: true }).waitFor();
    await host.getByRole('button', { name: 'Start Game' }).click();

    async function checkOverview() {
      await host.locator('canvas').waitFor();
      await host.getByText('10 / 10 online', { exact: true }).nth(1).waitFor();
      assert.equal(await host.locator('.team-status .legend > span').count(), 20);
      assert.match(await host.locator('.connected-count').innerText(), /20\s+players online/);
    }
    await checkOverview();
    const canvas = phone.locator('canvas');
    await canvas.waitFor();
    const badge = await phone.locator('.team-badge').innerText();
    assert.match(badge, /Team ([AB])\s*·\s*Room \1/i);
    const mate = peers.find((r) =>
      [...r.state.players.values()].some((p) => p.nickname === 'Nick'),
    );
    assert.ok(mate);
    const me = [...mate.state.players.values()].find((p) => p.nickname === 'Nick');
    const origin = { x: me.x, y: me.y };
    // The controls scene is active once Phaser has painted the joystick.
    await phone.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      const sample = canvas?.getContext('2d')?.getImageData(100, canvas.height - 100, 1, 1).data;
      return sample && sample[0] > 90;
    });
    await phone.bringToFront();
    const box = await canvas.boundingBox();
    const x = box.x + 96,
      y = box.y + box.height - 90;
    await phone.mouse.move(x, y);
    await phone.mouse.down();
    await phone.mouse.move(x + 52, y, { steps: 5 });
    try {
      for (let i = 0; i < 30 && Math.hypot(me.x - origin.x, me.y - origin.y) < 12; i++)
        await delay(50);
      assert.ok(
        Math.hypot(me.x - origin.x, me.y - origin.y) >= 12,
        'A teammate receives joystick movement',
      );
    } finally {
      await phone.mouse.up();
    }
    await mkdir(results, { recursive: true });
    await phone.screenshot({ path: new URL('phone-landscape.png', results).pathname });
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.locator('.rotate-overlay').waitFor();
    await phone.setViewportSize(landscape);
    await phone.reload();
    await phone.locator('canvas').waitFor();
    assert.equal(await phone.locator('.team-badge').innerText(), badge);
    await host.reload();
    await checkOverview();
    await host.bringToFront();
    await host.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas || !canvas.width || !canvas.height) return false;
      // Sample both sides of the overview; individual pixels may land on dark labels or grout.
      const thumbnail = document.createElement('canvas');
      thumbnail.width = 24;
      thumbnail.height = 12;
      const context = thumbnail.getContext('2d');
      context.drawImage(canvas, 0, 0, 24, 12);
      const pixels = context.getImageData(0, 0, 24, 12).data;
      let blue = 0,
        orange = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 2] - pixels[i] > 18) blue++;
        if (pixels[i] - pixels[i + 2] > 18) orange++;
      }
      return blue > 4 && orange > 4;
    });
    await host.screenshot({ path: new URL('host-overview.png', results).pathname });
    assert.deepEqual(errors, []);
    await host.getByRole('button', { name: 'End game' }).click();
  },
);

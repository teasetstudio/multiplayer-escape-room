import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@colyseus/sdk';
import { chromium } from 'playwright-core';
import { Driver, attach, until } from '../support/driver.ts';

// Real Scripture text when the licensed dataset is installed; otherwise the labelled placeholder.
const dataset = new URL('../../content/scripture/proverbs-4.lit-tpv.json', import.meta.url);
process.env.SCRIPTURE_DATASET ??= existsSync(dataset) ? 'lit-tpv' : 'fixture';
process.env.GAME_SEED = 'browser-adventure';
process.env.TRANSITION_MS = '900';
process.env.NODE_ENV = 'production';
const { createGameServer } = await import('../../dist/app.js');
const { sessions } = await import('../../dist/rooms/GameRoom.js');

const results = new URL('../../../../test-results/', import.meta.url);
const shot = (page, name) => page.screenshot({ path: new URL(`${name}.png`, results).pathname });

test(
  'a phone plays the real Phaser game: chamber, cabinet, verse, locked exit, final board, victory',
  { timeout: 180_000 },
  async (t) => {
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
    async function open(viewport) {
      const page = await browser.newPage({ viewport });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      return page;
    }
    await mkdir(results, { recursive: true });
    const host = await open({ width: 1600, height: 900 });
    await host.goto(`http://escape.test:${port}`);
    await host.getByRole('button', { name: 'Create Game' }).click();
    await host.getByRole('img', { name: /Scan to join game/ }).waitFor();
    const join = await host.getByLabel('Player join link').inputValue();
    const code = new URL(join).pathname.split('/').pop();
    const phone = await open({ width: 844, height: 390 });
    await phone.goto(join);
    await phone.getByLabel('Your nickname').fill('Nick');
    await phone.locator('form button[type=submit]').click();
    await phone.getByText('You will be automatically assigned').waitFor();

    const sdk = new Client(`ws://127.0.0.1:${port}`);
    const bots = [];
    for (const name of ['Lily', 'Mike', 'Moss'])
      bots.push(attach(await sdk.joinById(code, { role: 'player', nickname: name }), name));
    const server = sessions.get(code);
    await until(() => server.state.players.size === 4, 'Four players in the lobby');
    await host.getByText('4 players ready to explore').waitFor();
    await host.getByRole('button', { name: 'Start Game' }).click();

    const driver = new Driver(server, bots);
    const state = server.state;
    await until(() => state.status === 'playing', 'Game starts');
    const nick = [...state.players.values()].find((player) => player.nickname === 'Nick');
    const team = nick.teamId;
    const runtime = server.inspection.runtime.get(nick.id);
    const me = { name: 'Nick' }; // lets the driver place the browser-controlled character
    const action = phone.locator('.action-button');
    const settle = () => delay(500);

    // ── Public map with comic art, quest HUD on both screens ─────────────────────────────
    await phone.locator('canvas').waitFor();
    await phone.getByText('LEVEL 1 / 5 · THE SECRET CODE').waitFor();
    await host.getByText('THE SECRET CODE', { exact: true }).waitFor();
    await host.getByText('Adventure total: 0 / 27').waitFor();
    await phone.waitForFunction(() => {
      // Art has loaded and the world is painted: the canvas is not one flat colour.
      const canvas = document.querySelector('canvas');
      const data = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!data) return false;
      const colours = new Set();
      for (let i = 0; i < data.length; i += 4 * 997)
        colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return colours.size > 40;
    });
    await settle();
    await shot(phone, 'adventure-01-public-map');
    await shot(host, 'adventure-02-host-overview');

    // ── Hidden entrance: a subtle prompt, discovery, then the way in ─────────────────────
    const area = server.inspection.level.secrets.areas[team];
    driver.stand(me, driver.target(me, area.entranceObjectId).rect);
    await action.getByText('Take a closer look').waitFor();
    await phone.locator('.action-hint').waitFor();
    await settle();
    await shot(phone, 'adventure-03-hidden-entrance');
    await action.click();
    await action.getByText('Enter the hidden passage').waitFor();
    await action.click();
    await phone.getByText(`${area.name.toUpperCase()} · A SECRET PLACE`).waitFor();
    await until(() => runtime.area === area.id, 'Server agrees the phone is inside');
    await settle();
    await shot(phone, 'adventure-04-hidden-room');
    // The big screen shows only a roster status — never the chamber.
    await host.getByText('Exploring: Nick').waitFor();
    await host.getByText('Nick (exploring)').waitFor();
    assert.equal(await host.getByText(area.name).count(), 0);
    await shot(host, 'adventure-05-host-while-exploring');

    // ── Cabinet / scroll → Scripture card → collection counter ───────────────────────────
    const verse = driver.levelItems('verse', team).find((item) => item.area === area.id);
    const holder = verse.container ?? verse.id;
    driver.stand(me, driver.target(me, holder).rect);
    await action.waitFor();
    await settle();
    await shot(phone, 'adventure-06-cabinet-prompt');
    await action.click();
    const card = phone.locator('.verse-card');
    await card.waitFor();
    assert.equal((await card.locator('p').innerText()).trim(), verse.text);
    assert.doesNotMatch(await phone.locator('.parchment').innerText(), /\b4:\d+|Sample \d/);
    await shot(phone, 'adventure-07-verse-card');
    await phone.getByRole('button', { name: 'Collect this Wisdom fragment' }).click();
    await until(() => verse.collectedBy === nick.id, 'The browser player collected the verse');
    // A scroll panel closes itself; an emptied cabinet says so and is closed by the player.
    await phone.locator('.verse-card').waitFor({ state: 'detached' });
    if (verse.container) {
      await phone.getByText('Nothing left in here').waitFor();
      await phone.locator('.parchment-close').click();
    }
    await phone.locator('.quest-collection').getByText('1 / 27').waitFor();
    await host.getByText('Adventure total: 1 / 27').waitFor();
    await shot(phone, 'adventure-08-collection-counter');
    driver.stand(me, driver.target(me, area.exitId).rect);
    await action.getByText('Return to the room').waitFor();
    await action.click();
    await phone.getByText('DRAG THE JOYSTICK TO MOVE').waitFor();

    // ── The shared collection and this team's half of the Secret Code puzzle ─────────────
    await phone.locator('.quest-collection').click();
    await phone.getByRole('dialog', { name: 'Wisdom collection' }).waitFor();
    assert.equal(await phone.locator('.collection-grid .verse-card').count(), 1);
    await shot(phone, 'adventure-08b-collection');
    await phone.locator('.parchment-close').click();
    const puzzleProp = [...server.inspection.level.puzzle.prompts(team).keys()][0];
    driver.stand(me, driver.target(me, puzzleProp).rect);
    await action.waitFor();
    await action.click();
    await phone.locator('.puzzle-panel .glyph').first().waitFor();
    await settle();
    await shot(phone, 'adventure-08c-puzzle-panel');
    await phone.locator('.parchment-close').click();

    // ── Locked exit: the puzzle is solved but verses are still missing ───────────────────
    await driver.solvePuzzle();
    await phone.getByText('SOLVED', { exact: true }).waitFor();
    await phone.getByText('LOCKED', { exact: true }).waitFor();
    await phone.getByText(/Find 4 more verses\./).waitFor();
    await host.getByText('EXIT: LOCKED').waitFor();
    await host.getByText('Find 4 more Scripture fragments.').waitFor();
    const door = server.inspection.level.definition.map.objects.find(
      (object) => object.kind === 'door' && object.roomId === state.teams.get(team).roomId,
    );
    nick.x = door.x + door.width / 2;
    nick.y = door.y + door.height + 40;
    await settle();
    await shot(phone, 'adventure-09-locked-exit');
    await shot(host, 'adventure-10-host-locked');

    // ── The bots finish the five levels through ordinary client messages ─────────────────
    for (let level = 1; level <= 5; level++) {
      await driver.completeLevel();
      if (level < 5) {
        await phone.getByText(`LEVEL ${level + 1} / 5`).waitFor();
        await settle();
        await shot(host, `adventure-11-host-level-${level + 1}`);
      }
    }
    assert.equal(state.status, 'final');

    // ── Hall of Wisdom on phone and monitor ──────────────────────────────────────────────
    await phone.getByRole('region', { name: 'The Hall of Wisdom' }).waitFor();
    await host.getByRole('heading', { name: 'THE HALL OF WISDOM' }).waitFor();
    assert.equal(await phone.locator('.tray-card').count(), 27);
    assert.equal(await host.locator('.slot').count(), 27);
    assert.doesNotMatch(await phone.locator('.hall').innerText(), /4:\d+|Sample \d/);
    await phone.locator('.tray-card').first().click();
    await phone.locator('.hall-reading').waitFor();
    await phone.getByRole('button', { name: 'Position 2, empty' }).click();
    await until(() => state.boardSlots[1] !== '', 'The phone placed a card');
    await host.locator('.slot-filled').first().waitFor();
    await phone.getByRole('tab', { name: '10–18' }).click();
    await phone.getByRole('button', { name: 'Position 10, empty' }).waitFor();
    await settle();
    await shot(phone, 'adventure-12-final-board-phone');
    await shot(host, 'adventure-13-final-board-host');
    assert.equal(await phone.getByRole('button', { name: 'Submit order' }).isDisabled(), true);

    // ── Victory only after the correct order ─────────────────────────────────────────────
    await driver.arrange(driver.one('A'), driver.canonical());
    await phone.getByText('Every card is on the board.').waitFor();
    assert.equal(state.status, 'final', 'Arranging alone does not win');
    await phone.getByRole('button', { name: 'Submit order' }).click();
    await phone.getByRole('heading', { name: 'YOU ESCAPED TOGETHER!' }).waitFor();
    await host.getByRole('heading', { name: 'YOU ESCAPED TOGETHER!' }).waitFor();
    assert.equal(state.status, 'won');
    await phone.getByText('You discovered 1 of the 27 verses yourself').waitFor();
    await phone.getByRole('button', { name: /^Read / }).click();
    assert.equal(await phone.locator('.chapter li').count(), 27);
    assert.equal(await host.locator('.chapter li').count(), 27);
    assert.equal(
      (await phone.locator('.chapter li').first().innerText()).trim(),
      server.inspection.scripture.verses[0].text,
    );
    await shot(phone, 'adventure-14-victory-phone');
    await shot(host, 'adventure-15-victory-host');

    // A reload on the victory screen restores it.
    await phone.reload();
    await phone.getByRole('heading', { name: 'YOU ESCAPED TOGETHER!' }).waitFor();
    assert.deepEqual(errors, []);
  },
);

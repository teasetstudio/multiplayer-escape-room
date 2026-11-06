import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline art smoke test. Does not import or modify gameplay or server state.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/server/package.json'));
const { chromium } = require('playwright-core');
const assetsRoot = resolve(root, 'apps/client/public/assets');
const manifest = JSON.parse(await readFile(resolve(assetsRoot, 'manifest.json'), 'utf8'));
const animations = JSON.parse(
  await readFile(resolve(assetsRoot, 'characters/animations.json'), 'utf8'),
);
const map = JSON.parse(
  await readFile(resolve(root, 'docs/art/twin-vaults-art-preview.tmj'), 'utf8'),
);
const ts = JSON.parse(await readFile(resolve(assetsRoot, 'tilesets/comic-floors.tsj'), 'utf8'));
map.tilesets = [{ ...ts, firstgid: 1 }];
const assets = manifest.assets.filter((a) => a.status === 'complete');
const ground = map.layers.find((layer) => layer.name === 'Ground' && layer.type === 'tilelayer');
assert.ok(ground, 'The authored map must contain a Ground tile layer');
const expectedGroundTiles = ground.data.filter((gid) => gid !== 0).length;

function validateReport(report) {
  assert.deepEqual(report.failures, []);
  assert.equal(report.loaded, assets.length);
  assert.equal(report.animated, true);
  // The two 12x12 rooms sit inside a 26x14 map with an empty border.
  // Compare against the authored map, not the occupied room dimensions.
  assert.equal(report.mapColumns, map.width);
  assert.equal(report.mapRows, map.height);
  assert.equal(report.groundTiles, expectedGroundTiles);
}

const html = `<!doctype html><html><meta charset="utf-8"><title>Phaser asset smoke test</title>
<style>body{margin:0;background:#202529;color:#D4A079}canvas{display:block}pre{font:14px monospace;white-space:pre-wrap}</style><pre id="result">Loading art textures...</pre><script src="/phaser.js"></script>
<script>
const assets=${JSON.stringify(assets)};
const animations=${JSON.stringify(animations)};
const failures=[];
addEventListener('error',e=>failures.push(e.message));
class ArtReview extends Phaser.Scene {
  preload(){
    this.load.on('loaderror',file=>failures.push(file.key));
    this.load.tilemapTiledJSON('vaults','/map.json');
    for(const a of assets){
      const url='/assets/'+a.path.split('/assets/')[1];
      if(a.frameCount){
        this.load.atlas(a.id,url,url.replace('.png','.atlas.json'));
        this.load.spritesheet(a.id+'-sheet',url,{frameWidth:96,frameHeight:128});
      }else this.load.image(a.id,url);
    }
  }
  create(){
    this.add.text(24,18,'PHASER CANVAS / exported PNGs, named atlases, spritesheets, isometric tilemap', {fontSize:'18px',color:'#D4A079'});
    const map=this.make.tilemap({key:'vaults'});
    const tiles=map.addTilesetImage('comic-floors','comic-floors',64,32,2,4);
    const layer=map.createLayer('Ground',tiles,650,190).setScale(.7);
    const live=[];
    let i=0;
    for(const a of assets.filter(a=>a.frameCount)){
      if(this.textures.get(a.id).getFrameNames().length!==40)failures.push('atlas:'+a.id);
      const data=animations[a.id].animations['walk-se'];
      const key=a.id+'-walk';
      this.anims.create({key,frames:data.frames.map(frame=>({key:a.id+'-sheet',frame})),frameRate:7,repeat:-1});
      const sprite=this.add.sprite(90+(i%4)*135,190+Math.floor(i/4)*150,a.id+'-sheet').setOrigin(.5,120/128);
      sprite.play(key);live.push(sprite);
      this.add.image(90+(i%4)*135,400+Math.floor(i/4)*150,a.id,'ne-idle').setOrigin(.5,120/128);
      i++;
    }
    const ids=['chest','barrel','sack','book','lantern','crate','table','stool','bookshelf','wall-torch',
      'door-wood-x-open','door-metal-y-closed','door-stone-x-closed','terminal-x-active','switch-y-active',
      'push-button-x-pressed','pressure-plate-completed','key-icon','crystal-icon','badge-blue','badge-orange',
      'icon-lock','icon-unlock','icon-interaction'];
    ids.forEach((id,i)=>{
      const image=this.add.image(80+(i%12)*115,650+Math.floor(i/12)*150,id);
      image.setScale(Math.min(1,100/image.width,110/image.height));
    });
    this.time.delayedCall(650,()=>{
      globalThis.artResult={loaded:assets.length,atlases:8,numericSheets:8,frames:320,
        animated:live.every(s=>s.anims.isPlaying&&s.frame.name>5),
        mapColumns:map.width,mapRows:map.height,groundTiles:layer.layer.data.flat().filter(t=>t.index>=0).length,
        renderer:this.game.renderer.type,failures};
      document.querySelector('#result').textContent=JSON.stringify(globalThis.artResult);
      fetch('/report',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({...globalThis.artResult,screenshot:this.game.canvas.toDataURL('image/png')})});
    });
  }
}
new Phaser.Game({type:Phaser.CANVAS,width:1450,height:940,backgroundColor:'#202529',scene:ArtReview,
  render:{antialias:true,pixelArt:false},audio:{noAudio:true}});
</script></html>`;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/report' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const report = JSON.parse(Buffer.concat(chunks).toString());
      const { screenshot, ...data } = report;
      validateReport(data);
      await writeFile(
        resolve(root, 'docs/art/PHASER_SMOKE.png'),
        Buffer.from(screenshot.split(',')[1], 'base64'),
      );
      await writeFile(
        resolve(root, 'docs/art/browser-validation.json'),
        JSON.stringify({ ...data, passed: true }, null, 2) + '\n',
      );
      console.log(JSON.stringify(data));
      res.end('ok');
    } else if (path === '/') {
      res.setHeader('content-type', 'text/html');
      res.end(html);
    } else if (path === '/map.json') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(map));
    } else {
      const file =
        path === '/phaser.js'
          ? resolve(root, 'apps/client/node_modules/phaser/dist/phaser.js')
          : resolve(assetsRoot, '.' + path.replace(/^\/assets/, ''));
      if (path !== '/phaser.js' && !file.startsWith(assetsRoot + '/')) throw new Error('Path');
      res.setHeader(
        'content-type',
        file.endsWith('.png')
          ? 'image/png'
          : file.endsWith('.json')
            ? 'application/json'
            : 'text/javascript',
      );
      res.end(await readFile(file));
    }
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
if (process.argv.includes('--serve')) {
  console.log(`Art review: http://127.0.0.1:${server.address().port}/`);
} else {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_BIN || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 1450, height: 940 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => globalThis.artResult, undefined, { timeout: 30_000 });
    const report = await page.evaluate(() => globalThis.artResult);
    assert.deepEqual(errors, []);
    validateReport(report);
    await page.screenshot({ path: resolve(root, 'docs/art/PHASER_SMOKE.png') });
    await writeFile(
      resolve(root, 'docs/art/browser-validation.json'),
      JSON.stringify({ ...report, passed: true }, null, 2) + '\n',
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
}

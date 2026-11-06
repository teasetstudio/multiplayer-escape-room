"""Validate exported art contracts; no game process or networking required."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'apps/client/public/assets'
DOC=ROOT/'docs/art'


def main():
    manifest=json.loads((OUT/'manifest.json').read_text())
    assets=manifest['assets'];failures=[];warnings=[]
    def check(ok,message):
        if not ok:failures.append(message)
    ids=[a['id'] for a in assets]
    check(len(ids)==len(set(ids)),'Duplicate asset IDs')
    declared=set()
    for a in assets:
        p=ROOT/a['path'];declared.add(p)
        check(p.is_file(),f"Missing file {a['id']}")
        if not p.is_file():continue
        with Image.open(p) as image:
            image.load();check(image.mode=='RGBA',f"Non-RGBA {a['id']}")
            check(list(image.size)==a['dimensions'],f"Dimensions {a['id']}")
            alpha=np.array(image.getchannel('A'))
            check(alpha.max()>200,f"Empty/faint asset {a['id']}")
            check(alpha.min()==0,f"Missing transparent pixels {a['id']}")
            if a['category'] not in ['environment/floors','tilesets']:
                edge=np.concatenate([alpha[0],alpha[-1],alpha[:,0],alpha[:,-1]])
                check(edge.max()==0,f"Cropped/nontransparent border {a['id']}")
            x,y=a['anchorPixels'];w,h=a.get('frameWidth',image.width),a.get('frameHeight',image.height)
            check(0<=x<=w and 0<=y<=h,f"Invalid anchor {a['id']}")
            if a.get('frameCount'):
                check(image.size==(480,1024),f"Sheet geometry {a['id']}")
                digests=[]
                for row in range(8):
                    row_hash=[]
                    for col in range(5):
                        frame=image.crop((col*96,row*128,(col+1)*96,(row+1)*128))
                        aa=np.array(frame.getchannel('A'));ys,xs=np.where(aa>80)
                        check(len(xs)>100,f"Empty frame {a['id']} {row}:{col}")
                        if len(xs):
                            check(xs.min()>1 and xs.max()<94 and ys.min()>1 and ys.max()<126,f"Frame clipping {a['id']} {row}:{col}")
                            check(117<=ys.max()<=121,f"Foot baseline {a['id']} {row}:{col}")
                        digest=hashlib.sha256(frame.tobytes()).hexdigest();digests.append(digest);row_hash.append(digest)
                    check(len(set(row_hash))==5,f"Duplicate poses {a['id']} {row}")
                check(len(set(digests))==40,f"Duplicate directional frames {a['id']}")
                atlas=json.loads(p.with_suffix('.atlas.json').read_text())
                check(len(atlas['frames'])==40,f"Atlas frame count {a['id']}")
                for frame in atlas['frames'].values():
                    f=frame['frame'];check(f['x']+f['w']<=image.width and f['y']+f['h']<=image.height,'Atlas bounds')
    check(set(OUT.rglob('*.png'))=={p for p in declared if p.is_relative_to(OUT)},'Unmanifested runtime PNGs')
    floors=[a for a in assets if a['category']=='environment/floors']
    # Exact raster tessellation: 8x8 diamonds cover the central diamond union once.
    coverage=np.zeros((400,700),dtype=int)
    mask=None
    for a in floors:
        im=Image.open(ROOT/a['path']);alpha=np.array(im.getchannel('A'))
        check(im.size==(64,32),f"Floor geometry {a['id']}")
        check(set(np.unique(alpha))=={0,255},f"Floor edge alpha {a['id']}")
        check(np.count_nonzero(alpha)==1024,f"Floor diamond area {a['id']}")
        if mask is None:mask=alpha>0
        else:check(np.array_equal(mask,alpha>0),f"Inconsistent diamond {a['id']}")
    for y in range(8):
        for x in range(8):
            px=300+(x-y)*32;py=20+(x+y)*16
            coverage[py:py+32,px:px+64]+=mask
    check(coverage.max()==1,'Floor overlap at tile seams')
    check(np.count_nonzero(coverage)==64*1024,'Floor seam coverage')
    check(np.all(coverage[148:164,300:364]==1),'Floor central seam holes')
    for name in ['comic-floors','comic-architecture']:
        p=OUT/f'tilesets/{name}.tsj';ts=json.loads(p.read_text())
        if 'image' in ts:
            check((p.parent/ts['image']).is_file(),'Tileset image reference')
            check(ts['tilecount']==12 and ts['margin']==2 and ts['spacing']==4,'Floor atlas spacing')
        else:
            check(len(ts['tiles'])==ts['tilecount'],'Architecture tile count')
            for tile in ts['tiles']:
                check((p.parent/tile['image']).is_file(),'Collection image path')
    demo=json.loads((DOC/'twin-vaults-art-preview.tmj').read_text());original=json.loads((ROOT/'packages/shared/src/maps/twin-vaults.json').read_text())
    check(demo['layers']==original['layers'],'Editor preview changed map geometry')
    check((DOC/demo['tilesets'][0]['source']).is_file(),'Editor preview TSJ path')
    animations=json.loads((OUT/'characters/animations.json').read_text())
    check(len(animations)==8,'Four designs x two teams')
    for name,a in animations.items():
        check(len(a['animations'])==16,f"Eight-direction idle/walk coverage {name}")
        for key,anim in a['animations'].items():
            check(len(anim['frames'])==(4 if key.startswith('walk') else 1),f'Animation length {name}/{key}')
            check(all(0<=f<40 for f in anim['frames']),'Animation index range')
    for name in ['ASSET_CONTACT_SHEET.png','ASSET_PREVIEW.png','MOBILE_PREVIEW.png','ANIMATION_CONTACT_SHEET.png','WALK_PREVIEW.gif']:
        check((DOC/name).is_file(),f'Missing preview {name}')
    counts=Counter(a['category'] for a in assets if a['status']=='complete')
    report=dict(passed=not failures,assetCount=len(assets),productionPngCount=sum(counts.values()),samplePngCount=sum(a['status']=='sample-only' for a in assets),counts=dict(counts),characterFrames=320,failures=failures,warnings=warnings,automatedChecks=['RGBA / dimensions / alpha / borders / anchors','40 distinct aligned frames per sheet and valid atlases','8-direction idle/walk metadata','64x32 diamond coverage, no seam holes or overlaps','Tiled paths / margins / spacing','Editor preview preserves all authored map layers','All public PNGs declared in manifest'],manualReview=['Reference illustration inspected','Six sample exports composited before production','Category contact sheets inspected','Actual-map two-room composite and 844x390 phone crop inspected','Animation strips and walk GIF inspected'],limitations=['Five native views plus three mirrored views; mirrored highlights and asymmetric straps also mirror','Four-pose walk loops are economical comic animation; no run, emote or interaction animations','No runtime loader integration or physical-phone verification in this art-only iteration','No navigable stairs: current map is a single collision plane without height traversal','Tiled architecture collection is editor-only at 2x; resize tile objects to 0.5 and apply explicit anchor offsets during later integration'])
    (DOC/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    if failures:raise SystemExit(1)


if __name__=='__main__':main()

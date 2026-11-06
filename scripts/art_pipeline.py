"""Offline art export pipeline. Requires Pillow and numpy; never imported by the game."""
from pathlib import Path
import json
import math
import colorsys
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'apps/client/public/assets'
DOC = ROOT / 'docs/art'
RESAMPLE = Image.Resampling.LANCZOS
ASSETS = []


def source(name):
    return Image.open(DOC / 'sources' / (name + '.png')).convert('RGBA')


def emit(name, image, category, footprint=None, anchor=None, states=None, method=None, **extra):
    path = OUT / category / (name + '.png')
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)
    w, h = image.size
    ASSETS.append(dict(id=name, path=str(path.relative_to(ROOT)), category=category,
                       dimensions=[w, h], footprintLogical=footprint,
                       anchorPixels=[float(n) for n in (anchor or [w / 2, h - 4])], displayScale=0.5,
                       states=states or [], source=method or name,
                       status='complete', **extra))
    return image


def recolor(im, rgb, strength=0.25):
    a = im.getchannel('A')
    result = Image.blend(im.convert('RGB'), Image.new('RGB', im.size, rgb), strength)
    result.putalpha(a)
    return result


def patch(im, points, canvas, brightness=1.0):
    """Map painted source to a parallelogram with no projective convergence."""
    p0, p1, p2, p3 = np.array(points, dtype=float)
    basis = np.column_stack([p1 - p0, p3 - p0])
    if abs(np.linalg.det(basis)) < .01:
        return
    inv = np.linalg.inv(basis)
    coeff = []
    for row, size in zip(inv, im.size):
        coeff.extend([row[0] * size, row[1] * size, -np.dot(row, p0) * size])
    tex = ImageEnhance.Brightness(im).enhance(brightness)
    warped = tex.transform(canvas.size, Image.Transform.AFFINE, coeff,
                           Image.Resampling.BICUBIC)
    mask = Image.new('L', canvas.size)
    ImageDraw.Draw(mask).polygon([tuple(p) for p in points], fill=255)
    warped.putalpha(Image.fromarray(np.minimum(np.array(mask), np.array(warped.getchannel('A')))))
    canvas.alpha_composite(warped)


def proj(x, y, z=0):
    return np.array([x-y, (x+y)/2-z*2])


def prism(w=64, d=8, height=38, texture=None, size=(128, 144), anchor=(64, 116), offset=(0, 0)):
    tex = texture or source('wall')
    canvas = Image.new('RGBA', size)
    ground = [proj(x-w/2+offset[0], y-d/2+offset[1])+anchor
              for x,y in ((0,0),(w,0),(w,d),(0,d))]
    top = [p-np.array([0, height*2]) for p in ground]
    # Far end, main X-facing surface, then top. Never mirror the lighting.
    patch(tex, [top[1],top[2],ground[2],ground[1]], canvas, .67)
    patch(tex, [top[3],top[2],ground[2],ground[3]], canvas, .94)
    patch(tex, top, canvas, 1.12)
    return canvas


def floor_tiles():
    tex = source('floor').resize((128,128),RESAMPLE).convert('RGB')
    # Reduce the floor's contrast, so players and discoveries dominate.
    base = np.array(ImageEnhance.Contrast(tex).enhance(.55)).astype(float) * .77
    # Periodic boundary values before projecting: opposite texture edges agree.
    for axis in [0,1]:
        for band in range(8):
            first=np.take(base,band,axis=axis).copy()
            last=np.take(base,127-band,axis=axis).copy()
            shared=(first+last)/2;weight=1-band/8
            if axis==0:
                base[band]=first*(1-weight)+shared*weight
                base[127-band]=last*(1-weight)+shared*weight
            else:
                base[:,band]=first*(1-weight)+shared*weight
                base[:,127-band]=last*(1-weight)+shared*weight
    yy,xx = np.mgrid[0:128,0:128]
    # All exported variations share a common 7px texture border.
    interior = np.minimum.reduce([xx,yy,127-xx,127-yy])/14
    interior = np.clip(interior,0,1)[...,None]
    names = ['regular','cracked','worn','dirt','moss','dark','engraved','damaged',
             'transition-dirt-x','transition-dirt-y','transition-moss-x','transition-moss-y']
    for i,name in enumerate(names):
        v = base.copy()
        if name=='cracked':
            v=np.roll(v,17,axis=0)*.9
        elif name=='worn':
            v=v*.68+np.array([133,136,127])*.32
        elif 'dirt' in name:
            v=np.array(source('dirt-material').resize((128,128),RESAMPLE).convert('RGB'))*.72
        elif 'moss' in name:
            v=np.array(source('moss-material').resize((128,128),RESAMPLE).convert('RGB'))*.72
        elif name=='dark':
            v=v*.61
        elif name=='damaged':
            v=np.roll(v,43,axis=1)*.79
        elif name=='engraved':
            overlay=Image.fromarray(v.astype('uint8'));dr=ImageDraw.Draw(overlay)
            dr.polygon([(64,29),(99,64),(64,99),(29,64)],outline=(55,65,69),width=4)
            dr.polygon([(64,39),(89,64),(64,89),(39,64)],outline=(161,141,105),width=3)
            v=np.array(overlay).astype(float)
        blend=interior.copy()
        if name.startswith('transition'):
            blend=blend*(xx if name.endswith('x') else yy)[...,None]/127
        v=base*(1-blend)+v*blend
        img=Image.fromarray(v.clip(0,255).astype('uint8')).convert('RGBA')
        # Pixel-center inverse mapping exactly covers the 64x32 tile diamond.
        diamond=Image.new('RGBA',(64,32)); pix=diamond.load()
        for y in range(32):
            for x in range(64):
                u=(x+.5)/64+(y+.5)/32-0.5
                vv=(y+.5)/32-(x+.5)/64+0.5
                if 0<=u<1 and 0<=vv<1:
                    pix[x,y]=img.getpixel((min(127,int(u*128)),min(127,int(vv*128))))
        emit('floor-'+name,diamond,'environment/floors',[64,64],[32,16],
             method='floor; deterministic border-preserving material variants',displayDensity=1)
        ASSETS[-1]['displayScale']=1


def architecture():
    for orientation in ['x','y']:
        for height in [24,32,38]:
            w,d=(64,8) if orientation=='x' else (8,64)
            emit(f'wall-{orientation}-{height}',prism(w,d,height),'environment/walls',[w,d],[64,116],
                 method='wall; affine-projected painted material')
    tiled=json.loads((ROOT/'packages/shared/src/maps/twin-vaults.json').read_text())
    authored=next(l for l in tiled['layers'] if l['name']=='Walls')
    for o in authored['objects']:
        w,d=o['width']*2,o['height']*2
        nx,ny=math.ceil(w/64),math.ceil(d/64);w,d=w/nx,d/ny
        height=next(p['value'] for p in o['properties'] if p['name']=='elevation')
        name=wall_id(w,d,height)
        if not any(a['id']==name for a in ASSETS):
            emit(name,prism(w,d,height),'environment/walls',[w,d],[64,116],method='wall; exact partial segment from the existing authored geometry')
    for orientation in ['x','y']:
        w,d=(64,8) if orientation=='x' else (8,64)
        for kind in ['end','damaged','decorative']:
            tex=source('wall') if kind!='decorative' else source('stone-door')
            ww,dd=(8,8) if kind=='end' else (w,d)
            height=24 if kind=='damaged' else 38
            canvas=prism(ww,dd,height,tex)
            if kind=='damaged':
                stone=source('rock');stone.thumbnail((36,24),RESAMPLE)
                canvas.alpha_composite(stone,(50,116-int(height*2)-8))
            emit(f'wall-{orientation}-{kind}',canvas,'environment/walls',[ww,dd],[64,116],method=f'wall / stone-door / rock; projected {kind}')
        # Door openings are separate art from the movable leaf.
        opening=Image.new('RGBA',(160,160));anchor=np.array([80,128])
        for pos in [-39,39]:
            offset=(pos,0) if orientation=='x' else (0,pos)
            opening.alpha_composite(prism(8,10,38,size=(160,160),anchor=anchor,offset=offset))
        lintel=prism(86,10,6,size=(160,160),anchor=anchor-[0,64]) if orientation=='x' else prism(10,86,6,size=(160,160),anchor=anchor-[0,64])
        opening.alpha_composite(lintel)
        emit(f'wall-door-opening-{orientation}',opening,'environment/walls',[86,10] if orientation=='x' else [10,86],list(anchor),method='wall; separate jambs and lintel, 70-unit aperture')
        for material,src in [('wood','wood-door'),('metal','metal-door'),('stone','stone-door')]:
            door=source(src)
            for state in ['closed','open']:
                canvas=Image.new('RGBA',(256,192));anchor=np.array([128,136])
                a,b=(proj(-35,0),proj(35,0)) if orientation=='x' else (proj(0,-35),proj(0,35))
                if state=='open':
                    # Rotate 90 degrees about the same logical hinge; anchor stays fixed.
                    b=proj(-35,70) if orientation=='x' else proj(70,-35)
                patch(door,[a+anchor-[0,68],b+anchor-[0,68],b+anchor,a+anchor],canvas,1 if orientation=='x' else .82)
                emit(f'door-{material}-{orientation}-{state}',canvas,'environment/doors',[70,10] if orientation=='x' else [10,70],list(anchor),[state],method=f'{src}; affine projection and 90-degree hinge rotation',hingeLogical=[-35,0] if orientation=='x' else [0,-35],openOverhangLogical=70 if state=='open' else 0)
    for kind,off in [('inner',(28,-28)),('outer',(-28,28))]:
        corner=prism(64,8,38,size=(224,176),anchor=(112,136))
        corner.alpha_composite(prism(8,64,38,size=(224,176),anchor=(112,136),offset=off))
        emit('wall-corner-'+kind,corner,'environment/walls',[64,64],[112,136],method='wall; two perpendicular generated-material segments',attachmentOffsetsLogical=list(off))


def structures_and_furniture():
    wood=source('wood-door')
    # Plain plank region, excluding rings and iron straps.
    wood=wood.crop((int(wood.width*.02),int(wood.height*.25),int(wood.width*.72),int(wood.height*.40)))
    for name,w,d,h in [('crate',46,46,26),('storage-container',42,32,20),('wooden-beam-x',64,8,6),('wooden-beam-y',8,64,6)]:
        category='props' if name in ['crate','storage-container'] else 'environment/structures'
        im=prism(w,d,h,wood,size=(144,144),anchor=(72,108))
        if name in ['crate','storage-container']:
            painted=source('crate-painted');painted.thumbnail((96,90),RESAMPLE)
            if name=='storage-container':painted=painted.resize((painted.width,round(painted.height*.8)),RESAMPLE)
            im=Image.new('RGBA',(144,144));im.alpha_composite(painted,((144-painted.width)//2,round(108+painted.width/4-painted.height)))
        emit(name,im,category,[w,d],[72,108],method='crate-painted; normalized illustrated crate / storage variant' if category=='props' else 'wood-door plank painting; projected beam')
    for name,height in [('column',52),('column-short',50),('broken-column',22)]:
        im=Image.new('RGBA',(144,176));anchor=(72,144)
        im.alpha_composite(prism(36,36,6,size=im.size,anchor=anchor))
        im.alpha_composite(prism(24,24,height-6,size=im.size,anchor=(72,132)))
        if name!='broken-column':
            im.alpha_composite(prism(34,34,5,size=im.size,anchor=(72,144-(height-5)*2)))
        else:
            stone=source('rock');stone.thumbnail((52,35),RESAMPLE);im.alpha_composite(stone,(46,144-height*2-12))
        emit(name,im,'environment/structures',[36,36],list(anchor),method='wall / rock; assembled stone column')
    for orientation in ['x','y']:
        opening=Image.open(OUT/f'environment/walls/wall-door-opening-{orientation}.png').convert('RGBA')
        emit('archway-'+orientation,opening,'environment/structures',[86,10] if orientation=='x' else [10,86],[80,128],method='wall; squared fortress archway, separate opening asset')
    for name,w,d,h in [('table',80,44,25),('stool',28,28,16)]:
        size=(192,160);anchor=(96,120);im=Image.new('RGBA',size)
        painted=source(name+'-painted');painted.thumbnail((132,102) if name=='table' else (52,62),RESAMPLE)
        im.alpha_composite(painted,((192-painted.width)//2,round(120+painted.width/4-painted.height)))
        emit(name,im,'props',[w,d],list(anchor),method=name+'-painted; normalized isolated illustrated furniture')
    im=Image.new('RGBA',(192,176));painted=source('bookshelf-painted');painted.thumbnail((116,132),RESAMPLE)
    im.alpha_composite(painted,((192-painted.width)//2,round(144+painted.width/4-painted.height)))
    emit('bookshelf',im,'props',[68,28],[96,144],method='bookshelf-painted; normalized isolated bookshelf with legible book spines')
    for orientation in ['x','y']:
        src=source('stone-door');im=Image.new('RGBA',(128,144));a=np.array([64,116])
        p,q=(proj(-25,0),proj(25,0)) if orientation=='x' else (proj(0,-25),proj(0,25))
        patch(src,[p+a-[0,64],q+a-[0,64],q+a,p+a],im,.9 if orientation=='x' else .75)
        emit('stone-carving-'+orientation,im,'environment/structures',[50,4] if orientation=='x' else [4,50],list(a),method='stone-door; isolated relief panel')


def team_color(im, orange=False):
    """Change only saturated blue cloth; retain luminance, skin and warm equipment."""
    data=np.array(im).copy();rgb=data[:,:,:3].astype(float)/255
    maximum=rgb.max(axis=2);minimum=rgb.min(axis=2)
    sat=(maximum-minimum)/np.maximum(maximum,.001)
    mask=(rgb[:,:,2]>rgb[:,:,0]*1.22)&(rgb[:,:,2]>rgb[:,:,1]*1.03)&(sat>.29)&(data[:,:,3]>0)
    if orange:
        luminance=rgb.mean(axis=2)
        target=np.stack([luminance*1.7,luminance*.93,luminance*.37],axis=-1)
        data[:,:,:3][mask]=(target.clip(0,1)*255).astype('uint8')[mask]
    return Image.fromarray(data)


def character_sheets():
    directions=['s','se','e','ne','n','nw','w','sw']
    animations={}
    for name in ['explorer','scout','traveler','ranger']:
        sheet=source(name+'-sheet')
        native=[]
        for row in range(5):
            frames=[]
            for col in range(5):
                bounds=(round(col*sheet.width/5),round(row*sheet.height/5),round((col+1)*sheet.width/5),round((row+1)*sheet.height/5))
                im=sheet.crop(bounds)
                # Drop faint matte residue; retain antialiasing around the silhouette.
                a=im.getchannel('A').point(lambda x:0 if x<70 else min(255,round(x*255/245)))
                im.putalpha(a);im=im.crop(a.point(lambda x:255 if x>128 else 0).getbbox())
                im=im.resize((round(im.width*104/im.height),104),RESAMPLE)
                frame=Image.new('RGBA',(96,128));frame.alpha_composite(im,((96-im.width)//2,120-im.height));frames.append(frame)
            native.append(frames)
        all_rows=native+[[f.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for f in native[r]] for r in [3,2,1]]
        for team in ['blue','orange']:
            canvas=Image.new('RGBA',(480,1024));atlas={};anims={}
            for row,(direction,frames) in enumerate(zip(directions,all_rows)):
                for col,frame in enumerate(frames):
                    frame=team_color(frame,team=='orange');canvas.alpha_composite(frame,(col*96,row*128))
                    key=f'{direction}-'+('idle' if col==0 else f'walk-{col}')
                    atlas[key]=dict(frame=dict(x=col*96,y=row*128,w=96,h=128),rotated=False,trimmed=False,spriteSourceSize=dict(x=0,y=0,w=96,h=128),sourceSize=dict(w=96,h=128),pivot=dict(x=.5,y=120/128))
                anims['idle-'+direction]=dict(frames=[row*5],frameRate=1,repeat=-1)
                anims['walk-'+direction]=dict(frames=[row*5+i for i in [1,2,3,4]],frameRate=7,repeat=-1)
            filename=f'{name}-{team}'
            emit(filename,canvas,'characters',[28,28],[48,120],['idle','walk'],method=f'{name}-sheet; five native views, three mirrored, blue-only cloth recoloring',frameWidth=96,frameHeight=128,frameCount=40,directions=directions)
            metadata=dict(meta=dict(image=filename+'.png',format='RGBA8888',size=dict(w=480,h=1024),scale='1'),frames=atlas)
            (OUT/'characters'/f'{filename}.atlas.json').write_text(json.dumps(metadata,indent=2)+'\n')
            animations[filename]=dict(texture=filename,frameWidth=96,frameHeight=128,anchorPixels=[48,120],displayScale=.5,animations=anims)
    (OUT/'characters/animations.json').write_text(json.dumps(animations,indent=2)+'\n')


def icon_source(name, size=(96,96), target=(76,76)):
    im=source(name);im.thumbnail(target,RESAMPLE)
    canvas=Image.new('RGBA',size);canvas.alpha_composite(im,((size[0]-im.width)//2,(size[1]-im.height)//2))
    return canvas


def icons_and_artifacts():
    for name in ['key','medallion','crystal','coin','parchment']:
        emit(name+'-world',icon_source(name,(80,80),(52,52)),'artifacts',[24,24],[40,40] if name!='crystal' else [40,64],method=f'{name}; world sprite from generated cutout')
        emit(name+'-icon',icon_source(name),'artifacts',None,[48,48],method=f'{name}; corresponding UI icon',screenSpace=True)
    for name,src in [('interaction','ui-hand'),('inventory','ui-inventory'),('lock','ui-lock'),('artifact','medallion')]:
        emit('icon-'+name,icon_source(src),'ui',None,[48,48],method=f'{src}; alpha-normalized UI cutout',screenSpace=True)
    closed=source('ui-lock').resize((64,88),RESAMPLE)
    # Separate the shackle and body; pivot the shackle away from the right socket.
    unlocked=Image.new('RGBA',(96,112));body=closed.crop((0,38,64,88));unlocked.alpha_composite(body,(16,53))
    shackle=closed.crop((4,0,60,38)).rotate(25,Image.Resampling.BICUBIC,expand=True)
    unlocked.alpha_composite(shackle,(8,5))
    unlock_canvas=Image.new('RGBA',(96,96));unlocked.thumbnail((80,80),RESAMPLE);unlock_canvas.alpha_composite(unlocked,((96-unlocked.width)//2,(96-unlocked.height)//2))
    emit('icon-unlock',unlock_canvas,'ui',None,[48,48],method='ui-lock; separated body and pivoted open shackle',screenSpace=True)
    for team in ['blue','orange']:
        im=team_color(icon_source('ui-badge'),team=='orange')
        emit('badge-'+team,im,'ui',None,[48,48],method='ui-badge; cloth-only hue variation',screenSpace=True)
    # Exact composable geometric glyphs, drawn as ink strokes over painted metal.
    for name in ['triangle','circle','square','diamond','complete','disabled']:
        im=Image.new('RGBA',(64,64));dr=ImageDraw.Draw(im)
        ink='#202529';light='#D4A079'
        if name=='circle':
            dr.ellipse((12,12,52,52),outline=ink,width=9);dr.ellipse((14,14,50,50),outline=light,width=4)
        else:
            paths={'triangle':[(32,10),(55,52),(9,52),(32,10)],'square':[(12,12),(52,12),(52,52),(12,52),(12,12)],'diamond':[(32,7),(57,32),(32,57),(7,32),(32,7)],'complete':[(10,32),(26,49),(55,14)],'disabled':[(13,13),(51,51)]}
            dr.line(paths[name],fill=ink,width=10,joint='curve');dr.line(paths[name],fill=light,width=4,joint='curve')
        emit('symbol-'+name,im,'puzzles',None,[32,32],method='original deterministic ink glyph; runtime-composable, no secret code',screenSpace=True)
    for name,glyph in [('puzzle-status','complete'),('progress','diamond')]:
        im=icon_source('medallion')
        symbol=Image.open(OUT/f'puzzles/symbol-{glyph}.png').convert('RGBA').resize((40,40),RESAMPLE)
        im.alpha_composite(symbol,(28,28))
        emit('icon-'+name,im,'ui',None,[48,48],method=f'medallion and composable {glyph} ink symbol',screenSpace=True)
    for state,src in [('locked','icon-lock'),('unlocked','icon-unlock')]:
        im=Image.open(OUT/f'ui/{src}.png').convert('RGBA').resize((48,48),RESAMPLE)
        emit('indicator-'+state,im,'puzzles',None,[24,24],[state],method=src+'; separate door-state overlay',screenSpace=True)


def panels():
    im=source('ui-panel')
    def padded(size):
        canvas=Image.new('RGBA',size)
        canvas.alpha_composite(im.resize((size[0]-8,size[1]-8),RESAMPLE),(4,4))
        return canvas
    for name,size in [('dialogue-frame',(640,288)),('modal-background',(512,384))]:
        export=padded(size)
        emit(name,export,'ui',None,[size[0]/2,size[1]/2],method='ui-panel; clean blank parchment UI',screenSpace=True,nineSlice=[64,64,64,64],contentInsets=[72,60,72,60])
    for state in ['normal','hover','pressed','disabled']:
        export=padded((256,96))
        if state=='hover':export=ImageEnhance.Brightness(export).enhance(1.12)
        if state=='pressed':export=ImageEnhance.Brightness(export).enhance(.77)
        if state=='disabled':export=recolor(export,(100,103,103),.65)
        emit('button-'+state,export,'ui',None,[128,48],[state],method='ui-panel; consistent parchment button state',screenSpace=True,nineSlice=[24,24,24,24],contentInsets=[28,20,28,20])
    progress=padded((320,48))
    emit('progress-frame',progress,'ui',None,[160,24],method='ui-panel; empty progress track decoration',screenSpace=True,nineSlice=[24,24,16,16])


def puzzle_assets():
    colors={'inactive':(65,75,77),'active':(219,152,66),'completed':(114,165,119),'disabled':(86,88,88),'pressed':(219,152,66)}
    for name in ['panel','terminal','switch','push-button']:
        original=source(name)
        for state in ['inactive','active','completed','disabled']+(['pressed'] if name=='push-button' else []):
            front=original.copy()
            if name=='switch':
                # Rebuild mounting plate and independently reposition the generated lever.
                W,H=original.size
                plate=original.crop((0,int(H*.34),W,H)).resize((96,100),RESAMPLE)
                clean=original.crop((int(W*.08),int(H*.4),int(W*.27),int(H*.66))).resize((22,70),RESAMPLE)
                plate.alpha_composite(clean,(36,0))
                lever=original.crop((int(W*.27),0,int(W*.73),int(H*.65))).resize((36,76),RESAMPLE)
                front=Image.new('RGBA',(128,192));front.alpha_composite(plate,(16,72))
                if state in ['active','completed']:
                    front.alpha_composite(lever.rotate(165,Image.Resampling.BICUBIC,expand=True),(32,105))
                else:front.alpha_composite(lever,(46,15))
            if state=='disabled':front=recolor(front,(85,88,88),.55)
            # Status socket is an inset ink-edged lamp, never a code value.
            dr=ImageDraw.Draw(front);W,H=front.size
            x,y=(W*.5,H*.91) if name=='panel' else (W*.85,H*.82)
            r=max(3,int(min(W,H)*.055))
            dr.ellipse((x-r-2,y-r-2,x+r+2,y+r+2),fill='#202529')
            dr.ellipse((x-r,y-r,x+r,y+r),fill=colors[state])
            if name=='push-button' and state=='pressed':
                # Red cap is lowered relative to the fixed mounting plate.
                pixels=np.array(front);red=(pixels[:,:,0]>pixels[:,:,1]*1.65)&(pixels[:,:,0]>pixels[:,:,2]*1.8)&(pixels[:,:,3]>80)
                redmask=Image.fromarray((red*255).astype('uint8'));box=redmask.getbbox()
                if box:
                    cap=front.crop(box);cap.putalpha(redmask.crop(box))
                    base=recolor(front,(60,42,30),.65)
                    front.paste(base,(0,0),redmask)
                    front.alpha_composite(cap,(box[0],box[1]+max(2,int(H*.025))))
                front=ImageEnhance.Brightness(front).enhance(.8)
            for orientation in ['x','y']:
                width=80 if name in ['panel','terminal'] else 44
                height=29 if name in ['panel','terminal'] else (40 if name=='switch' else 22)
                canvas=Image.new('RGBA',(144,160));anchor=np.array([72,128])
                p,q=(proj(-width/2,0),proj(width/2,0)) if orientation=='x' else (proj(0,-width/2),proj(0,width/2))
                patch(front,[p+anchor-[0,height*2],q+anchor-[0,height*2],q+anchor,p+anchor],canvas,1 if orientation=='x' else .82)
                emit(f'{name}-{orientation}-{state}',canvas,'puzzles',[width,4] if orientation=='x' else [4,width],list(anchor),[state],method=f'{name}; independently composable lamp state / affine mounting',runtimeSymbols=True)
    for state in ['inactive','active','pressed','disabled','completed']:
        tex=source('pressure-plate')
        if state in ['active','pressed','completed']:tex=recolor(tex,(176,136,74),.18)
        if state=='disabled':tex=recolor(tex,(66,72,75),.5)
        if state=='completed':
            symbol=Image.open(OUT/'puzzles/symbol-complete.png').convert('RGBA').resize((tex.width//3,tex.height//3),RESAMPLE)
            tex.alpha_composite(symbol,(tex.width//3,tex.height//3))
        canvas=prism(48,48,2 if state=='pressed' else 5,source('wall'),size=(128,96),anchor=(64,60))
        pts=[proj(x,y,2 if state=='pressed' else 5)+[64,60] for x,y in [(-24,-24),(24,-24),(24,24),(-24,24)]]
        patch(tex,pts,canvas)
        emit('pressure-plate-'+state,canvas,'puzzles',[48,48],[64,60],[state],method='pressure-plate; projected top, physically lowered pressed state')


def object_sprite(name, category, size=(96,96), target=(72,72), footprint=(48,48)):
    im=source(name);im.thumbnail(target,RESAMPLE)
    canvas=Image.new('RGBA',size)
    bottom=size[1]-6
    anchor=[size[0]//2,round(bottom-im.width/4)]
    canvas.alpha_composite(im,((size[0]-im.width)//2,bottom-im.height))
    if category=='characters':anchor=[size[0]//2,bottom]
    return emit(name,canvas,category,list(footprint),anchor,
                method=f'{name}; alpha cleanup, trim, Lanczos normalization')


def props():
    sizes={'barrel':((80,112),(62,94),(36,36)),
           'sack':((96,96),(72,72),(40,40)),
           'book':((80,64),(60,40),(28,20)),
           'lantern':((80,112),(52,90),(22,22)),
           'candle':((80,96),(58,74),(22,22)),
           'pottery':((112,96),(92,76),(44,36)),
           'rock':((112,80),(96,60),(48,40)),
           'rope':((112,80),(96,52),(48,40))}
    for name,(size,target,footprint) in sizes.items():
        object_sprite(name,'props',size,target,footprint)
    scroll=icon_source('parchment',(96,80),(72,52))
    emit('scroll',scroll,'props',[36,24],[48,54],method='parchment; matching decorative scroll')
    rubble=Image.new('RGBA',(144,96));rock=source('rock');rock.thumbnail((74,46),RESAMPLE)
    rubble.alpha_composite(rock,(18,21));rubble.alpha_composite(rock.resize((54,34),RESAMPLE),(76,48))
    emit('rubble',rubble,'props',[64,48],[72,72],method='rock; deliberately assembled indexed rubble cluster')
    stack=Image.new('RGBA',(96,96));book=source('book');book.thumbnail((66,42),RESAMPLE)
    for i in range(3):stack.alpha_composite(recolor(book,(80,73+i*15,77),i*.10),(15+i*2,47-i*16))
    emit('books-stack',stack,'props',[36,28],[48,88],method='book; separate layered material-consistent stack')
    torch=Image.new('RGBA',(96,144));wood=source('wood-door')
    patch(wood.crop((0,wood.height//4,wood.width//3,wood.height//2)),[(40,61),(54,61),(54,132),(40,132)],torch)
    c=source('candle');flame=c.crop((int(c.width*.38),0,int(c.width*.70),int(c.height*.35)))
    flame.thumbnail((38,60),RESAMPLE);torch.alpha_composite(flame,(28,14))
    emit('wall-torch',torch,'environment/structures',[8,8],[48,136],method='candle flame / wood-door; assembled wall-mounted torch',mounting='vertical screen plane; upper-left light')


def package_tilesets():
    floors=[a for a in ASSETS if a['category']=='environment/floors']
    # Margin/spacing include duplicated edge texels to prevent filtering bleed.
    atlas=Image.new('RGBA',(4*68,3*36))
    for i,a in enumerate(floors):
        im=Image.open(ROOT/a['path']).convert('RGBA')
        x,y=(i%4)*68+2,(i//4)*36+2
        atlas.alpha_composite(im,(x,y))
        atlas.alpha_composite(im.crop((0,0,64,1)).resize((64,2)),(x,y-2))
        atlas.alpha_composite(im.crop((0,31,64,32)).resize((64,2)),(x,y+32))
        atlas.alpha_composite(im.crop((0,0,1,32)).resize((2,32)),(x-2,y))
        atlas.alpha_composite(im.crop((63,0,64,32)).resize((2,32)),(x+64,y))
    emit('comic-floors',atlas,'tilesets',None,[0,0],method='packed floor exports; 2px extruded gutters',displayScaleNote='Tileset already 1x; never apply object scale')
    ASSETS[-1]['displayScale']=1
    tileset=dict(type='tileset',version='1.10',tiledversion='1.11.2',name='comic-floors',tilewidth=64,tileheight=32,tilecount=12,columns=4,margin=2,spacing=4,image='comic-floors.png',imagewidth=272,imageheight=108,objectalignment='center',tiles=[dict(id=i,properties=[dict(name='assetId',type='string',value=a['id'])]) for i,a in enumerate(floors)])
    (OUT/'tilesets/comic-floors.tsj').write_text(json.dumps(tileset,indent=2)+'\n')
    # Collection-of-images tileset is for editor inspection. Tall images are 2x:
    # keep native dimensions in Tiled, set object width/height to 0.5 raster size.
    objects=[a for a in ASSETS if a['category'].startswith('environment/') and a['category']!='environment/floors']
    tiles=[]
    for i,a in enumerate(objects):
        tiles.append(dict(id=i,image='../'+str(Path(a['path']).relative_to('apps/client/public/assets')),imagewidth=a['dimensions'][0],imageheight=a['dimensions'][1],properties=[dict(name='assetId',type='string',value=a['id']),dict(name='anchorX',type='float',value=float(a['anchorPixels'][0])),dict(name='anchorY',type='float',value=float(a['anchorPixels'][1])),dict(name='displayScale',type='float',value=.5)]))
    objset=dict(type='tileset',version='1.10',name='comic-architecture',tilewidth=256,tileheight=192,tilecount=len(tiles),columns=0,objectalignment='bottom',tiles=tiles)
    (OUT/'tilesets/comic-architecture.tsj').write_text(json.dumps(objset,indent=2)+'\n')
    # A geometry-preserving editor-only copy. Runtime loader deliberately stays unchanged.
    demo=json.loads((ROOT/'packages/shared/src/maps/twin-vaults.json').read_text())
    demo['tilesets']=[dict(firstgid=1,source='../../apps/client/public/assets/tilesets/comic-floors.tsj')]
    (DOC/'twin-vaults-art-preview.tmj').write_text(json.dumps(demo,indent=2)+'\n')


def contact_sheets():
    group_names={'environment':'ENVIRONMENT','characters':'CHARACTERS','props':'PROPS','puzzles':'PUZZLES','artifacts':'ARTIFACTS','ui':'UI'}
    all_strips=[]
    font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    font=ImageFont.truetype(font_path,12);title_font=ImageFont.truetype(font_path,23)
    for group,title in group_names.items():
        entries=[a for a in ASSETS if a['category'].startswith(group)]
        # Each animation gets a frame contact sheet rather than shrinking the full sheet.
        if group=='characters':
            entries=[a for a in entries if 'frameCount' in a]
        cols=6;cw=224;ch=232;rows=math.ceil(len(entries)/cols)
        sheet=Image.new('RGB',(cols*cw,64+rows*ch),'#202529');dr=ImageDraw.Draw(sheet)
        dr.text((20,18),title+' / native raster size, panels reduced to fit',font=title_font,fill='#D4A079')
        for i,a in enumerate(entries):
            x=(i%cols)*cw;y=64+(i//cols)*ch
            dr.rectangle((x+5,y+5,x+cw-5,y+ch-5),fill='#34404A')
            im=Image.open(ROOT/a['path']).convert('RGBA')
            if 'frameCount' in a:im=im.crop((96,128,192,256))
            im.thumbnail((cw-20,ch-54),RESAMPLE)
            sheet.paste(im,(x+(cw-im.width)//2,y+12+(ch-60-im.height)//2),im)
            dr.text((x+12,y+ch-40),a['id'],font=font,fill='#E0C8AA')
            dr.text((x+12,y+ch-22),f"{a['dimensions'][0]}x{a['dimensions'][1]}",font=font,fill='#9BA9B2')
        sheet.save(DOC/f'CONTACT_{title}.png',optimize=True)
        all_strips.append(sheet)
    full=Image.new('RGB',(1344,sum(im.height for im in all_strips)),'#202529');y=0
    for im in all_strips:full.paste(im,(0,y));y+=im.height
    full.save(DOC/'ASSET_CONTACT_SHEET.png',optimize=True)
    # Explicit per-frame review sheet includes every character animation frame.
    review=Image.new('RGB',(5*112*2,8*144*4+48),'#202529');dr=ImageDraw.Draw(review)
    dr.text((12,12),'ANIMATION REVIEW / blue and orange, 8 directions x 5 poses / all four designs',font=font,fill='#D4A079')
    for ci,name in enumerate(['explorer','scout','traveler','ranger']):
        for ti,team in enumerate(['blue','orange']):
            im=Image.open(OUT/f'characters/{name}-{team}.png').convert('RGBA')
            for row in range(8):
                for col in range(5):
                    frame=im.crop((col*96,row*128,(col+1)*96,(row+1)*128))
                    review.paste(frame,(ti*560+col*112+8,48+ci*1152+row*144),frame)
    review.save(DOC/'ANIMATION_CONTACT_SHEET.png',optimize=True)


def scene_previews():
    mapping={a['id']:a for a in ASSETS}
    scene=Image.new('RGBA',(2600,1440),'#202529')
    phone_scene=Image.new('RGBA',scene.size,'#202529')
    origin=np.array([900,170]);draw_queue=[]
    def place(name,logical,front=True,alpha=1):
        a=mapping[name];im=Image.open(ROOT/a['path']).convert('RGBA')
        if 'frameCount' in a:
            im=im.crop((96,128,192,256))
        anchor=np.array(a['anchorPixels'])
        if name.startswith('floor-'):
            im=im.resize((128,64),RESAMPLE);anchor*=2
        if alpha!=1:im.putalpha(im.getchannel('A').point(lambda x:round(x*alpha)))
        pos=proj(*logical)+origin-anchor
        if front:draw_queue.append((sum(logical),im,tuple(pos.astype(int)),logical[0]<768))
        else:
            scene.alpha_composite(im,tuple(pos.astype(int)))
            if logical[0]<768:phone_scene.alpha_composite(im,tuple(pos.astype(int)))
    tiled=json.loads((ROOT/'packages/shared/src/maps/twin-vaults.json').read_text())
    ground=next(l for l in tiled['layers'] if l['name']=='Ground')
    for i,gid in enumerate(ground['data']):
        if gid:
            x,y=i%tiled['width'],i//tiled['width']
            choice=['regular','cracked','worn'][gid-1]
            place('floor-'+choice,(x*64+32,y*64+32),False)
    # Real authored objects at their real logical footprints and elevations.
    for layer in tiled['layers']:
        for o in layer.get('objects',[]):
            kind=o.get('class',o.get('type'))
            x,y,w,d=[o.get(k,0)*2 for k in ['x','y','width','height']]
            h=next((p['value'] for p in o.get('properties',[]) if p['name']=='elevation'),0)
            if kind=='wall' and layer['name']=='Walls':
                nx,ny=math.ceil(w/64),math.ceil(d/64)
                for yy in range(ny):
                    for xx in range(nx):
                        ww,dd=w/nx,d/ny;logical=(x+(xx+.5)*ww,y+(yy+.5)*dd)
                        a=mapping[wall_id(ww,dd,h)]
                        im=Image.open(ROOT/a['path']).convert('RGBA')
                        alpha=.36 if 'south' in o['name'] or 'east' in o['name'] else 1
                        im.putalpha(im.getchannel('A').point(lambda z:round(z*alpha)))
                        pos=proj(*logical)+origin-[64,116]
                        draw_queue.append((sum(logical),im,tuple(pos.astype(int)),logical[0]<768))
            elif layer['name']=='Objects' and kind in ['door','pillar','crate']:
                name={'door':'door-wood-x-closed','pillar':'column','crate':'crate'}[kind]
                place(name,(x+w/2,y+d/2))
    # Curated noninteractive art placements, collision map itself is untouched.
    extra=[('chest',370,350),('barrel',140,400),('sack',188,420),('lantern',500,560),
           ('table',450,180),('stool',425,250),('rope',180,180),('pottery',580,470),
           ('bookshelf',1160,180),('books-stack',1060,330),('rubble',1260,580),
           ('panel-x-active',500,120),('terminal-x-inactive',1100,125),
           ('switch-x-active',1230,160),('push-button-x-inactive',1320,235),
           ('pressure-plate-pressed',1130,440),('key-world',370,390),
           ('crystal-world',1290,400),('medallion-world',1080,580),
           ('parchment-world',1010,310),('coin-world',370,320)]
    for name,x,y in extra:place(name,(x,y))
    positions=[(270,420),(350,500),(470,420),(550,500),(1050,400),(1130,500),(1240,430),(1360,540)]
    for i,(x,y) in enumerate(positions):
        name=['explorer','scout','traveler','ranger'][i%4];team='blue' if i<4 else 'orange'
        place(name+'-'+team,(x,y))
    for _,im,pos,visible_on_phone in sorted(draw_queue,key=lambda x:x[0]):
        scene.alpha_composite(im,pos)
        if visible_on_phone:phone_scene.alpha_composite(im,pos)
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',24)
    dr=ImageDraw.Draw(scene);dr.text((32,24),'TWIN VAULTS / exported assets on the existing logical map',font=font,fill='#D4A079')
    dr.text((32,60),'Two teams / art preview only / foreground walls faded for readability',font=font.font_variant(size=16),fill='#9BA9B2')
    scene.convert('RGB').save(DOC/'ASSET_PREVIEW.png',optimize=True)
    # Phone viewport approximation, camera at 1.3x zoom in a 844x390 CSS layout.
    center=proj(400,400)+origin
    crop=phone_scene.crop((int(center[0]-844/1.3),int(center[1]-390/1.3),int(center[0]+844/1.3),int(center[1]+390/1.3)))
    phone=crop.resize((844,390),RESAMPLE).convert('RGB');d=ImageDraw.Draw(phone)
    d.rectangle((0,0,844,33),fill='#202529');d.text((15,8),'PHONE SCALE / 844 x 390 / camera zoom 1.3 / blue team',font=font.font_variant(size=14),fill='#D4A079')
    phone.save(DOC/'MOBILE_PREVIEW.png',optimize=True)
    # Animated review, with the same frames shipped in the pack.
    frames=[]
    for step in range(4):
        gif=Image.new('RGB',(560,180),'#34404A')
        for i,name in enumerate(['explorer','scout','traveler','ranger']):
            sh=Image.open(OUT/f'characters/{name}-blue.png').convert('RGBA');f=sh.crop(((step+1)*96,128,(step+2)*96,256))
            gif.paste(f,(20+i*132,30),f)
        frames.append(gif)
    frames[0].save(DOC/'WALK_PREVIEW.gif',save_all=True,append_images=frames[1:],duration=145,loop=0,disposal=2)


def preview_sample():
    scene=Image.new('RGBA',(800,520),(32,37,41,255))
    floor=Image.open(OUT/'environment/floors/floor-regular.png').convert('RGBA').resize((128,64),RESAMPLE)
    for y in range(6):
        for x in range(6):
            scene.alpha_composite(floor,(400+(x-y)*64-64,125+(x+y)*32-32))
    for x in range(6):
        wall=Image.open(OUT/'environment/walls/wall-x-38.png').convert('RGBA')
        scene.alpha_composite(wall,(400+x*64-64,125+x*32-116))
    placements=[('environment/doors/door-wood-x-closed.png',2,0),
                ('props/chest.png',3,2),('characters/explorer.png',2,3),
                ('puzzles/panel.png',4,3)]
    for path,x,y in placements:
        im=Image.open(OUT/path).convert('RGBA')
        a=next(a['anchorPixels'] for a in ASSETS if a['path'].endswith(path))
        scene.alpha_composite(im,(int(400+(x-y)*64-a[0]),int(125+(x+y)*32-a[1])))
    dr=ImageDraw.Draw(scene)
    dr.text((24,20),'SIX-ASSET STYLE GATE / actual exported artwork',fill='#D4A079')
    scene.convert('RGB').save(DOC/'SAMPLE_PREVIEW.png')


def wall_id(w,d,height):
    orientation='x' if w>d else 'y'
    if (abs(w-64)<.01 and abs(d-8)<.01) or (abs(w-8)<.01 and abs(d-64)<.01):
        return f'wall-{orientation}-{height}'
    fmt=lambda n: f'{n:.3f}'.rstrip('0').rstrip('.').replace('.','p')
    return f'wall-{orientation}-{height}-{fmt(w)}x{fmt(d)}'


def manifest_document():
    from collections import Counter
    complete=[a for a in ASSETS if a['status']=='complete']
    counts=Counter(a['category'] for a in complete)
    lines=['# Asset manifest','',
           '153 production PNGs and two separately stored sample exports. Eight character sheets contain 320 aligned frames. The floor atlas is counted as one packaging image in addition to its twelve individual tiles. All assets are original AI-generated paintings, painted-material derivatives, or explicitly identified deterministic ink glyphs.','',
           'Machine-readable source of truth: `apps/client/public/assets/manifest.json`. Exact source prompts: `docs/art/generation-sources.json`. Rebuild and integration instructions: [INTEGRATION.md](INTEGRATION.md). Licensing: [LICENSE.md](LICENSE.md).','',
           '## Production counts','', '| Category | PNG files |','| --- | ---: |']
    lines += [f'| {category} | {count} |' for category,count in counts.items()]
    lines += ['', '## Rendering and coverage','',
              '- 64 × 32 floor diamonds, 64 × 64 logical grid; object artwork uses 2× density at display scale 0.5. All anchors below are raster pixels; footprint sizes are logical units.',
              '- X/Y wall and door orientations follow the logical axes. Walls include 24/32/38 heights and exact partial-length pieces matching the current map. Door leaves use fixed canvases, anchors and hinges across open/closed states; indicators and openings are separate.',
              '- Characters: four designs, two teams, eight headings, one idle and four walk poses per heading. Five native views plus three pre-mirrored views. Numeric and named Phaser metadata are both supplied.',
              '- Puzzle artwork: blank clue panel and terminal; switch, button and plate states; separate symbols and lock indicators. No secrets, labels or answers are baked into images.',
              '- Collectibles: five world sprites and five matching UI icons. Props, structures and UI are individually separated PNGs. Panel nine-slice and content insets are in JSON.',
              '- No navigable stair asset: the current collision plane has no height traversal. No run, emote, interaction or idle-breathing animation is claimed. The one-frame idle is intentional.',
              '', '## Validation and visual limits','',
              '`validation.json` records successful alpha, dimensions, border, anchor, frame uniqueness, frame baseline, Tiled reference and diamond coverage checks. Contact sheets and room/phone previews are built from exported PNGs. `scripts/check-art-browser.mjs` separately exercises the PNG/atlas/spritesheet loaders and the Tiled floor atlas in Phaser; its CI report and render are uploaded as the Art assets workflow artifact. Local browser spawning was blocked in the task environment; no local Phaser-browser pass is claimed.',
              '', 'Mirrored character directions mirror painted highlights and equipment asymmetry. The four-pose walk has a deliberately economical comic cadence; it is not a motion-captured animation. Small world lamps are supplemental cues and should be paired with readable interaction UI. Flat source paintings are retained for reworking; they are not production sprites. Architecture collection tiles require explicit 0.5 object scaling in Tiled. Physical-phone integration testing remains pending.',
              '', '## Previews','',
              '- [Full native-size asset contact sheet](ASSET_CONTACT_SHEET.png)',
              '- [Environment](CONTACT_ENVIRONMENT.png), [characters](CONTACT_CHARACTERS.png), [props](CONTACT_PROPS.png), [puzzles](CONTACT_PUZZLES.png), [artifacts](CONTACT_ARTIFACTS.png), [UI](CONTACT_UI.png)',
              '- [All 320 animation frames](ANIMATION_CONTACT_SHEET.png) and [walk loop](WALK_PREVIEW.gif)',
              '- [Two adjacent rooms on the existing map](ASSET_PREVIEW.png)',
              '- [844 × 390 phone camera approximation](MOBILE_PREVIEW.png)',
              '- [Six-asset sample gate](SAMPLE_PREVIEW.png)',
              '', '## Per-asset catalog','',
              'All file paths below are repository-relative. Intended use and full processing notes are also stored per asset in JSON. Unless marked sample-only, these are complete exported artwork files, awaiting user art approval and later loader integration. Glyphs are composable visual symbols rather than puzzle codes.','']
    for category in dict.fromkeys(a['category'] for a in ASSETS):
        lines += [f'### {category}','', '| ID / intended use | File | Pixels | Logical footprint | Anchor | States / animation | Source / processing | Status |','| --- | --- | --- | --- | --- | --- | --- | --- |']
        for a in [a for a in ASSETS if a['category']==category]:
            dims=' × '.join(str(v) for v in a['dimensions'])
            footprint=' × '.join(f'{v:g}' for v in a['footprintLogical']) if a['footprintLogical'] else 'screen / package'
            anchor=', '.join(f'{v:g}' for v in a['anchorPixels'])
            state=', '.join(a['states']) or 'static'
            if a.get('frameCount'):state+='; 40 × 96×128; 8 directions'
            lines.append(f"| `{a['id']}` — {a['intendedUse']} | `{a['path']}` | {dims} | {footprint} | {anchor} | {state} | {a['source']} | {a['status']} |")
        lines.append('')
    lines+=['## Retained sources','',
            'The 40 retained generated paintings are editable PNGs, not layered PSDs. Their exact generation prompts and paths are indexed in `generation-sources.json`. They are source material only, excluded from the production count. The supplied reference illustration is not redistributed.','',
            'All source artwork and derivatives use the reuse terms in LICENSE.md. No new font files, stock art, external textures or asset packs are bundled.']
    (DOC/'ASSET_MANIFEST.md').write_text('\n'.join(lines)+'\n')


def main():
    floor_tiles(); architecture()
    object_sprite('explorer','characters',(96,128),(72,104),(28,28))
    object_sprite('chest','props',(96,96),(76,68),(48,40))
    object_sprite('panel','puzzles',(112,96),(96,64),(56,8))
    preview_sample()
    structures_and_furniture();character_sheets();props();icons_and_artifacts();panels();puzzle_assets()
    package_tilesets();contact_sheets();scene_previews()
    # The initial standalone character/panel remain representative sample art,
    # explicitly separate from the runtime-oriented directional/mounted exports.
    for a in ASSETS:
        if a['id'] in ['explorer','panel']:
            a['status']='sample-only'
            old=ROOT/a['path'];dest=DOC/'samples'/old.name;dest.parent.mkdir(exist_ok=True)
            old.replace(dest);a['path']=str(dest.relative_to(ROOT))
        a['intendedUse']=('screen-space UI' if a.get('screenSpace') else 'ground-anchored world artwork')
        a['licensing']='Original AI-generated artwork and deterministic derivatives; see docs/art/LICENSE.md'
        a['generationMethod']='Original deterministic ink glyph' if 'deterministic ink' in a['source'] else 'Built-in image generation; offline raster export and assembly'
    (OUT/'manifest.json').write_text(json.dumps(dict(schemaVersion=1,projection=dict(tileWidth=64,tileHeight=32,worldTileSize=64),assets=ASSETS),indent=2)+'\n')
    manifest_document()


if __name__=='__main__':
    main()

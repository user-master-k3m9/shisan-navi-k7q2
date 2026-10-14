# 重ねるハザードマップ（国土地理院）のタイルから、座標ごとの災害リスクを読む
# 使い方: hazard.lookup(座標リスト, refresh=False) → hazard_cache.json を更新
import os, io, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
from common import DATA, RAW, load, save, http, tile, ckey

Z = 14
LAYERS = {'flood': '01_flood_l2_shinsuishin_data', 'surge': '03_hightide_l2_shinsuishin_data',
          'tsunami': '04_tsunami_newlegend_data', 'debris': '05_dosekiryukeikaikuiki',
          'slope': '05_kyukeishakeikaikuiki', 'slide': '05_jisuberikeikaikuiki'}
DEPTH = [((255, 255, 179), 0.3), ((247, 245, 169), 0.5), ((248, 225, 166), 1), ((255, 216, 192), 3),
         ((255, 183, 183), 5), ((255, 145, 145), 10), ((242, 133, 201), 20), ((220, 122, 220), 30)]
TILES = os.path.join(RAW, 'tiles')


def classify(layer, rgba):
    r, g, b, a = rgba
    if a < 128:
        return 0
    if layer in ('debris', 'slope', 'slide'):
        return 2 if r < 240 and g < 100 else 1  # 赤系=特別警戒, 黄=警戒
    return min(DEPTH, key=lambda c: sum((c[0][i] - rgba[i]) ** 2 for i in range(3)))[1]


def fetch(job):
    layer, x, y = job
    p = os.path.join(TILES, layer, '%d_%d.png' % (x, y))
    if os.path.exists(p):
        return
    os.makedirs(os.path.dirname(p), exist_ok=True)
    b = http('https://disaportaldata.gsi.go.jp/raster/%s/%d/%d/%d.png' % (LAYERS[layer], Z, x, y), timeout=30)
    with open(p, 'wb') as f:
        f.write(b or b'')


def lookup(coords, refresh=False):
    cache = {} if refresh else load('hazard_cache.json', {})
    todo = [(la, lo) for la, lo in coords if ckey(la, lo) not in cache]
    if not todo:
        return cache
    jobs = {(L,) + tile(lo, la, Z)[:2] for la, lo in todo for L in LAYERS}
    print('ハザード: 新しい地点', len(todo), 'タイル', len(jobs), flush=True)
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(fetch, jobs))
    imgs = {}
    for la, lo in todo:
        x, y, fx, fy = tile(lo, la, Z)
        px, py = int(fx * 256), int(fy * 256)
        h = {}
        for L in LAYERS:
            p = os.path.join(TILES, L, '%d_%d.png' % (x, y))
            if not os.path.exists(p) or not os.path.getsize(p):
                continue
            if p not in imgs:
                if len(imgs) > 2000:
                    imgs.clear()
                imgs[p] = Image.open(p).convert('RGBA')
            im = imgs[p]
            v = max(classify(L, im.getpixel((min(255, max(0, px + dx)), min(255, max(0, py + dy)))))
                    for dx in (-1, 0, 1) for dy in (-1, 0, 1))
            if v:
                h[L] = v
        cache[ckey(la, lo)] = h
    save('hazard_cache.json', cache)
    return cache


if __name__ == '__main__':
    # python hazard.py --refresh : タイルを取り直して全部判定し直す（3か月ごと）
    if '--refresh' in sys.argv:
        import shutil
        shutil.rmtree(TILES, ignore_errors=True)
        old = load('hazard_cache.json', {})
        coords = [tuple(map(float, k.split(','))) for k in old]
        lookup(coords, refresh=True)

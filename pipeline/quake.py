# 地震の揺れ（J-SHIS 防災科学技術研究所）：250mメッシュごとに
#  p6l/p6u = 30年以内に震度6弱/6強以上の確率、arv = 地盤の揺れやすさ（増幅率）、geo = 微地形（液状化しやすさの目安）
import json, time, os
from concurrent.futures import ThreadPoolExecutor
from common import load, save, http

API = 'https://www.j-shis.bosai.go.jp/map/api/'


def mesh250(lat, lon):
    p = int(lat * 1.5); u = int(lon - 100); la = lat * 1.5 - p; lo = lon - 100 - u
    q = int(la * 8); v = int(lo * 8); la = la * 8 - q; lo = lo * 8 - v
    r = int(la * 10); w = int(lo * 10); la = la * 10 - r; lo = lo * 10 - w
    s1 = (1 if la < .5 else 3) + (0 if lo < .5 else 1); la = (la * 2) % 1; lo = (lo * 2) % 1
    s2 = (1 if la < .5 else 3) + (0 if lo < .5 else 1)
    return '%02d%02d%d%d%d%d%d%d' % (p, u, q, v, r, w, s1, s2)


def one(mc):
    out = {}
    for kind, path in (('p', 'pshm/Y2024/AVR/TTL_MTTL'), ('s', 'sstrct/V4')):
        for k in range(4):
            try:
                b = http(API + path + '/meshinfo.geojson?meshcode=' + mc, timeout=60)
                f = json.loads(b)['features'][0]['properties']
                break
            except Exception:
                time.sleep(5 * (k + 1)); f = None
        if not f:
            return mc, None
        if kind == 'p':
            out['p6l'] = round(float(f.get('T30_I55_PS') or 0), 3); out['p6u'] = round(float(f.get('T30_I60_PS') or 0), 3)
        else:
            out['arv'] = float(f.get('ARV') or 0) or None; out['geo'] = f.get('JNAME') or ''
    time.sleep(0.3)
    return mc, out


def lookup(coords, budget_min=None):
    cache = load('quake_cache.json', {})
    need = sorted({mesh250(la, lo) for la, lo in coords} - set(cache))
    print('地震 新しいメッシュ', len(need), flush=True)
    t0 = time.time(); n = 0
    if os.environ.get('QUAKE_CACHE_ONLY'):
        need = []
    with ThreadPoolExecutor(6) as ex:
        for i in range(0, len(need), 300):  # 300件ずつ。時間の上限を超えたら残りは次回
            if budget_min is not None and time.time() - t0 > budget_min * 60:
                print('地震：時間切れ。残り', len(need) - i, '件は次回', flush=True); break
            for mc, v in ex.map(one, need[i:i + 300]):
                if v:
                    cache[mc] = v; n += 1
            save('quake_cache.json', cache); print(' …', n, flush=True)
    save('quake_cache.json', cache)
    return cache


if __name__ == '__main__':
    import sys
    sys.path.insert(0, '.')
    from common import ROOT
    import os
    d = json.load(open(os.path.join(ROOT, 'data.json')))
    geo = load('district_geo.json', {})
    coords = [(p['la'], p['lo']) for p in d['points']] + [(v[0], v[1]) for v in geo.values() if v]
    lookup(coords)

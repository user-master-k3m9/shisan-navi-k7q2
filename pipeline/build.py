# 全部まとめて最新にする：python pipeline/build.py
#   --refresh-hazard   災害タイルを取り直す（3か月ごとにワークフローが付ける）
#   --skip-news        ニュースを取らない
import os, sys, json, math, datetime, csv
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openpyxl
from common import ROOT, DATA, PREFS, load, save, dist, ckey
import base, hazard, reinfo, news

TODAY = datetime.date.today().isoformat()


def population(path):
    pop, names = {}, {}
    wb = openpyxl.load_workbook(path, read_only=True)
    for r in wb.worksheets[0].iter_rows(min_row=6, values_only=True):
        if not r[0] or not isinstance(r[4], (int, float)):
            continue
        c = '%05d' % int(r[0])
        if c[:2] in PREFS:
            pop[c] = [int(v) for v in r[4:11]]
            if r[3]:
                names[c] = r[3]
    return pop, names


def stations(path):
    st = json.load(open(path, encoding='utf-8'))['features']
    G = {}
    for f in st:
        p = f['properties']; cs = f['geometry']['coordinates']; lo, la = cs[len(cs) // 2]
        if not (138.3 < lo < 141.0 and 34.8 < la < 37.3):
            continue
        g = G.setdefault(p['S12_001g'], {'ops': {}, 'xy': [], 'lines': set(), 'name': p['S12_001']})
        g['xy'].append((lo, la)); g['lines'].add(p['S12_003'])
        cols = sorted(int(k[4:]) for k in p if k[:4] == 'S12_' and k[4:].isdigit() and int(k[4:]) >= 9 and (int(k[4:]) - 9) % 4 == 0)
        o = g['ops'].setdefault(p['S12_002'], {})
        for n in cols:
            y = 2011 + (n - 9) // 4
            o[y] = max(o.get(y, 0), p.get('S12_%03d' % n) or 0)
    out = []
    for g in G.values():
        years = sorted({y for o in g['ops'].values() for y in o})
        tot = {y: sum(o.get(y, 0) for o in g['ops'].values()) for y in years}
        last = years[-1] if years else 2024
        lo = sum(x for x, _ in g['xy']) / len(g['xy']); la = sum(y for _, y in g['xy']) / len(g['xy'])
        out.append(dict(n=g['name'], lat=round(la, 5), lon=round(lo, 5), p24=tot.get(last, 0), p19=tot.get(2019, 0), py=last,
                        l='・'.join(sorted(g['lines']))[:60]))
    return out


class Grid:
    """近くの点をすばやく探す"""
    def __init__(self, items, key):
        self.g = defaultdict(list); self.key = key
        for i, it in enumerate(items):
            la, lo = key(it); self.g[(int(la * 20), int(lo * 20))].append(i)
        self.items = items

    def near(self, la, lo, r=1):
        out = []
        for a in range(-r, r + 1):
            for b in range(-r, r + 1):
                out += self.g.get((int(la * 20) + a, int(lo * 20) + b), [])
        return out

    def nearest(self, la, lo):
        for r in (1, 2, 4, 8, 30):
            c = self.near(la, lo, r)
            if c:
                return min(c, key=lambda i: dist(la, lo, *self.key(self.items[i])))
        return -1


def main():
    meta = load('meta.json', {})
    land = base.get_land()
    pts = base.build_points()
    st_path, st_year = base.get_stations()
    sts = stations(st_path)
    pop, names = population(base.get_population())
    proj = list(csv.DictReader(open(os.path.join(DATA, 'projects.tsv'), encoding='utf-8'), delimiter='\t'))
    for q in proj:
        q['lat'] = float(q['lat']); q['lon'] = float(q['lon'])
    coords = [(p['lat'], p['lon']) for p in pts]
    hz = hazard.lookup(coords, refresh='--refresh-hazard' in sys.argv)
    if '--refresh-hazard' in sys.argv:
        meta['hazard'] = TODAY
    meta.setdefault('hazard', '2026-10-14')

    rr = reinfo.run(coords)
    liq = load('liq_cache.json', {})
    if rr:
        rows, geo, liq = rr
        meta['tx'] = TODAY
        hazard.lookup([(v[0], v[1]) for v in geo.values() if v])  # 地区の位置の災害もまとめて判定
    sg = Grid(sts, lambda s: (s['lat'], s['lon']))
    byname = defaultdict(list)
    for i, s in enumerate(sts):
        byname[s['n']].append(i)
    out = []
    for p in pts:
        la, lo = p['lat'], p['lon']
        cand = [i for i in byname.get(p['st'], []) if dist(la, lo, sts[i]['lat'], sts[i]['lon']) < 4000]
        si = min(cand, key=lambda i: dist(la, lo, sts[i]['lat'], sts[i]['lon'])) if cand else sg.nearest(la, lo)
        if si >= 0 and dist(la, lo, sts[si]['lat'], sts[si]['lon']) > 6000:
            si = -1
        near = sorted([[j, int(dist(la, lo, q['lat'], q['lon']))] for j, q in enumerate(proj) if dist(la, lo, q['lat'], q['lon']) < 3000], key=lambda x: x[1])[:6]
        yr = p['y']; h = p['hist']
        hist = [h.get(y, 0) for y in range(yr - 10, yr + 1)]
        o = dict(i=p['id'], s=p['src'], y=yr, c=p['code'], a=p['addr'], pr=p['price'], yo=p['yoy'], ar=p['area'], u=p['use'], cu=p['cur'],
                 sn=p['st'], sd=p['dist'], z=p['zone'], far=p['far'], bcr=p['bcr'], e=p['env'], la=la, lo=lo, h=hist,
                 hz=hz.get(ckey(la, lo), {}), si=si, pj=near)
        lq = liq.get(ckey(la, lo))
        if lq:
            o['lq'] = lq
        out.append(o)

    # ---- 売買事例（市区町村ごとのファイル）----
    txindex = load('txindex.json', {})
    if rr:
        pg = Grid(out, lambda p: (p['la'], p['lo']))
        bym = defaultdict(list)
        for r in rows:
            bym[r['code']].append(r)
        txindex = {}
        os.makedirs(os.path.join(ROOT, 'tx'), exist_ok=True)
        for code, rs in bym.items():
            dl, di = [], {}
            recs = []
            for r in sorted(rs, key=lambda r: -(r['per'] or 0)):
                q = r['pref'] + r['muni'] + r['dist']
                if q not in di:
                    g = geo.get(code + '|' + q)
                    if g:
                        la, lo = g[0], g[1]
                        np_ = pg.nearest(la, lo)
                        dl.append([r['dist'], la, lo, hz_point(la, lo), liq.get(ckey(la, lo)), out[np_]['i'] if np_ >= 0 else -1])
                    else:
                        dl.append([r['dist'], None, None, {}, None, -1])
                    di[q] = len(dl) - 1
                unit = r['unit'] or (round(r['price'] / r['area']) if r['area'] else None)
                recs.append([r['t'], 1 if r['c'] == '成約' else 0, di[q], r['price'], r['area'], unit, r['plan'], r['tfa'], r['by'], r['st'],
                             r['per'], r['far'], r['ren'], r['rem'], r['shape'], r['road']])
            save('tx/%s.json' % code, dict(d=dl, r=recs), root=ROOT)
            txindex[code] = [len(recs), max((r[10] or 0) for r in recs)]
        save('txindex.json', txindex)

    munis = {c: [PREFS[c[:2]], names.get(c, ''), pop[c]] for c in pop}
    if '--skip-news' not in sys.argv:
        nw = news.fetch({c: v[1] for c, v in munis.items()})
        if nw:
            save('news.json', dict(items=nw, built=TODAY), root=ROOT)
            meta['news'] = TODAY
    meta.update(dict(built=TODAY, land=land, stations=st_year))
    save('meta.json', meta)
    src = {'地価': '国土数値情報 地価公示(%d年)・都道府県地価調査(%d年)' % (land['L01'], land['L02']),
           '駅': '国土数値情報 駅別乗降客数(%d年度まで)' % (st_year - 1),
           '人口': '国立社会保障・人口問題研究所 日本の地域別将来推計人口(令和5年推計)',
           '災害': '国土地理院 重ねるハザードマップ オープンデータ（%s取得）' % meta['hazard'],
           '計画': '各事業者・自治体の公表資料と報道（一覧は随時更新）'}
    if meta.get('tx'):
        src['売買'] = '国土交通省 不動産情報ライブラリ 不動産価格（取引価格・成約価格）情報（%s取得）' % meta['tx']
        src['液状化'] = '国土交通省都市局 地形区分に基づく液状化の発生傾向図（不動産情報ライブラリ経由）'
    save('data.json', dict(points=out, stations=sts, muni=munis, projects=proj, built=TODAY, meta=meta, txindex=txindex, sources=src), root=ROOT)
    print('完成', len(out), '地点', os.path.getsize(os.path.join(ROOT, 'data.json')) // 1024, 'KB', flush=True)


_hzc = None
def hz_point(la, lo):
    global _hzc
    if _hzc is None:
        _hzc = load('hazard_cache.json', {})
    k = ckey(la, lo)
    if k not in _hzc:
        _hzc = hazard.lookup([(la, lo)])  # 1件ずつは遅いので、通常は事前にまとめて判定済み
    return _hzc.get(k, {})


if __name__ == '__main__':
    main()

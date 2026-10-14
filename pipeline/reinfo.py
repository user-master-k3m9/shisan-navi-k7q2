# 国土交通省「不動産情報ライブラリ」API（キーが必要）
#  - XIT001 不動産価格（取引価格・成約価格）
#  - XKT025 液状化の発生傾向
# キーは環境変数 REINFO_KEY（GitHubでは Secrets に入れる。ファイルには書かない）
import os, re, json, time, datetime
from concurrent.futures import ThreadPoolExecutor
from common import PREFS, DATA, http, load, save, geocode, tile, ckey, dist

KEY = os.environ.get('REINFO_KEY', '').strip()
API = 'https://www.reinfolib.mlit.go.jp/ex-api/external/'
TYPES = {'中古マンション等': 'm', '宅地(土地と建物)': 'h', '宅地(土地)': 'l'}


def api(name, **q):
    url = API + name + '?' + '&'.join('%s=%s' % kv for kv in q.items())
    b = http(url, headers={'Ocp-Apim-Subscription-Key': KEY}, timeout=120)
    if b is None:
        return None
    return json.loads(b.decode('utf-8'))


def num(s):
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return s
    s = str(s).replace(',', '')
    m = re.search(r'\d+(\.\d+)?', s)
    return float(m.group()) if m else None


def year_built(s):
    s = str(s or '')
    if '戦前' in s:
        return 1945
    m = re.search(r'(\d{4})', s)
    return int(m.group(1)) if m else None


def period(s):
    m = re.search(r'(\d{4})年第(\d)四半期', str(s or ''))
    return int(m.group(1)) * 10 + int(m.group(2)) if m else None


def fetch_transactions(years=3):
    """直近 years 年分（今年を含む）の関東の売買。都県×年ごとに取る。"""
    this = datetime.date.today().year
    rows = []
    for pc in PREFS:
        for y in range(this - years + 1, this + 1):
            j = api('XIT001', year=y, area=pc)
            n = 0
            for r in (j or {}).get('data', []):
                t = TYPES.get(r.get('Type'))
                if not t:
                    continue
                price = num(r.get('TradePrice'))
                if not price:
                    continue
                rows.append(dict(t=t, c='成約' if '成約' in str(r.get('PriceCategory', '')) else '取引',
                                 code=str(r.get('MunicipalityCode', ''))[:5], pref=r.get('Prefecture', ''), muni=r.get('Municipality', ''),
                                 dist=r.get('DistrictName', '') or '', price=price, area=num(r.get('Area')),
                                 unit=num(r.get('UnitPrice')), plan=r.get('FloorPlan', '') or '', tfa=num(r.get('TotalFloorArea')),
                                 by=year_built(r.get('BuildingYear')), st=r.get('Structure', '') or '', per=period(r.get('Period')),
                                 far=num(r.get('FloorAreaRatio')), bcr=num(r.get('CoverageRatio')), ren=r.get('Renovation', '') or '',
                                 rem=r.get('Remarks', '') or '', shape=r.get('LandShape', '') or '', road=num(r.get('Breadth'))))
                n += 1
            print('売買', PREFS[pc], y, n, flush=True)
            time.sleep(1)
    return rows


def locate_districts(rows):
    """地区（町丁）の位置。一度調べたものは district_geo.json に残す"""
    geo = load('district_geo.json', {})
    need = sorted({(r['code'], r['pref'] + r['muni'] + r['dist']) for r in rows if r['code']} - {(k.split('|')[0], k.split('|')[1]) for k in geo})
    print('地区の位置を新しく調べる数', len(need), flush=True)
    t0 = time.time()

    def one(item):
        code, q = item
        if time.time() - t0 > 90 * 60:  # 1回の実行で長くかかりすぎないよう、残りは次回に回す
            return item, 'skip'
        try:
            g = geocode(q)
        except Exception:
            return item, 'skip'
        time.sleep(0.2)
        return item, g

    done = 0
    with ThreadPoolExecutor(4) as ex:
        for (code, q), g in ex.map(one, need):
            if g == 'skip':
                continue
            geo[code + '|' + q] = g; done += 1
            if done % 1000 == 0:
                save('district_geo.json', geo); print(' …', done, flush=True)
    save('district_geo.json', geo)
    return geo


def liquefaction(coords):
    """XKT025（ズーム13のタイル）から座標の液状化傾向を読む。結果は liq_cache.json"""
    cache = load('liq_cache.json', {})
    todo = [(la, lo) for la, lo in coords if ckey(la, lo) not in cache]
    if not todo:
        return cache
    Z = 13
    tiles = {}
    for la, lo in todo:
        tiles.setdefault(tile(lo, la, Z)[:2], []).append((la, lo))
    print('液状化 タイル', len(tiles), flush=True)

    def get(xy):
        try:
            return xy, api('XKT025', response_format='geojson', z=Z, x=xy[0], y=xy[1])
        except Exception as e:
            print('液状化 取得失敗', xy, e, flush=True)
            return xy, None

    with ThreadPoolExecutor(4) as ex:
        for xy, j in ex.map(get, tiles):
            feats = (j or {}).get('features', [])
            boxes = []
            for f in feats:
                g = f.get('geometry') or {}
                cs = g.get('coordinates') or []
                pts = []
                def walk(c):
                    if c and isinstance(c[0], (int, float)):
                        pts.append(c)
                    else:
                        for x in c:
                            walk(x)
                walk(cs)
                if not pts:
                    continue
                xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
                pr = f.get('properties') or {}
                boxes.append((min(xs), min(ys), max(xs), max(ys), pr.get('liquefaction_tendency_level'), pr.get('note', '')))
            for la, lo in tiles[xy]:
                hit = None
                for x0, y0, x1, y1, lv, note in boxes:
                    if x0 <= lo <= x1 and y0 <= la <= y1:
                        hit = [lv, note]
                        break
                cache[ckey(la, lo)] = hit
    save('liq_cache.json', cache)
    return cache


def run(points_coords):
    """キーがあれば売買・液状化を更新。戻り値: (rows, geo, liq) か None"""
    if not KEY:
        print('REINFO_KEY がないので、売買価格・液状化の更新はとばします', flush=True)
        return None
    rows = fetch_transactions()
    geo = locate_districts(rows)
    dc = [(v[0], v[1]) for v in geo.values() if v]
    liq = liquefaction(list(points_coords) + dc)
    return rows, geo, liq

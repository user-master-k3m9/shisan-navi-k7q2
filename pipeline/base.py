# 国の公開データ（キー不要）の最新版を取ってくる：地価公示・地価調査・駅乗降客数・将来人口
import os, io, json, glob, zipfile, datetime
from common import RAW, DATA, PREFS, http, save, load

KSJ = 'https://nlftp.mlit.go.jp/ksj/gml/data'
NOW = datetime.date.today().year % 100


def latest(kind, pat):
    """新しい年度から順に探し、最初に見つかった年度（2桁）を返す"""
    for y in range(NOW + 1, NOW - 4, -1):
        u = '%s/%s/%s-%02d/%s' % (KSJ, kind, kind, y, pat % y)
        b = http(u, timeout=120)
        if b and b[:2] == b'PK':
            return y, b
    raise RuntimeError(kind + ' が見つかりません')


def unzip(b, dest):
    os.makedirs(dest, exist_ok=True)
    zipfile.ZipFile(io.BytesIO(b)).extractall(dest)


def get_land():
    info = {}
    for kind in ('L01', 'L02'):
        y = None
        for pc in PREFS:
            if y is None:
                y, b = latest(kind, kind + '-%02d_' + pc + '_GML.zip')
            else:
                b = http('%s/%s/%s-%02d/%s-%02d_%s_GML.zip' % (KSJ, kind, kind, y, kind, y, pc), timeout=120)
            unzip(b, os.path.join(RAW, kind, pc))
        info[kind] = 2000 + y
        print(kind, '年度', 2000 + y, flush=True)
    return info


def num_fields(p, prefix):
    return sorted((int(k.split('_')[1]), v) for k, v in p.items() if k.startswith(prefix + '_') and k.split('_')[1].isdigit())


def history(p, prefix, year, price):
    """価格の年次推移：現在価格と一致する列から過去へ連続する数値列をたどる"""
    f = num_fields(p, prefix)
    idx = [i for i, (n, v) in enumerate(f) if n >= 60 and isinstance(v, (int, float)) and v == price]
    if not idx:
        return {year: price}
    j = idx[-1]; h = {}
    k = j
    while k >= 0 and isinstance(f[k][1], (int, float)) and not isinstance(f[k][1], bool):
        if f[k][1] > 0:
            h[year - (j - k)] = f[k][1]
        k -= 1
        if j - k > 40:
            break
    return h


# 項目の位置（国土数値情報の仕様）。後半は年度で1つずれることがあるので、
# 「周辺の利用状況（〜地域）」の列を見つけて、そこからの相対位置で読む。おかしければ check() が止める
MAP = {
    'L01': dict(code='001', y='007', price='008', yoy='009', addr='025', area='027', use='028', cur='029'),
    'L02': dict(code='020', y='005', price='006', yoy='007', addr='022', area='024', use='025', cur='026'),
}
REL = {'L01': dict(env=0, st=1, dist=3, zone=4, bcr=10, far=11), 'L02': dict(env=0, st=1, dist=2, zone=3, bcr=7, far=8)}


def env_index(feats, kind, addr_no):
    """ファイル全体で「〜地域」の長い文字が一番多く入っている列を、周辺の利用状況の列とみなす"""
    best, bn = None, 0
    for n in range(addr_no + 5, addr_no + 40):
        k = '%s_%03d' % (kind, n)
        c = sum(1 for ft in feats if isinstance(ft['properties'].get(k), str) and len(ft['properties'][k]) >= 6 and '地' in ft['properties'][k])
        if c > bn:
            best, bn = n, c
    return best


def check(rec):
    ok = (isinstance(rec['price'], (int, float)) and rec['price'] > 0 and isinstance(rec['addr'], str) and any(x in rec['addr'] for x in PREFS.values())
          and isinstance(rec['code'], str) and len(rec['code']) == 5 and isinstance(rec['dist'], (int, float))
          and isinstance(rec['zone'], str) and isinstance(rec['far'], (int, float)) and 0 <= rec["far"] <= 2000 and isinstance(rec['st'], str))
    if not ok:
        raise RuntimeError('地価データの項目の並びが変わりました。スクリプトの MAP を直してください: %r' % rec)


def build_points():
    out = []
    for kind, src in (('L01', '公示'), ('L02', '調査')):
        m = MAP[kind]
        for f in sorted(glob.glob(os.path.join(RAW, kind, '*', '**', '*.geojson'), recursive=True)):
            feats = json.load(open(f, encoding='utf-8'))['features']
            e = env_index(feats, kind, int(m['addr']))
            fld = dict(m); fld.update({k: '%03d' % (e + d) for k, d in REL[kind].items()})
            for ft in feats:
                p = ft['properties']; lo, la = ft['geometry']['coordinates']
                g = lambda k: p.get('%s_%s' % (kind, fld[k])) if k in fld else None
                rec = dict(src=src, y=g('y'), code=g('code'), addr=str(g('addr')).replace('　', ' '), price=g('price'), yoy=g('yoy'),
                           area=g('area'), use=g('use'), cur=g('cur'), st=g('st'), dist=g('dist'), zone=g('zone'), bcr=g('bcr'), far=g('far'),
                           env=g('env'), lon=round(lo, 6), lat=round(la, 6))
                check(rec)
                rec['hist'] = history(p, kind, rec['y'], rec['price'])
                out.append(rec)
    # 公示と調査の共通地点は公示を残す
    koji = [(p['lat'], p['lon']) for p in out if p['src'] == '公示']
    grid = {}
    for a, b in koji:
        grid.setdefault((round(a, 2), round(b, 2)), []).append((a, b))
    def dup(p):
        if p['src'] != '調査':
            return False
        for da in (-0.01, 0, 0.01):
            for db in (-0.01, 0, 0.01):
                for a, b in grid.get((round(p['lat'] + da, 2), round(p['lon'] + db, 2)), []):
                    if abs(p['lat'] - a) < 0.0003 and abs(p['lon'] - b) < 0.0004:
                        return True
        return False
    out = [p for p in out if not dup(p)]
    for i, o in enumerate(out):
        o['id'] = i
    print('地価地点', len(out), flush=True)
    return out


def get_stations():
    y, b = latest('S12', 'S12-%02d_GML.zip')
    unzip(b, os.path.join(RAW, 'S12'))
    f = glob.glob(os.path.join(RAW, 'S12', '**', 'UTF-8', '*.geojson'), recursive=True)
    if not f:
        f = glob.glob(os.path.join(RAW, 'S12', '**', '*.geojson'), recursive=True)
    print('駅データ', 2000 + y, flush=True)
    return f[0], 2000 + y


def get_population():
    p = os.path.join(RAW, 'kekkahyo1.xlsx')
    b = http('https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/2gaiyo_hyo/kekkahyo1.xlsx', timeout=120)
    open(p, 'wb').write(b)
    return p

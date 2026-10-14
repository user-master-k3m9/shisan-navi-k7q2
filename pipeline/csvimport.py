# 不動産情報ライブラリの画面からダウンロードしたCSV（zipのままでもよい）を読み込む
# 置き場所：~/fudosan-src/txcsv/ （ダウンロードフォルダから自動でここへ移す）
import os, io, re, csv, glob, zipfile
from reinfo import TYPES, num, year_built, period

DIR = os.path.expanduser('~/fudosan-src/txcsv')
COLS = {  # CSVの見出し（の一部）→ 内部の名前
    'type': '種類', 'cat': '価格情報区分', 'code': '市区町村コード', 'pref': '都道府県名', 'muni': '市区町村名', 'dist': '地区名',
    'stn': '最寄駅：名称', 'stm': '最寄駅：距離', 'price': '取引価格（総額）', 'plan': '間取り', 'area': '面積（㎡）', 'unit': '取引価格（㎡単価）',
    'shape': '土地の形状', 'tfa': '延床面積', 'by': '建築年', 'st': '建物の構造', 'road': '幅員', 'bcr': '建ぺい率', 'far': '容積率',
    'per': '取引時期', 'ren': '改装', 'rem': '取引の事情',
}


def _rows_from_text(text):
    rd = csv.reader(io.StringIO(text))
    head = next(rd, None)
    if not head:
        return []
    idx = {}
    for k, label in COLS.items():
        for i, h in enumerate(head):
            if label in h and k not in idx:
                idx[k] = i
    if 'type' not in idx or 'price' not in idx:
        return []
    out = []
    for r in rd:
        g = lambda k: r[idx[k]].strip() if k in idx and idx[k] < len(r) else ''
        t = TYPES.get(g('type').replace('（', '(').replace('）', ')'))
        price = num(g('price'))
        if not t or not price:
            continue
        stm = g('stm')
        out.append(dict(t=t, c='成約' if '成約' in g('cat') else '取引', code=g('code')[:5], pref=g('pref'), muni=g('muni'), dist=g('dist'),
                        price=price, area=num(g('area')), unit=num(g('unit')), plan=g('plan'), tfa=num(g('tfa')), by=year_built(g('by')),
                        st=g('st'), per=period(g('per')), far=num(g('far')), bcr=num(g('bcr')), ren=g('ren'), rem=g('rem'), shape=g('shape'),
                        road=num(g('road')), stn=g('stn'), stm=num(stm) if stm else None))
    return out


def _decode(b):
    for enc in ('utf-8-sig', 'cp932'):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            pass
    return b.decode('cp932', 'replace')


def load_rows():
    rows, seen = [], set()
    for f in sorted(glob.glob(os.path.join(DIR, '*'))):
        blobs = []
        if f.lower().endswith('.zip'):
            z = zipfile.ZipFile(f)
            blobs = [z.read(n) for n in z.namelist() if n.lower().endswith('.csv')]
        elif f.lower().endswith('.csv'):
            blobs = [open(f, 'rb').read()]
        for b in blobs:
            for r in _rows_from_text(_decode(b)):
                key = (r['t'], r['code'], r['dist'], r['price'], r['area'], r['per'], r['by'], r['plan'], r['c'])
                if key in seen:  # 同じ期間を重ねてダウンロードしても二重にしない
                    continue
                seen.add(key); rows.append(r)
    print('CSVの売買事例', len(rows), flush=True)
    return rows

# 東京都「地震に関する地域危険度測定調査（第9回）」：町丁目ごとの建物倒壊・火災・総合危険度（ランク1〜5、5が最も危険）
import csv, io, time
from concurrent.futures import ThreadPoolExecutor
from common import http, load, save, geocode

URL = 'https://www.funenka.metro.tokyo.lg.jp/2024/01/all2.csv'


def rows():
    b = http(URL, timeout=120)
    for enc in ('utf-8-sig', 'cp932'):
        try:
            t = b.decode(enc); break
        except UnicodeDecodeError:
            continue
    rd = csv.reader(io.StringIO(t)); head = next(rd)
    ix = lambda s: next(i for i, h in enumerate(head) if s in h)
    I = dict(m=ix('区市町名'), n=ix('町丁目名'), g=ix('地盤分類'), b=ix('建物倒壊危険度ランク'), f=ix('火災危険度ランク'), a=ix('困難係数'), t=ix('総合危険度ランク'))
    out = []
    for r in rd:
        try:
            out.append(dict(m=r[I['m']], n=r[I['n']], g=r[I['g']], b=int(r[I['b']]), f=int(r[I['f']]), t=int(r[I['t']]), a=float(r[I['a']] or 0)))
        except (ValueError, IndexError):
            continue
    return out


def update():
    """位置が分かっていない町丁目だけ調べて fire_tokyo.json に保存"""
    old = {(x['m'], x['n']): x for x in load('fire_tokyo.json', [])}
    rs = rows()
    need = [r for r in rs if (r['m'], r['n']) not in old or old[(r['m'], r['n'])].get('la') is None]
    print('東京都の地域危険度', len(rs), '町丁目（位置を調べる', len(need), '）', flush=True)

    def one(r):
        try:
            g = geocode('東京都' + r['m'] + r['n'])
        except Exception:
            g = None
        time.sleep(0.2)
        return r, g
    with ThreadPoolExecutor(4) as ex:
        for r, g in ex.map(one, need):
            if g:
                r['la'], r['lo'] = g[0], g[1]
    out = []
    for r in rs:
        o = old.get((r['m'], r['n']))
        if o and o.get('la') is not None and 'la' not in r:
            r['la'], r['lo'] = o['la'], o['lo']
        out.append(r)
    save('fire_tokyo.json', out)
    return out


if __name__ == '__main__':
    update()

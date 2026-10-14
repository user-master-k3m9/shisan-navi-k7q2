# 再開発・新駅・延伸の最新ニュース（見出しとリンクだけ。Googleニュースの公開RSS）
import re, urllib.parse, xml.etree.ElementTree as ET, email.utils, datetime, time
from common import PREFS, http

WORDS = '(再開発 OR 新駅 OR 延伸 OR 新線 OR 区画整理 OR タワーマンション OR 駅前開発)'


def fetch(munis):
    """munis: {code: 市区町村名}。戻り値: [{t,u,s,d,p,m:[code..]}]"""
    seen = set(); out = []
    for pc, pn in PREFS.items():
        q = '%s %s when:60d' % (pn, WORDS)
        url = 'https://news.google.com/rss/search?q=%s&hl=ja&gl=JP&ceid=JP:ja' % urllib.parse.quote(q)
        try:
            b = http(url, timeout=60)
        except Exception as e:
            print('ニュース取得失敗', pn, e, flush=True); continue
        if not b:
            continue
        for it in ET.fromstring(b).iter('item'):
            t = (it.findtext('title') or '').strip(); u = it.findtext('link') or ''
            src = it.findtext('source') or ''
            t = re.sub(r'\s*-\s*' + re.escape(src) + r'$', '', t) if src else t
            if not t or t in seen:
                continue
            seen.add(t)
            try:
                d = email.utils.parsedate_to_datetime(it.findtext('pubDate')).date().isoformat()
            except Exception:
                d = ''
            ms = [c for c, n in munis.items() if n and len(n) >= 2 and n in t]
            pp = sorted({c[:2] for c in ms}) or [k for k, v in PREFS.items() if v in t or v[:-1] in t]
            if not pp:
                continue  # 関東の地名が見出しにないものは除く
            out.append(dict(t=t, u=u, s=src, d=d, p=pp, m=ms))
        time.sleep(2)
    out.sort(key=lambda x: x['d'], reverse=True)
    print('ニュース', len(out), flush=True)
    return out[:400]

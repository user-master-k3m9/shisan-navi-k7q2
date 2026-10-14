# 共通の道具（場所・距離・通信・タイル）
import os, json, math, time, gzip, urllib.request, urllib.error, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # リポジトリ（=公開フォルダ）
PIPE = os.path.join(ROOT, 'pipeline')
DATA = os.path.join(PIPE, 'data')     # 毎回引き継ぐデータ（コミットする）
RAW = os.path.join(PIPE, 'raw')       # ダウンロードした元データ（コミットしない）
PREFS = {'08': '茨城県', '09': '栃木県', '10': '群馬県', '11': '埼玉県', '12': '千葉県', '13': '東京都', '14': '神奈川県'}
UA = {'User-Agent': 'shisan-navi/1.0 (+https://github.com/user-master-k3m9/shisan-navi-k7q2)'}
os.makedirs(DATA, exist_ok=True); os.makedirs(RAW, exist_ok=True)


def load(name, default=None):
    p = os.path.join(DATA, name)
    if not os.path.exists(p):
        return default
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def save(name, obj, root=DATA):
    p = os.path.join(root, name)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, p)


def http(url, headers=None, timeout=60, tries=3, ok404=True):
    """GETしてbytesを返す。404はNone。gzipは自動で解凍。"""
    h = dict(UA); h.update(headers or {})
    for k in range(tries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout)
            b = r.read()
            if r.headers.get('Content-Encoding') == 'gzip' or b[:2] == b'\x1f\x8b':
                b = gzip.decompress(b)
            return b
        except urllib.error.HTTPError as e:
            if e.code == 404 and ok404:
                return None
            if e.code in (401, 403):
                raise
            time.sleep(3 * (k + 1))
        except Exception:
            time.sleep(3 * (k + 1))
    raise RuntimeError('通信に失敗: ' + url)


def dist(a, b, c, d):
    x = (d - b) * math.cos(math.radians((a + c) / 2)) * 111320
    y = (c - a) * 110540
    return math.hypot(x, y)


def tile(lon, lat, z):
    n = 2 ** z
    fx = (lon + 180) / 360 * n
    fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return int(fx), int(fy), fx % 1, fy % 1


def ckey(lat, lon):
    return '%.5f,%.5f' % (lat, lon)


def geocode(q):
    """国土地理院の住所検索。見つからなければNone。"""
    b = http('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + urllib.parse.quote(q), timeout=30)
    if not b:
        return None
    j = json.loads(b)
    if not j:
        return None
    lon, lat = j[0]['geometry']['coordinates']
    return [round(lat, 5), round(lon, 5), j[0]['properties'].get('title', '')]

#!/bin/bash
# 毎週このMacで実行：最新データを取り直して公開する（launchd から呼ばれる）
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/ghcli
REPO=$HOME/fudosan-upload
cd "$REPO" || exit 1
GH=$HOME/.local/ghcli/gh
GITC=(-c credential.helper= -c "credential.helper=!$GH auth git-credential" -c user.name=user-master-k3m9 -c user.email=user-master-k3m9@users.noreply.github.com)
echo "=== $(date) 開始"
git "${GITC[@]}" pull -q --rebase || true
ARGS=""
M=$(date +%-m); D=$(date +%-d)
# 1・4・7・10月の最初の週は、災害の想定を全部取り直す
if [ $((M % 3)) -eq 1 ] && [ $D -le 7 ]; then ARGS="--refresh-hazard"; fi
[ -n "$1" ] && ARGS="$ARGS $*"
/usr/bin/python3 pipeline/build.py $ARGS || { echo "作成に失敗"; exit 1; }
git add -A data.json pipeline/data
[ -f news.json ] && git add news.json
[ -d tx ] && git add -A tx
if git diff --cached --quiet; then echo "変更なし"; exit 0; fi
git "${GITC[@]}" commit -qm "データを自動更新 $(date +%Y-%m-%d)"
git "${GITC[@]}" push -q && echo "公開しました"
echo "=== $(date) 終了"

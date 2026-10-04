#!/usr/bin/env bash
# Downloads the inputs for scripts/build-dict.mjs into dict-src/ (gitignored).
# Needs: curl, npm, python3. Usage: bash scripts/fetch-dict-sources.sh && node scripts/build-dict.mjs dict-src
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dict-src && cd dict-src

curl -fsSL -o cccanto-webdist.txt https://raw.githubusercontent.com/amadeusine/cc-canto-data/master/cccanto-webdist.txt

for pkg in cedict-json to-jyutping; do
  rm -rf "$pkg" && mkdir "$pkg"
  tgz=$(npm pack "$pkg" --silent)
  tar xzf "$tgz" -C "$pkg" && rm "$tgz"
done
cp cedict-json/package/cedict.json cedict.json
cp to-jyutping/package/dist/index.mjs to-jyutping.mjs

python3 -m venv .venv
.venv/bin/pip install -q jieba pycantonese
.venv/bin/python - <<'PY'
import collections, json, os, shutil, jieba, pycantonese
shutil.copy(os.path.join(os.path.dirname(jieba.__file__), 'dict.txt'), 'jieba-dict.txt')
han = lambda w: any('一' <= ch <= '鿿' for ch in w)
counts = collections.Counter(w for w in pycantonese.hkcancor().words() if han(w))
json.dump(counts, open('hkcancor_freq.json', 'w'), ensure_ascii=False)
PY
ls -la cccanto-webdist.txt cedict.json to-jyutping.mjs jieba-dict.txt hkcancor_freq.json

#!/usr/bin/env bash
# Browser tests (Playwright + Chromium). Run from the repo root: bash test/run.sh
set -e
python3 build.py
python3 -m http.server 8766 --directory dist >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1
python3 test/v2.py      # menus, all modes, specials, boosters, shop, saves
python3 test/ret.py     # player level, chest, constellations, near-miss
python3 test/sdk.py     # SDK calls for yandex / poki / crazygames / vk (mocked)
python3 test/ya2.py     # Yandex shortcut, review prompt, world leaderboard (mocked)
python3 test/land.py    # desktop layout
python3 test/skins.py    # painted skin atlases in field and shop
python3 test/lang.py     # language toggle (EN by default on CrazyGames)
python3 test/cgrec.py    # CrazyGames records: no world tab, no other portal names
python3 test/pikabu.py   # Pikabu: Russian name and language, PkbSDK saves and ads, works with the SDK blocked
python3 test/music.py  # renders 66 s of music offline -> test/music.raw
echo "ALL TESTS FINISHED"

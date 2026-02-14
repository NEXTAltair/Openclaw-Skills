---
name: videolibrary-organizer
description: Organize B:\未視聴 into B:\VideoLibrary using mediaops.sqlite metadata. Covers: program_aliases.json curation, re-extract batches (run_metadata_batches_promptv1.py), QA to prevent folder explosion, folder creation/sync under B:\VideoLibrary\by_program\<program>\YYYY\MM, and a preview→plan→human review→apply workflow before any file moves.
---

# VideoLibrary Organizer (安全運用フロー)

目的：`mediaops.sqlite` の `path_metadata (source=llm)` を正として、`B:\未視聴` を `B:\VideoLibrary` へ安全に整理する。

このスキルは **ファイル移動前**の「辞書化→再抽出→QA→フォルダ整合→move plan」までを定型化する。

## 正（source of truth）
- 正：`/mnt/b/_AI_WORK/db/mediaops.sqlite`
- 正規化辞書：`B:\_AI_WORK\rules\program_aliases.json`（WSL: `/mnt/b/_AI_WORK/rules/program_aliases.json`）
- 出力フォルダ：`B:\VideoLibrary\by_program\<program>\YYYY\MM\`

## 絶対ルール
- **air_date は推測しない**（取れなければ `null`）。
- **move/apply は必ず plan を作って人間レビュー**。
- フォルダ名は Win 禁止文字を除去/置換し、必要なら短縮＋ハッシュ。

## 日常運用（普段）

### A) 番組名の揺れ・長文化の修正（辞書化）
- 番組名が「回タイトル/説明文」まで含んでフォルダが増殖する場合：`program_aliases.json` に番組名固定ルールを追加。
- 追加後は **該当分だけ**再抽出。

実行（該当キューがある場合）：
- `/home/altair/.openclaw/workspace/val/mediaops/run_metadata_batches_promptv1.py` を使う
- `--rules /mnt/b/_AI_WORK/rules/program_aliases.json`

### B) QA（移動前に必ず）
最低限チェック：
- `program_title` に `\1` などの漏れが無い
- `program_title` が長文化していない（countが少ない長文）
- フォルダ爆発（episodeごと program_dir）が起きていない

### C) フォルダ整合（DBに合わせる）
- 先にフォルダを大量作成しない。
- 作る/消すなら「DBに存在する program×YYYY×MM だけ」に同期する。

## 自動修復（完全自動モード）
長文化 `program_title` によるフォルダ増殖の自動修復：
- スクリプト：`/home/altair/.openclaw/workspace/val/mediaops/autofix_videolibrary_long_titles.py`
- 実行：
  - dry-run: `uv run python autofix_videolibrary_long_titles.py --dry-run`
  - apply: `uv run python autofix_videolibrary_long_titles.py --apply`

※このスクリプトは「フォルダ（B:\VideoLibrary\by_program）」の掃除はするが、**動画ファイルは移動しない**。

## 未定義っぽいタイトルの扱い（AI判定→必要ならWeb検索）
辞書に無い/判定が揺れる/長文化している等で **番組名が怪しい**場合は、次の順で処理する。

1) **疑義検出（DB起点）**
- `program_title` が長いのに件数が少ない
- 同一番組っぽい prefix が複数ある（表記ゆれ）
- 枠語（映画/アンコール/BS11ガンダムアワー等）が先頭にある

2) **AI判定（候補生成）**
- filename（`paths.name` / `evidence.raw`）から「番組名候補」「サブタイトル候補」「枠語」を抽出。
- ここでは *候補生成* に徹し、確定は辞書へ落とす。

3) **Web検索（必要時のみ）**
- 条件：候補が複数あり、誤統合が起きそうな時（特番/映画/シリーズ名が紛らわしい等）
- 検索クエリ例：`<候補タイトル> 番組名` / `<候補タイトル> 放送` / `<候補タイトル> シリーズ`

4) **辞書化（確定）**
- `program_aliases.json` に「番組名固定/枠語除去/表記統一」ルールを追加
- 該当分だけ再抽出→フォルダ同期

注意：Web検索は「決定の根拠」にはなるが、運用は必ず辞書（決定的）で固定する。

## ファイル移動（次フェーズ）

### ✅ 現行の自動化フロー（2026-02-09 更新）
`B:\未視聴` の整理は、**Win側PS1でファイル操作**（列挙/正則化/リネーム/移動）を行い、WSL(OpenClaw)側Pythonで **DB/LLM/plan生成**を行うハイブリッド構成に移行した。

**エントリポイント（WSL/OpenClawから実行）**
- `/home/altair/.openclaw/workspace/val/mediaops/unwatched_pipeline_runner.py`
  - `--apply` で実移動（Windows `Move-Item`）
  - `--limit N` で1バッチの最大件数を制御

実行例：
```bash
cd /home/altair/.openclaw/workspace/val/mediaops
uv run python unwatched_pipeline_runner.py --limit 50 --apply
```

**Win側スクリプト（正）** ※設置先: `B:\_AI_WORK\scripts\`
- `normalize_unwatched_names.ps1`
  - 空白→`_` / `:`・`：`→`_` / `_output`除去 / 全角数字→半角（※手動マップで安全変換）
  - 監査: `rename_apply_*.jsonl`
- `fix_prefix_timestamp_names.ps1`
  - `YYYYMMDDHHMMSSxxxx-タイトル.ext` のような「冒頭タイムスタンプ」を末尾へ移動して決定的サフィックス化
  - 監査: `prefix_ts_fix_apply_*.jsonl`
- `unwatched_inventory.ps1`
  - `B:\未視聴` 再帰インベントリを JSONL で出力（UTF-8）
- `apply_move_plan.ps1`
  - WSLが生成した plan JSONL を実行して Move-Item
  - 監査: `move_apply_*.jsonl`
- `rollback_rename_jsonl.ps1`
  - `rename_apply_*.jsonl` を元にリネームを巻き戻す

**WSL側補助スクリプト（重要）**
- inventory ingest: `ingest_inventory_jsonl.py`
- queue(再抽出): `make_metadata_queue_from_inventory.py`
- extract/upsert: `run_metadata_batches_promptv1.py`
- plan生成: `make_move_plan_from_inventory.py`
- move結果→DB反映: `update_db_paths_from_move_apply.py`
- ログローテ: `rotate_move_audit_logs.py`（keep 5）

### 日付サフィックス対応（決定的抽出）
`run_metadata_batches_promptv1.py` の `extract_air_date()` は次の末尾形式に対応済み：
- `YYYY_MM_DD_HH_MM`
- `YYYY_MM_DD_HH_MM-(n)` / `YYYY_MM_DD_HH_MM_(n)` / `YYYY_MM_DD_HH_MM(n)`
- `YYYY-MM-DD-HHMM`
- `YYYYMMDDHHmmss`
- `YYYYMMDDHHMM`

### ファイル名に日付が無い場合
ファイル名から決定的に `air_date` が取れない場合、**ファイルmtime(InventoryのmtimeUtc)** を `air_date` に採用して move できる（推測ではなく観測値）。


### 重要：DBのpaths.pathが“古いファイル名”を持つことがある
この環境では `paths.path` が **Windows表記（例：`B:\未視聴\...`）**で保持される。
一方、実ファイル名は正則化（空白→`_`、`：`→`_` 等）済みで、**DBの文字列が古い**ことがある。

そのため move は **pass1で移動→pass2で回収/DB整合** の2段構えを標準にする。

### pass1: メタデータに従って move（基本）
- スクリプト：`/home/altair/.openclaw/workspace/val/mediaops/move_to_videolibrary_by_program.py`
- dry-run：`uv run python move_to_videolibrary_by_program.py --dry-run`
- apply：`uv run python move_to_videolibrary_by_program.py --apply`

特性：
- `B:\未視聴` → `B:\VideoLibrary\by_program\<program>\YYYY\MM\` へ移動
- DB（paths）も移動先に更新
- `skip_missing`（DBが旧名で実体が見つからない）が一定数発生しうる

### pass2: skip_missing回収 + “既に移動済み”のDB整合
- スクリプト：`/home/altair/.openclaw/workspace/val/mediaops/move_to_videolibrary_by_program_pass2.py`
- 実行：`uv run python move_to_videolibrary_by_program_pass2.py --prev-log <pass1ログ> --apply`

狙い：
- タイムスタンプ末尾（YYYY_MM_DD_HH_MM など）で候補を見つけて回収
- 既に `by_program` に居る場合は、DBの古い行を自動で付け替え/削除して整合

### 失敗ケース（WSLが触れない）
`ENAMETOOLONG` や `/mnt/b/未視聴` の `EIO` が混じると、WSLの `stat/find` が不安定になる。
この場合は Windows側（cmd/robocopy等）で移動する仕組みを使う。
- 現状スクリプト：`/home/altair/.openclaw/workspace/val/mediaops/move_remaining_with_cmd.py`
- 注意：cmd.exe を WSL から起動するとカレントが `\\wsl.localhost\\...` (UNC) になりがちなので、スクリプト側で必ず `cd /d C:\\` を挟んでから実行する。
- 重要：未視聴の残件検出/回収は **再帰（サブフォルダ含む）** が正。cmd mover は `for /r` でインデックス化して回収する。

### 監査ログのローテーション（読みやすさルール）
監査ログが溜まって追えなくなるので、`/mnt/b/_AI_WORK/move` は **過去5バッチ分だけ保持**する。

- スクリプト：`/home/altair/.openclaw/workspace/val/mediaops/rotate_move_audit_logs.py`
- ルール：
  - `move_to_videolibrary_by_program_*.jsonl` は最新 **5** だけ残す
  - `remaining_unwatched_*.txt` は最新 **1** だけ残す
  - それ以外の古い `.jsonl` は `archive/` に移動して `.jsonl.gz` 圧縮
  - `MANIFEST.md` を更新（今見るべきログへのポインタ）

実行例：
```bash
uv run python /home/altair/.openclaw/workspace/val/mediaops/rotate_move_audit_logs.py --move-dir /mnt/b/_AI_WORK/move --keep-batches 5
```

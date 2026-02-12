# calibre-catalog-read

Calibreカタログ参照 + 1冊単位のAI読書パイプライン。

注: このパイプラインは、テキスト解析コスト/品質の観点から漫画・コミック系タイトルを対象外にする設計です。

## セットアップ

1. OpenClaw実行環境（このスキルを実行するマシン/ランタイム）にCalibreをインストールする。
   - 必須バイナリ: `calibredb` / `ebook-convert`
2. 上記バイナリがPATHに通っていることを確認する。
3. Calibre Content serverへ到達できることを確認する。
4. 接続先は必ず明示的な `HOST:PORT` を使う。
   - `http://HOST:PORT/#LIBRARY_ID`
5. 認証が有効な場合は `username` と `password env` を指定する。

## 重要

OpenClaw単体では不足です。実行環境にCalibreを入れて、必要バイナリを利用可能にしてください。

WindowsではDefender Controlled Folder Accessの影響でメタデータ/ファイル操作が失敗する場合があります。
`WinError 2/5` が出る場合は、Calibreライブラリフォルダや関連バイナリを許可対象に追加してください。

## クイックテスト（カタログ参照）

```bash
node scripts/calibredb_read.mjs list \
  --with-library "http://192.168.11.20:8080/#Calibreライブラリ" \
  --username user --password-env CALIBRE_PASSWORD \
  --limit 5
```

## クイックテスト（1冊パイプライン）

```bash
python3 scripts/run_analysis_pipeline.py \
  --with-library "http://192.168.11.20:8080/#Calibreライブラリ" \
  --username user --password-env CALIBRE_PASSWORD \
  --book-id 3 --lang ja
```

## サブエージェント入力の分割（推奨）

readツールの行サイズ制限を避けるため、抽出テキストを分割し、`subagent_input.json` 経由で `source_files` を渡します。

```bash
python3 scripts/prepare_subagent_input.py \
  --book-id 3 --title "<title>" --lang ja \
  --text-path /tmp/book_3.txt --out-dir /tmp/calibre_subagent_3
```

## 低テキスト時の安全策

抽出テキストが短すぎる場合、パイプラインは `reason: low_text_requires_confirmation` で停止し、確認を要求します。
`--force-low-text` はユーザー確認後のみ使ってください。

## チャット運用（必須: 2ターン）

チャット面では必ず2ターンに分けて実行します。

1) 開始ターン（高速）: 対象選定 -> spawn -> `run_state.py upsert` -> 即時ACK
2) 完了ターン（後続）: 完了イベント -> `handle_completion.py`（内部で `get -> apply -> remove/fail`）

spawnと同一ターンで `poll/wait/apply` を行わないでください。

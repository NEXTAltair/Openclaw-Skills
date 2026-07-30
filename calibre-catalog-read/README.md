# calibre-catalog-read

Calibreカタログ参照 + 1冊単位のAI読書パイプライン。

注: このパイプラインは、テキスト解析コスト/品質の観点から漫画・コミック系タイトルを対象外にする設計です。

## セットアップ

1. OpenClaw実行環境(このスキルを実行するマシン/ランタイム)にCalibreをインストールする。
   - 必須バイナリ: `calibredb` / `ebook-convert`
2. 上記バイナリがPATHに通っていることを確認する。
3. Calibre Content serverへ到達できることを確認する。
4. 接続先は必ず明示的な `HOST:PORT` を使う。
   - `http://HOST:PORT/#LIBRARY_ID`
   - `--with-library` を省略する場合は以下を事前設定する。
     - env: `CALIBRE_WITH_LIBRARY` / `CALIBRE_LIBRARY_URL` / `CALIBRE_CONTENT_SERVER_URL`
     - config: `~/.config/calibre-catalog-read/config.json` の `with_library`
     - `#LIBRARY_ID` が無いURLは `CALIBRE_LIBRARY_ID` または config `library_id` で補完可能
   - IP変更対策:
     - `CALIBRE_SERVER_HOSTS=host1,host2,...` を設定すると候補を順に試行
     - WSLでは `/etc/resolv.conf` の `nameserver` も自動候補に追加
   - `LIBRARY_ID` が不明なら `#-` で一覧確認可能。
     - 例: `calibredb list --with-library "http://HOST:PORT/#-" --username ... --password ...`
5. 認証が有効な場合は `~/.openclaw/.env` に設定する(推奨)。
   - `CALIBRE_USERNAME=<user>`
   - `CALIBRE_PASSWORD=<password>`
   - 認証方式は非SSL運用前提でDigest固定(自動)とし、`--auth-mode` / `--auth-scheme` は使わない
   - 実行時は `--password-env CALIBRE_PASSWORD` を渡す(ユーザー名はenvから自動読込)。
   - 任意で `~/.config/calibre-catalog-read/auth.json` に認証キャッシュ可能。
   - `--save-plain-password` は平文保存のため、明示指示がない限り使わない。

## 重要

OpenClaw単体では不足です。実行環境にCalibreを入れて、必要バイナリを利用可能にしてください。
チャット実行時は、参照処理を `node scripts/calibredb_read.mjs ...` 経由に寄せ、`calibredb` 直接実行は避けてください。
この運用では既存のCalibre Content serverに接続するため、`calibre-server` の起動は不要です。

WindowsではDefender Controlled Folder Accessの影響でメタデータ/ファイル操作が失敗する場合があります。
`WinError 2/5` が出る場合は、Calibreライブラリフォルダや関連バイナリを許可対象に追加してください。

## クイックテスト(カタログ参照)

```bash
node scripts/calibredb_read.mjs list \
  --with-library "http://192.168.11.20:8080/#Calibreライブラリ" \
  --password-env CALIBRE_PASSWORD \
  --limit 5
```

## クイックテスト(1冊パイプライン)

```bash
uv run python scripts/run_analysis_pipeline.py \
  --with-library "http://192.168.11.20:8080/#Calibreライブラリ" \
  --password-env CALIBRE_PASSWORD \
  --book-id 3 --lang ja
```

## サブエージェント入力の分割(推奨)

readツールの行サイズ制限を避けるため、抽出テキストを分割し、`subagent_input.json` 経由で `source_files` を渡します。

```bash
node scripts/prepare_subagent_input.mjs \
  --book-id 3 --title "<title>" --lang ja \
  --text-path /tmp/book_3.txt --out-dir /tmp/calibre_subagent_3
```

## 低テキスト時の安全策

抽出テキストが短すぎる場合、パイプラインは `reason: low_text_requires_confirmation` で停止し、確認を要求します。
`--force-low-text` はユーザー確認後のみ使ってください。

## チャット運用(必須: 2ターン)

チャット面では必ず2ターンに分けて実行します。

1) 開始ターン(高速)
- 対象選定
- `references/subagent-analysis.prompt.md` と対象ファイルから自己完結したtaskを作る
- OpenClaw `sessions_spawn`を直接呼んで委譲する
- `run_state.mjs upsert`
- 即時ACK

2) 完了ターン(後続)
- 完了イベント
- `handle_completion.mjs`(内部で `get -> apply -> remove/fail`)

busy-pollは行わず、runtimeの完了通知を待ってください。

## Subagent delegation

model・thinking・cleanupは設定済みの`calibre-reader` agent profileから読みます。

- OpenClaw `sessions_spawn`を直接呼ぶ。
- toolが公開する現在のschemaに従い、別の共通payloadを生成しない。
- model/thinkingは必要な場合だけ明示する。
- timeoutやcompletion routingはOpenClawの設定・lifecycleに任せる。

注意:
- taskは必ず`references/subagent-analysis.prompt.md`の入力・出力・権限契約を含める。
- subagentは解析JSONだけを返し、Calibre更新やユーザー応答を行わない。

# openclaw-skill-diy-pc-ingest

Discordなどに貼り付けたPCパーツ購入ログ/メモを、OpenClaw経由でNotionのDB(PCConfig / ストレージ / エンクロージャー / PCInput)に反映するためのスキル。

- 雑な情報OK(レシート文、箇条書き、型番だけ、など)
- 迷うところは止めて質問、確実なところは即時反映
- Notion APIは **2025-09-03**(data_sources世代)前提

> このリポジトリには個人のNotion IDやAPIキーは含めません。各自の環境に設定してください。

---

## できること

- Notionの各テーブルに対して **作成/更新(upsert運用)** を行う
- ストレージはシリアル優先で追記しやすい
- シリアル不明でもストレージ / PCInputへ登録でき、後から実シリアルを追記できる
- 必要に応じてストレージをPCConfig側にも「構成要素」としてミラー登録できる

---

## セットアップ

### 0) 導入済みのNotionスキルを確認

このスキルのNotion運用/デバッグ用依存は、ClawHubの `notion-api-automation` です。

- OCで読むスキル名は `notion`、ClawHubの配布名は `notion-api-automation` です。
- `skills_read(name="notion")` で実際の配置と手順を読みます。見つからなければ `skills_search` で候補を確認します。
- 読み込んだ `SKILL.md` の場所から `scripts/notionctl.mjs` を解決し、実行時の `--notionctl-path` で絶対パスを渡します。同じ親ディレクトリへの配置は前提にしません。
- `scripts/notion_apply_records.js` は依存スキルの `notionctl.mjs api` を使用します。単体では通信できません。
- `node <実際のCLIパス> --help` で `api` と必要な引数を確認します。導入済みで動く依存を再インストールする必要はありません。

未導入の場合だけ、対象エージェントを指定して導入します。

```bash
openclaw skills install @tristanmanchester/notion-api-automation --agent <agent-id>
```

`<agent-id>` はOCの設定済みエージェントIDです。人間のプロフィールIDではありません。
`dependsOnSkills` / `optionalEnv` / `network` はOCが解釈するmetadataではないため、依存確認や通信範囲は本文の手順で扱います。

### 1) Notion Integration を作る

1. https://www.notion.so/my-integrations でIntegrationを作成
2. Tokenを控える
3. 対象のNotionページ/DBをIntegrationに共有(Connect to)

### 1.5) Notion AIでDIY_PCスキーマを作成(推奨)

Notion AIに以下を貼り付けて、DIY_PC用の4テーブル(PCConfig / PCInput / ストレージ / エンクロージャー)を作成してください。
プロパティ名はスクリプトが参照するので、**表記どおり**に作るのが重要です。

```text
以下の要件で、Notion内に「DIY_PC」ページ配下に4つのデータベースを作成してください。各DBのプロパティ名は指定どおりにしてください(表記揺れ禁止)。

### 共通方針
- 日本語のプロパティ名はそのまま使う(例: 「購入日」)。
- 可能な限り “select / multi-select / date / number / checkbox” を適切に使う。
- まずは運用開始できる最小限で良い(あとで追加できる形に)。
- どのDBにも「メモ」(rich text)を入れる。

---

### 1) DB: ストレージ
目的: SSD/HDD/NVMe等の個体管理(シリアル、容量、健康状態、接続先PC、入れ物など)。

必須プロパティ:
- Name (title)
- シリアル (text)  ※判明していれば主キー。値は空欄でも可
- 種別 (select) 例: SSD, HDD
- 規格 (select) 例: NVMe, SATA
- 容量(GB) (number)
- 購入日 (date)
- 購入店 (text)
- 価格(円) (number)
- 状態 (select) 例: 稼働中, 取外し, 売却
- 健康 (select) 例: 正常, 警告, 損傷, 使用不能
- 健康根拠 (multi-select) 例: Scanner, SMART, 手動確認
- 最終チェック日 (date)
- 現在の接続先PC (select) 例: RecRyzen など(あとで選択肢追加できる形)
- 現在の入れ物 (select) 例: 内蔵, 外付けケース名 など
- メモ (rich text)

---

### 2) DB: エンクロージャー
目的: 外付けケース/ドック/筐体の管理(ベイ数、接続、運用名)。

必須プロパティ:
- Name (title)
- 取り外し表示名 (text)  ※Windowsの「安全な取り外し」で識別できる運用名
- 種別 (select) 例: USBケース, RAIDケース, ドック
- 接続 (select) 例: USB, Thunderbolt, LAN
- ベイ数 (number)
- 購入日 (date)
- 購入店 (text)
- 価格(円) (number)
- 普段つないでるPC (select)
- メモ (rich text)

---

### 3) DB: PCConfig
目的: PC構成部品の記録(部品単位の行)。ストレージ等を「このPCに刺さってる」として記録する用途でも使う。

必須プロパティ:
- Name (title)
- PC (select) 例: RecRyzen
- Category (select) 例: CPU, GPU, RAM, Storage, Motherboard, PSU, Case, Cooler, NIC, Capture, Other
- Spec (rich text)
- Purchase Date (date)
- Purchase Vendor (text)
- Purchase Price (number)
- Installed (checkbox)
- Active (checkbox)
- Status (status)
- Notes (rich text)
- Identifier (text) ※任意(将来使う可能性があるので残す)

---

### 4) DB: PCInput
目的: 解析しきれない入力をとりあえず溜める。後で人間が整形して他DBに移す。

必須プロパティ:
- 名前 (title)
- 型番 (text)
- Serial (text)  ※値は空欄でも可
- 購入日 (date)
- 購入店 (text)
- 価格(円) (number)
- メモ (rich text)

---

作成後、各DBを「DIY_PC」ページ配下に置いてください。
```

### 2) トークン(APIキー)を用意

ホストの保護された認証設定を使います。秘密値をチャット、コマンド、ログへ貼り付けないでください。

OpenClawでは `skills.entries["diy-pc-ingest"].apiKey` に設定する方法も使えます。
`apiKey` はこのskillの `primaryEnv` である `NOTION_API_KEY` として実行時に注入されます。
SecretRef provider はユーザー環境ごとに異なるため、このskillには特定のvault/item/pathを固定しません。

```json5
{
  skills: {
    entries: {
      "diy-pc-ingest": {
        apiKey: { source: "exec", provider: "your_notion_secret_provider", id: "value" }
      }
    }
  }
}
```

`source` は `env` / `file` / `exec` など、OpenClaw Gatewayで設定済みのSecretRef providerに合わせてください。

認証の注入はホストのagent runに限定され、別nodeやsandboxへ自動では渡りません。
依存CLIの `NOTION_TOKEN` / `NOTION_API_TOKEN` は補助的な認証経路ですが、このスキルのOC利用可能判定には `NOTION_API_KEY` または設定済み `apiKey` が必要です。

### 3) 対象IDを指定

ワークスペースの `AGENTS.md` 内 `DIY-PC Notion Targets` を確認し、対象ごとの `--<target>-dsid` / `--<target>-dbid` を指定します。自動検出スクリプトやconfig.json読み込みはありません。

## 使い方

インストール先の `SKILL.md` があるディレクトリから実行します。導入済みNotionスキルから解決したCLIの絶対パスを `--notionctl-path` で渡してください。優先順位はCLI引数、`NOTIONCTL_PATH`、従来の同階層 / owner外ルート探索です。明示したパスが無効なら別経路へ切り替えません。

### 既定動作はplan

```bash
node scripts/notion_apply_records.js --plan --notionctl-path "<RESOLVED_NOTIONCTL_PATH>" --storage-dsid <STORAGE_DS_ID> --storage-dbid <STORAGE_DB_ID> < records.jsonl
node scripts/notion_apply_records.js --apply --notionctl-path "<RESOLVED_NOTIONCTL_PATH>" --storage-dsid <STORAGE_DS_ID> --storage-dbid <STORAGE_DB_ID> < records.jsonl
```

`--dry-run` もplanです。モード省略でも書き込みません。mirrorにはPCConfigのIDも指定します。JSONL例:

```json
{"target":"storage","properties":{"Name":"Example SSD","シリアル":"EXAMPLE-001","メモ":"購入記録"}}
{"target":"storage","properties":{"Name":"Another SSD","購入日":"2026-10-05","価格(円)":5000,"メモ":"シリアル未確認"}}
```

入力/結果は個人情報を含むため、リポジトリ外で扱います。

- plan: 対象、キー、create/update/archive/skip、変更前後を表示。読み取りとqueryのみで書き込み0件。
- 重複キー、キー不足、未知のプロパティ、取得不完全はblocked。apply前の全件照合で書き込みを止めます。
- apply: 各操作前に再照合し、変更後を読み戻して一致したものだけappliedに計上。失敗後は残りをnot_executedとして停止。
- 成功/skip/失敗/未実行を確認してから日次メモや進捗を記録。部分成功を全体成功とは扱いません。
- 拒否時に別経路へ切り替えません。原因不明は不明のまま報告。問題解決後の再開では現状を再取得し、成功済み行を再作成せず未反映分をplanします。
- 既存のユーザー承認範囲内で不要な再承認を求めません。未承認のarchive/overwriteや曖昧な個体同定は確認します。
- Notion側に一意制約/トランザクションはありません。同じキーの同時実行を避けてください。

詳細なキー条件、JSONL、再開手順は [SKILL.md](SKILL.md) を参照してください。

### シリアル不明の扱い

- シリアル不明だけを理由に質問せず、値を省略して登録できます。`null`・空欄・`不明`・`unknown`・`n/a` なども共通シリアルとして保存しません。
- ストレージは `Name` と入力された `購入日` / `価格(円)`、PCInputは `型番` + `名前` と入力された購入情報で暫定照合します。シリアル既知の別行には名前だけで合流しません。
- 後から実シリアルを渡すと、同じ暫定情報の行へ追記できます。確定後は実シリアルまたは記録した `page_id` を使います。
- 同じ暫定情報の既存行が複数ある場合や、1バッチに同じ暫定情報の入力が複数ある場合は書込み前に止めます。別個体は名前にベイ番号・個体番号などを付け、同一個体への複数追記は1レコードへまとめます。偽シリアルは作りません。
- `overwrite:true` でも「不明」や空欄で既知シリアルは消しません。意図的な消去は `page_id` / `id` + `overwrite:true` + 明示的な `null` の組合せに限定します。
- ストレージのPCConfigミラーは、シリアル不明なら `Spec` を空欄に保ち、判明後に追記できるようにします。

### オプション(運用向け)

- `overwrite: true` : 既存値も上書き(nullで消すことも可能)
- `page_id`(または `id`): 指定したNotionページを直接PATCH(upsertをバイパス)
- `archive: true` : ページをアーカイブ(重複整理に便利)
- `mirror_to_pcconfig: true`(storageのみ): PCConfig側にもミラー登録
  - 必要: `現在の接続先PC`, `購入日`, `Name`

---

## 注意

- NotionはDB側のユニーク制約が弱いので、upsertはクライアント側ロジックで行います。
- 重複が起きた場合は `page_id + archive:true` で整理できます。
- IDやトークンを公開リポジトリに含めないでください。

---

## ライセンス

MIT

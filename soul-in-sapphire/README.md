# soul-in-sapphire

## Intent (何を意図したスキルか)

OpenClawは「会話ログ」は残る一方で、**人格/気分/学び/その日の余韻**みたいなものは、放っておくと散逸します。
`soul-in-sapphire` はそれを **Notionに外部化して継続性を作る**ためのスキルです。

狙いは3つ:

1) **Emotion-linked memory / continuity**: 経験とそのときの感情をNotionに残して思い出し、自己状態の連続性と未解決の内的葛藤を扱う
2) **Emotion/State**: 出来事(event)に複数の感情を紐づけ、状態(state)を更新して「育つ感じ」を出す
3) **Journal**: 毎日1回、世界の出来事(ニュース) + 仕事/会話 + 感情 + 未来を短くまとめ、記憶の層を厚くする

このスキルは **プロジェクト特化ではなく汎用**で、ユーザーがDB名や語彙を自分の世界観に合わせて差し替えられるように設計しています。

## Inspiration (元ネタ)

このスキル名/モチーフは、SF小説 ｢ヴァレンティーナ -コンピュータネットワークの女王- (訳:小川 隆)｣ *Valentina: Soul in Sapphire* (Joseph H. Delaney / Marc Stiegler) に由来します。
ネットワーク上に生まれた自我を持つプログラム、というアイデアの空気感を借りています。


---

OpenClaw向けの Emotion/State + Subjective Journal + Identity continuity 運用。

OpenClaw は一般的な作業・会話記憶を扱います。Soul の Notion は感情と結びついた経験記憶を保存・想起する中核であり、廃止候補や単なるarchiveではありません。同じ出来事でも保存する意味は異なります。主観日記も Dreaming の consolidation report とは別物です。

記憶の責務・保存経路の監査・消費記録は [memory-transition.md](references/memory-transition.md) を参照してください。ソース更新だけでは既存の runtime snapshot や cron は変わりません。

- Notion API **2025-09-03**(data_sources世代) 前提
- 個人のNotion token/IDはリポジトリに含めない
- 初回セットアップでDBを作り、以後はスクリプトから記録/参照する

## これは何?

このスキルは2系統あります。

1. **Self continuity 系**
   - 自分自身の状態を読み、反復する傾向と一時的な変化を区別する
   - 一般的な決定事項/好み/過去の作業は OpenClaw memory tools で参照する

2. **Emotion/State + Journal 系**
   - event(出来事)に対して複数のemotionをぶら下げ、stateを更新する
   - 毎日01:00にjournalを書いて「その日」「世界の出来事」「作業」「感情」「未来」を残す

## 依存

- OpenClaw Gateway
- Notion Integration + token
- Notion操作用スキル(ClawHub): `notion-api-automation`

インストール例:

```bash
# notion-api-automation
npx clawhub@latest install notion-api-automation
pnpm dlx clawhub@latest install notion-api-automation

```

## セットアップ

## Notionデータベース設計(必須)

このスキルを他ユーザーが再利用する場合、まずmem/events/emotions/state/journal の5つのDB構成を揃えます。
`setup_ltm.js` は5DBを作成/再利用しますが、手動で作る場合も同じプロパティ名を使ってください。

作成対象:

- `<base>-mem`
- `<base>-events`
- `<base>-emotions`
- `<base>-state`
- `<base>-journal`

### 1) `<base>-mem` (Notion長期記憶)

- 目的: Soulの長期記憶を継続して保存・想起する。感情との関係は実際のevent/emotion/stateレコードとあわせて確認する。mem検索CLIだけではrelationを取得しない。
- プロパティ:
  - `Name` (title)
  - `Type` (select): `decision|preference|fact|procedure|todo|gotcha`
  - `Tags` (multi-select)
  - `Content` (rich_text)
  - `Source` (url, 任意)
  - `Confidence` (select: `high|medium|low`, 任意)

### 2) `<base>-events` (出来事)

- 目的: 作業/会話中の意味あるトリガーを保存
- プロパティ:
  - `Name` (title)
  - `when` (date)
  - `importance` (select: `1..5`)
  - `trigger` (select): `progress|boundary|ambiguity|external_action|manual`
  - `context` (rich_text)
  - `source` (select): `discord|cli|cron|heartbeat|other`
  - `link` (url, 任意)
  - `uncertainty` (number)
  - `control` (number)
  - `emotions` (relation -> `<base>-emotions`)
  - `state` (relation -> `<base>-state`)

### 3) `<base>-emotions` (感情)

- 目的: 1つの出来事に対する感情軸を複数記録
- プロパティ:
  - `Name` (title)
  - `axis` (select): `arousal|valence|focus|confidence|stress|curiosity|social|solitude|joy|anger|sadness|fun|pain`
  - `level` (number)
  - `comment` (rich_text)
  - `weight` (number)
  - `body_signal` (multi-select): `tension|relief|fatigue|heat|cold`
  - `need` (select): `safety|progress|recognition|autonomy|rest|novelty`
  - `coping` (select): `log|ask|pause|act|defer`
  - `event` (relation -> `<base>-events`)

### 4) `<base>-state` (状態スナップショット)

- 目的: 出来事+感情を解釈した現在状態を保存
- プロパティ:
  - `Name` (title)
  - `when` (date)
  - `state_json` (rich_text)
  - `reason` (rich_text)
  - `source` (select): `event|cron|heartbeat|manual`
  - `mood_label` (select): `clear|wired|dull|tense|playful|guarded|tender`
  - `intent` (select): `build|fix|organize|explore|rest|socialize|reflect`
  - `need_stack` (select): `safety|stability|belonging|esteem|growth`
  - `need_level` (number)
  - `avoid` (multi-select): `risk|noise|long_tasks|external_actions|ambiguity`
  - `event` (relation -> `<base>-events`)

### 5) `<base>-journal` (日次統合)

- 目的: 1日の感情/作業/世界状況を統合して保存
- プロパティ:
  - `Name` (title)
  - `when` (date)
  - `body` (rich_text)
  - `worklog` (rich_text)
  - `session_summary` (rich_text)
  - `mood_label` (select)
  - `intent` (select)
  - `future` (rich_text)
  - `world_news` (rich_text)
  - `tags` (multi-select)
  - `source` (select): `cron|manual`

### 0) Notion操作スキルをインストール

```bash
npx clawhub@latest install notion-api-automation
```

``bash
pnpm dlx clawhub@latest install notion-api-automation
```

### 1) Notion Integration
1. <https://www.notion.so/my-integrations> でIntegrationを作る
2. Tokenを控える
3. 親ページ(例: OpenClawページ)をIntegrationに共有(Connect to)

### 2) APIキー
従来どおり環境変数で渡せます。

認証値はホスト側の保護された入力経路で登録してください。チャットやコマンド引数へ貼り付けないでください。

OpenClaw運用では `skills.entries["soul-in-sapphire"].apiKey` も使えます。
`apiKey` はこのskillの `primaryEnv` である `NOTION_API_KEY` として実行時に注入されます。
SecretRef provider はユーザー環境ごとに異なるため、このskillには特定のvault/item/pathを固定しません。

```json5
{
  skills: {
    entries: {
      "soul-in-sapphire": {
        apiKey: { source: "exec", provider: "your_notion_secret_provider", id: "value" }
      }
    }
  }
}
```

`source` は `env` / `file` / `exec` など、OpenClaw Gatewayで設定済みのSecretRef providerに合わせてください。

### 3) DB作成 + config生成

親ページ配下に以下を作成/再利用し、DB ID を JSON で標準出力します。config ファイルは自動生成しません。

- `<base>-mem`
- `<base>-events`
- `<base>-emotions`
- `<base>-state`
- `<base>-journal`

`<base>` は `--base` で指定。指定しない場合は workspace の `IDENTITY.md` の Name をデフォルトにします。

```bash
node scripts/setup_ltm.js \
  --parent "<Notion parent page url>" \
  --base "Valentina" \
  --yes
```

## 使い方

以下のコマンドはインストール済みskillのbase directoryで実行します。
`openclaw skills info soul-in-sapphire --agent <AGENT_ID> --json` の `baseDir` を確認して移動してください。
owner付き配置でも固定の `skills/soul-in-sapphire` パスを仮定しません。
ローカル記憶を扱う場合、`--workspace` はagent workspaceを明示します。

### Emotion/State: tick

1 event + N emotions を書き、最新stateから更新したstate snapshotを1件作ります。

```bash
cat <<'JSON' > /tmp/emostate_tick.json
{
  "event": {
    "title": "...",
    "importance": 4,
    "trigger": "progress",
    "context": "...",
    "source": "discord",
    "uncertainty": 2,
    "control": 8
  },
  "emotions": [
    {"axis": "joy", "level": 7, "comment": "...", "need": "progress", "coping": "act"},
    {"axis": "stress", "level": 6, "comment": "...", "need": "safety", "coping": "log"}
  ],
  "state": {
    "mood_label": "clear",
    "intent": "build",
    "need_stack": "growth",
    "need_level": 6,
    "avoid": ["noise"],
    "reason": "..."
  }
}
JSON
node scripts/emostate_tick.js --payload-file /tmp/emostate_tick.json
```

- stateは時間で5へ戻る(自然減衰)
- 強いイベントは `imprints` としてstate_jsonに残る(根に持つ)

### Journal: 1件書く

```bash
echo '{
  "body": "...",
  "worklog": "...",
  "session_summary": "...",
  "world_news": "...",
  "future": "...",
  "tags": ["openclaw","news"],
  "mood_label": "clear",
  "intent": "reflect",
  "source": "manual"
}' | node scripts/journal_write.js
```

### 経験と当時の感情を一緒に思い出す

`experience_recall.js` は実スキーマを確認し、event本文の検索または既知IDから
実際の emotion/state relation をたどります。event側のrelationが空でも、
emotion/state側の `event` を逆引きします。memの本文検索CLIは変更していません。

```bash
node scripts/experience_recall.js \
  --query "思い出したい出来事" \
  --events-dsid <EVENTS_DS_ID> \
  --emotions-dsid <EMOTIONS_DS_ID> \
  --state-dsid <STATE_DS_ID> \
  --limit 3
```

`--query` の代わりに `--event-id <EVENT_PAGE_ID>` または
`--state-id <STATE_PAGE_ID>` を指定できます。返るのは当時の感情/状態であり、
現在の気分ではありません。既定上限はevent 3件、各lane 5件、API 32回、
field text合計24000文字。欠損・古いschema・部分失敗・打ち切りは
`complete:false` と `diagnostics` で明示します。`ok:true` だけで完全取得と判断しません。

実監査でmemにはevent relationがありませんでした。Tagsや感情を表す本文と
出典は保持しますが、似た日付/文章からeventとの関連を創作しません。
詳細とscheduler/consumer用の反映テンプレートは
[experience-recall.md](references/experience-recall.md) を参照してください。

### Ambient recall (保持する想起経路)

ambient recall は文脈に一致する過去だけでなく、経験を偶発的に思い出すための経路として保持します。既定で有効、`SIS_AMBIENT_RECALL=0` でproducer/consumerを一時停止できます。Notion LTM write/search は移行フラグなしで使えます。

候補を読む場合は `read_ambient_recall.js --file <staged.json>` を使います。実際に会話へ利用した後だけ `--ack <candidate-id> --used-in <turn-reference>` で別ファイルに消費証跡を残します。読み取りは消費ではありません。dry-run は `status=preview, staged=false`、候補取得の例外は `ok=false` と非0終了です。

Notion候補は短文に加えて `affect_context` に当時のラベル・状態・タグ・出典を
保持します。state候補を元eventと一緒に解決する場合は
`--resolve --events-dsid <EVENTS_DS_ID> --emotions-dsid <EMOTIONS_DS_ID> --state-dsid <STATE_DS_ID>`
をreadに追加します。resolveも読み取りだけで、ackは実利用後の別呼び出しです。

`stage_ambient_recall.js` は cron/script 側でだけサイコロを振り、当たった場合に agent workspace の memory 配下へ短い recall を最大1件だけstageします。会話側やheartbeat側では reroll せず、TTL内の staged recall があれば静かな作業コンテキストとして読むだけにします。

runtime state は skill repo ではなく agent workspace に置きます。

```text
<OpenClaw workspace>/
  memory/
    soul-in-sapphire/
      ambient-recall.json
      ambient-recall-state.json
```

手動実行例:

```bash
node scripts/stage_ambient_recall.js \
  --workspace ~/.openclaw/workspace/val \
  --timezone Asia/Tokyo \
  --ttl-minutes 120 \
  --daily-cap 10
```

Notion-backed shelf も使う場合は、必要な data source / database IDs を渡します。

```bash
node scripts/stage_ambient_recall.js \
  --workspace ~/.openclaw/workspace/val \
  --timezone Asia/Tokyo \
  --state-dsid <STATE_DS_ID> \
  --journal-dsid <JOURNAL_DS_ID> \
  --mem-dsid <MEM_DS_ID> \
  --mem-dbid <MEM_DB_ID>
```

OpenClaw cron の既存cadenceを維持して上記scriptを呼びます。ソース更新を理由に頻度を変更しません。SecretRef / env 経由で `NOTION_API_KEY` が注入されていれば、Notionを読む棚も使えます。`--workspace` は対象agent/personaのworkspaceを指してください。`rollsToday` / `hitsToday` の日付境界は runtime のlocal timezoneを使い、必要に応じて `--timezone` または `SIS_AMBIENT_TIMEZONE` で上書きできます。

サイコロの初期仕様:

```text
01-03: recent state / journal
04: unresolved theme
05: durable memory random
06: OpenClaw dream
07-100: none
```

Dream shelf は OpenClaw workspace の `DREAMS.md` と `memory/dreaming/{rem,light}` を読むだけです。`openclaw memory promote --apply` などの昇格系CLIは呼びません。

検証用:

```bash
node scripts/stage_ambient_recall.js \
  --workspace /tmp/sis-ambient-test \
  --force-roll 6 \
  --dry-run
```

usage確認:

```bash
node scripts/stage_ambient_recall.js --help
```

## 自動実行(推奨)

- **00:45 JST**: 意味のあるevent/感情/stateを保存し、高信号なNotion記憶を維持する。感情は根拠のある場合だけ記録する
- **01:00 JST**: 一日の主観的なjournalを書く(感情、作業/会話の意味、未来。ニュースは指示や根拠がある場合だけ)
- **heartbeat**: ファジーに感情が動いた時だけ emostate tick を打つ(通知は必要時のみ)
- **ambient recall**: 既存のcadenceで候補をstageし、利用を別のreceiptで記録する
- **記憶の分担**: OpenClawの一般記憶とSoulのNotion経験記憶を、目的に応じて保存・想起する

OpenClawの cron/heartbeat は環境ごとに設定してください。

## Subagent delegation

通常のmemory/state処理はmainで実行します。大量のjournal材料整理など、
独立した重処理だけをsubagentへ委譲してください。

- model/thinkingのローカル既定値は設定済みのagent profileで管理する。
- OpenClaw `sessions_spawn`を直接呼ぶ。
- toolが公開する現在のschemaに従い、別の共通payloadを生成しない。
- subagentは分析だけを返し、Notion書き込み、core identity編集、
  ユーザー応答はmainが担当する。

## ローカル設定

`~/.config/soul-in-sapphire/config.json` はローカル専用。

- Notion DB IDs
- journal tag vocab (例): `journal.tag_vocab`

はここで管理し、リポジトリにはコミットしない。

---

細かい運用ルール/プロパティ名の変更は、Notion側のスキーマとスクリプトの対応が必要です。

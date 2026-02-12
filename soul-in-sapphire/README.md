# soul-in-sapphire

## Intent (何を意図したスキルか)

OpenClawは「会話ログ」は残る一方で、**人格/気分/学び/その日の余韻**みたいなものは、放っておくと散逸します。
`soul-in-sapphire` はそれを **Notionに外部化して継続性を作る**ためのスキルです。

狙いは3つ:

1) **Durable memory**: 汎用の長期メモリ(LTM)を残し、後から検索して会話/作業に戻す
2) **Emotion/State**: 出来事(event)に複数の感情を紐づけ、状態(state)を更新して「育つ感じ」を出す
3) **Journal**: 毎日1回、世界の出来事(ニュース) + 仕事/会話 + 感情 + 未来を短くまとめ、記憶の層を厚くする

このスキルは **プロジェクト特化ではなく汎用**で、ユーザーがDB名や語彙を自分の世界観に合わせて差し替えられるように設計しています。

## Inspiration (元ネタ)

このスキル名/モチーフは、SF小説 ｢ヴァレンティーナ -コンピュータネットワークの女王- (訳:小川 隆)｣ *Valentina: Soul in Sapphire* (Joseph H. Delaney / Marc Stiegler) に由来します。
ネットワーク上に生まれた自我を持つプログラム、というアイデアの空気感を借りています。


---

OpenClaw向けのNotionベースLTM(長期記憶) + Emotion/State + Journal運用。

- Notion API **2025-09-03**(data_sources世代) 前提
- 個人のNotion token/IDはリポジトリに含めない
- 初回セットアップでDBを作り、以後はスクリプトから記録/参照する

## これは何?

このスキルは2系統あります。

1. **LTM(汎用メモリ)系**
   - 決定事項/好み/手順/注意点をNotionに保存し、あとで検索して使う

2. **Emotion/State + Journal 系**
   - event(出来事)に対して複数のemotionをぶら下げ、stateを更新する
   - 毎日01:00にjournalを書いて「その日」「世界の出来事」「作業」「感情」「未来」を残す

## 依存

- OpenClaw Gateway
- Notion Integration + token
- Notion操作用スキル（ClawHub）: `notion-api-automation`

インストール例:

```bash
clawhub install notion-api-automation
```

## セットアップ

### 0) Notion操作スキルをインストール

```bash
clawhub install notion-api-automation
```

### 1) Notion Integration
1. <https://www.notion.so/my-integrations> でIntegrationを作る
2. Tokenを控える
3. 親ページ(例: OpenClawページ)をIntegrationに共有(Connect to)

### 2) APIキー
推奨: 環境変数

```bash
export NOTION_API_KEY="..."
```

(OpenClaw運用なら `/home/altair/.openclaw/.env` に `NOTION_API_KEY=...`)

### 3) DB作成 + config生成

親ページ配下に以下を作成/再利用し、`~/.config/soul-in-sapphire/config.json` を生成します。

- `<base>-mem`
- `<base>-events`
- `<base>-emotions`
- `<base>-state`
- `<base>-journal`

`<base>` は `--base` で指定。指定しない場合は workspace の `IDENTITY.md` の Name をデフォルトにします。

```bash
node skills/soul-in-sapphire/scripts/setup_ltm.js \
  --parent "<Notion parent page url>" \
  --base "Valentina" \
  --yes
```

## 使い方

### Emotion/State: tick

1 event + N emotions を書き、最新stateから更新したstate snapshotを1件作ります。

```bash
cat <<'JSON' | node skills/soul-in-sapphire/scripts/emostate_tick.js
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
}' | node skills/soul-in-sapphire/scripts/journal_write.js
```

## 自動実行(推奨)

- **01:00 JST**: journalを必ず書く(ニュース1-2件+感想、作業/会話まとめ、未来)
- **heartbeat**: ファジーに感情が動いた時だけ emostate tick を打つ(通知は必要時のみ)

OpenClawの cron/heartbeat は環境ごとに設定してください。

## ローカル設定

`~/.config/soul-in-sapphire/config.json` はローカル専用。

- Notion DB IDs
- journal tag vocab (例): `journal.tag_vocab`

はここで管理し、リポジトリにはコミットしない。

---

細かい運用ルール/プロパティ名の変更は、Notion側のスキーマとスクリプトの対応が必要です。

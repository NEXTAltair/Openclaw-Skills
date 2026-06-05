# ADR 0001: Soul in Sapphire の ambient recall dice と workspace staging

- **日付**: 2026-06-05
- **ステータス**: Accepted
- **対象**: `soul-in-sapphire` skill、recall scripts、OpenClaw workspace memory、cron integration
- **関連 Issue / PR**: #7

## 背景

`soul-in-sapphire` の recall は、ユーザーが「何を思い出してほしいか」を毎回指定する形に寄せると目的から外れる。

context recall は現在の会話や作業に合う記憶を検索するには有効だが、人間の記憶に近い「最近の残響」「未解決の引っかかり」「古い記憶の偶発的な浮上」は弱くなる。

そのため、ユーザーが明示しなくても低頻度で記憶が自然に浮上する ambient recall 経路を追加する。

## 現状の挙動

`soul-in-sapphire` には Notion-backed memory / state / journal を扱う script がある。

- `ltm_search.js`: durable memory を query で検索する。
- `state_recall.js`: recent state snapshot を取得する。
- `journal_write.js`: daily synthesis を書く。
- `conflict_track.js`: unresolved tension を local JSONL に記録する。

一方で、会話文脈に完全一致しない記憶を低頻度で stage する専用経路はない。

OpenClaw には agent workspace 側の memory artifacts がある。

- `MEMORY.md`
- `DREAMS.md`
- `memory/YYYY-MM-DD.md`
- `memory/dreaming/light/YYYY-MM-DD.md`
- `memory/dreaming/rem/YYYY-MM-DD.md`

これらは Gateway 設定ではなく、agent/persona ごとの workspace memory として扱う。

## 問題

context recall だけに寄せると、検索に合うものだけが戻りやすい。

このままだと、SIS が狙う「作業中に残響が薄く混ざる」挙動ではなく、ユーザーが明示した時だけ memory search する補助記憶になりやすい。

また、会話側や heartbeat 側で毎回ランダム判定すると、cron 側の判定と二段ランダムになり、実効発火率が読みにくくなる。モデルの生成判断にも左右されるため、仕様として再現性が落ちる。

runtime state を skill repo 配下に置くと、git dirty、skill update conflict、reinstall 時の消失、agent 間共有の混線が起きやすい。

## 5W1H

### Who: 誰が関係するか

`soul-in-sapphire` を使う OpenClaw agent / persona が影響を受ける。

責任範囲は、ambient recall の stage ロジックは skill script、runtime state は agent workspace、起動頻度は OpenClaw cron / scheduler とする。

### What: 元は何で、何を変えるか

元の挙動は、明示 query による memory/state recall が中心。

変更後は、cron から `stage_ambient_recall.js` を定期実行し、1d100 のサイコロで低頻度に ambient recall を stage する。

会話側 / heartbeat 側は reroll しない。TTL 内の staged recall があれば読むだけにする。

### When: いつ決めたか

2026-06-05、Issue #7 の仕様相談で決めた。

### Where: どこを変えるか

想定する変更箇所:

- `soul-in-sapphire/scripts/stage_ambient_recall.js`
- `soul-in-sapphire/SKILL.md`
- `soul-in-sapphire/README.md`
- `docs/adr/0001-soul-in-sapphire-ambient-recall-dice.md`

runtime state の推奨配置:

```text
<OpenClaw workspace>/
  memory/
    soul-in-sapphire/
      ambient-recall.json
      ambient-recall-state.json
```

### Why: なぜ変更が必要か

SIS の ambient recall は、ユーザーに「思い出しました」と説明するログではなく、内部文脈に薄く混ざる残響として扱いたい。

そのためには、低頻度、最大1件、短い content、TTL つき、通常ログなし、という制約を中心にする必要がある。

### How: どう実装し、どう確認するか

`stage_ambient_recall.js` を idempotent に実装する。

- 初回実行時に workspace 側 state directory を作成する。
- `ambient-recall-state.json` が無ければ初期化する。
- 日付が変わったら `rollsToday` / `hitsToday` を reset する。
- 1d100 を振り、hit した場合だけ shelf を選ぶ。
- hit しなかった場合も roll state は更新する。
- staged recall は atomic write で `ambient-recall.json` に最大1件だけ上書きする。
- TTL 切れの old staged recall は会話側で無視し、script 側は次回実行時についでに掃除する程度にする。

## 検討した選択肢

- 案 A: 会話側 / heartbeat 側で毎回サイコロを振る。
- 案 B: cron/script 側だけでサイコロを振り、会話側は staged recall を読むだけにする。
- 案 C: skill repo 配下に `state/ambient-recall.json` を置く。
- 案 D: agent workspace の `memory/soul-in-sapphire/` に runtime state を置く。
- 案 E: 必須 setup script で初期設定ファイルを作る。
- 案 F: `stage_ambient_recall.js` を idempotent にし、必要な state を初回実行時に自動作成する。

採用しない案と理由:

- 案 A は二段ランダムになり、発火率と挙動が読みにくい。
- 案 C は git dirty、skill update conflict、agent 間混線を起こしやすい。
- 案 E は初期設定のために agent が余計な setup flow を読む必要があり、運用が重くなる。

## 決定

案 B、案 D、案 F を採用する。

初期仕様:

```text
cron: 20分ごと
roll: 1d100
hit: 5-6%
TTL: 2h
dailyCap: default 10
max staged: 1
write: atomic
title limit: 80 chars
content limit: 800 chars
consume: しない
normal log: 出さない
```

`dailyCap` はユーザーに見える回数の上限ではなく、cron/script 側の stage 暴走を防ぐ安全弁として扱う。

staged recall は「読むたびに消す」方式にしない。TTL 内の最新1件が作業コンテキストに薄く混ざることを優先する。

## Shelf

1d100 だけで hit と shelf を決める。

初期案:

```text
01-03: recent state / journal
04: unresolved theme
05: durable memory random
06: OpenClaw dream
07-100: none
```

### Dream shelf

Dream は `soul-in-sapphire` 独自ファイルではなく、OpenClaw の memory-core dreaming artifacts を候補源として読む。

参照候補:

```text
<workspace>/DREAMS.md
<workspace>/memory/dreaming/light/YYYY-MM-DD.md
<workspace>/memory/dreaming/rem/YYYY-MM-DD.md
```

優先度:

1. `memory/dreaming/rem/<recent>.md` の reflections / possible lasting truths
2. `memory/dreaming/light/<recent>.md` の `status: staged` candidates
3. `DREAMS.md` の最新 diary entries

`memory/dreaming/deep` は promotion summary 寄りなので、ambient recall の候補源としては優先度低めにする。

`openclaw memory promote --apply` などの昇格系 CLI は ambient recall から呼ばない。ambient recall は思い出しであって memory promotion ではないため、OpenClaw Dreaming 本体に副作用を出さない。

### Unresolved shelf

初期実装では Notion 検索に凝りすぎない。

優先候補:

- `conflict_track.js` 系の出力
- daily memory の `unresolved` / `todo` / `tension` 系マーカー

将来候補:

- Notion mem の `Type=todo` + tags `unresolved` / `tension` / `open`
- journal `future`

## State Schema

`ambient-recall-state.json`:

```json
{
  "version": 1,
  "date": "2026-06-05",
  "rollsToday": 0,
  "hitsToday": 0,
  "lastRollAt": null,
  "lastHitAt": null,
  "dailyCap": 10,
  "lastError": null
}
```

`ambient-recall.json`:

```json
{
  "version": 1,
  "kind": "ambient_recall",
  "shelf": "dream",
  "staged_at": "2026-06-05T12:00:00.000Z",
  "expires_at": "2026-06-05T14:00:00.000Z",
  "roll": 6,
  "title": "OpenClaw SecretRef auth migration",
  "content": "Security/auth changes around moving plaintext secrets into SecretRef remain worth keeping in working context.",
  "source": {
    "type": "openclaw_dream",
    "path": "memory/dreaming/light/2026-06-05.md"
  }
}
```

## 影響

良い点:

- recall が query-driven だけでなくなる。
- random source が cron/script 側に集約され、発火率が読みやすい。
- runtime state が agent workspace 側に閉じる。
- OpenClaw Dream artifacts を副作用なしで候補源にできる。

注意点:

- content が長すぎると文脈汚染になるため、短く切る。
- 通常返答では「思い出しました」と説明しない。
- Notion 依存の shelf は auth / DB ID が無い環境でも失敗を短く記録し、他 shelf の設計を邪魔しないようにする。

将来見直す条件:

- hit rate が低すぎる / 高すぎる。
- unresolved source を Notion mem や journal に広げる必要が出た。
- OpenClaw 側に official staged ambient context の仕組みが追加された。

## 実装計画

1. `stage_ambient_recall.js` を追加する。
   - CLI args: `--workspace`, `--state-dir`, `--ttl-minutes`, `--daily-cap`, `--state-dsid`, `--journal-dsid`, `--mem-dsid`, `--mem-dbid`
   - env override: `OPENCLAW_WORKSPACE`, `SIS_AMBIENT_STATE_DIR`
   - default state dir: `memory/soul-in-sapphire`

2. state management helper を実装する。
   - workspace path normalize
   - state directory creation
   - daily reset
   - atomic JSON write
   - title/content truncation

3. dice logic を実装する。
   - 1d100
   - hit / shelf selection
   - `rollsToday`, `hitsToday`, `lastRollAt`, `lastHitAt`, `lastError` update
   - `dailyCap` は安全弁として扱う

4. shelf readers を実装する。
   - recent state: existing `queryRecent` / `state_recall` 相当
   - dream: workspace `memory/dreaming/rem`, `memory/dreaming/light`, `DREAMS.md`
   - unresolved: local conflict/daily memory markers
   - durable random: initial implementation can be conservative; Notion mem random is allowed if DB IDs are present

5. `SKILL.md` を更新する。
   - ambient recall は説明義務ではなく内部文脈注入であることを書く
   - 会話側 / heartbeat 側は reroll せず TTL 内の staged recall を読むだけとする
   - runtime state は workspace memory 配下と明記する

6. `README.md` を更新する。
   - cron 例
   - state file lifecycle
   - Dream shelf の扱い
   - Notion auth / DB ID が必要な shelf と不要な shelf の境界

7. 検証する。
   - `node --check soul-in-sapphire/scripts/stage_ambient_recall.js`
   - temp workspace で初回実行し state file が自動作成されること
   - forced roll / deterministic option を用意して各 shelf を確認する
   - atomic write の temp file が残らないこと
   - `git diff --check`

## 検証

ADR 作成時点では実装前のため、検証予定を上記実装計画に記録する。

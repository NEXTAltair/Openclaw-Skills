# ADR 0005: Calibre の3スキルは当面個別公開し、将来のプラグイン一本化を見直し対象に残す

- **日付**: 2026-11-09
- **ステータス**: Accepted (暫定。プラグイン一本化を将来再検討する)
- **対象**: calibre-catalog-read、calibre-metadata-apply、calibre-reference-ingest、ClawHub publish/install、[ADR 0002](0002-separate-skill-source-from-runtime-installation.md)
- **関連 Issue / PR**: なし

## 背景

`calibre-reference-ingest` (新規追加とファイル処理) を ClawHub へ初公開する際、既存の
`calibre-catalog-read` (読取専用) と `calibre-metadata-apply` (既存本のメタデータ変更)
との兼ね合いが問題になった。ingest は単体では完結せず、重複確認と既存タグ語彙の参照に
catalog-read を、既存本のタグ修正に metadata-apply を使う。

2026-10-10 の ingest 作成時、既存スキルへの統合か別スキルかを検討した記録は残っていない。

## 現状の挙動

- 3スキルは ClawHub の個別スキル (`@nextaltair/<slug>`) として配布される。
- `dependsOnSkills` 等の依存宣言は OpenClaw に強制されないため、ingest だけを入れた利用者には前提が伝わらない。
- catalog-read と metadata-apply は `run_store.mjs`・`run_state.mjs`・`handle_completion.mjs` を別々に持ち、既に差分がある (それぞれ5行・59行・94行)。Calibre 接続・認証処理も Node と Python で別実装。
- リポジトリ直下の `tests/test_calibre_integration.py` は read と apply をまとめて検証している。
- 2026-11-09 時点の ClawHub 利用: catalog-read 73インストール/3279ダウンロード、metadata-apply 53インストール/2625ダウンロード。

## 5W1H

### Who: 誰が関係するか

リポジトリ所有者、ClawHub 上の既存利用者、Calibre スキルを使う OpenClaw agent。

### What: 元は何で、何を変えるか

変更しない。3スキルを個別スキルとして公開し続ける。ingest の README に read/apply 併用前提を明記した (1.0.0)。

### When: いつ決めたか

2026-11-09、calibre-reference-ingest 1.0.0 の公開準備中。

### Where: どこを変えるか

`calibre-reference-ingest/README.md` の「組み合わせるスキル」節のみ。

### Why: なぜ今は一本化しないか

ClawHub のバンドルプラグイン (`clawhub package publish --family bundle-plugin`、利用者は `openclaw plugins install`) にまとめる案は筋が良いが、次の作業が必要で今回の公開に対して重いと本人が判断した。

- 既存スキル利用者はプラグインへ自動では移らない。旧スラグに移行案内の最終版を出して残す必要がある。
- ADR 0002 はプラグイン配布を対象外にしているため、公開・読戻し・再導入の手順を新 ADR で決め直す必要がある。
- バンドル形式で `{baseDir}/scripts/...` 呼び出しが今のまま動くかは未検証。

### How: どう確認するか

ingest README の併用前提の記載と、3スキルの ClawHub 公開・再導入結果で確認する。

## 検討した選択肢

- 案 A (採用、暫定): 個別スキルのまま公開し、ingest README に併用前提を書く。
- 案 B: ingest を metadata-apply に統合する。apply の「選んだ既存本だけを dry-run 確認してから変更する」約束が崩れるため不採用。
- 案 C (将来候補): 3スキルを1つのリポジトリ・1つのバンドルプラグインにまとめる。版と共通コードを揃えられ、依存の欠落も防げる。移行コストのため今回は見送り。

## 決定

当面は案 A。案 C (プラグイン一本化) は却下ではなく保留とし、下記の条件のどれかに当たったら必ず再検討する。

## 影響

注意点: 依存の欠落と共通コードの重複・ずれは残る。

**将来見直す条件** (どれか1つで再検討する):

- Calibre スキルに4本目を追加するとき。
- 共通処理 (run_store / run_state / handle_completion、接続・認証) の不具合を2スキル以上で直すことになったとき。
- 1つのスキルの変更が他スキルとの同時リリースを必要としたとき。
- OpenClaw / ClawHub 側でバンドルプラグインの skill 配布と更新追跡を実際に確認できたとき。
- OpenClaw の Skill SDK・スキル仕様が変わったとき (SKILL.md frontmatter / metadata、`dependsOnSkills` などスキル間依存の扱い、インストール配置、プラグイン・バンドルでの skill 配布、ClawHub の公開・更新方式など)。OpenClaw のリリースノートで skills 関連の変更を見たら、この ADR を開いて判断し直す。
- 遅くとも 2027-05 頃に一度、利用状況と上記の発生有無を見直す。

## 検証

- `calibre-reference-ingest` 1.0.0 README に「組み合わせるスキル」節があること。
- 再検討時は `clawhub package validate` と `--dry-run`、ローカルの `openclaw plugins install` で `{baseDir}` 呼び出しを確認してから移行を決める。

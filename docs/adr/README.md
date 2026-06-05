# Architecture Decision Records

Openclaw-Skills の重要な設計判断を記録するドキュメント群。

| ADR | タイトル | 日付 | ステータス |
|-----|---------|------|-----------|
| [0001](0001-soul-in-sapphire-ambient-recall-dice.md) | Soul in Sapphire の ambient recall dice と workspace staging | 2026-06-05 | Accepted |

## ADR テンプレート

```markdown
# ADR XXXX: タイトル

- **日付**: YYYY-MM-DD
- **ステータス**: Proposed | Accepted | Deprecated | Superseded by [XXXX]
- **対象**: 影響する skill、script、metadata、設定、OpenClaw integration
- **関連 Issue / PR**: #issue / #pr

## 背景

この判断が必要になった背景を書く。

Openclaw-Skills は複数の skill と運用環境を扱うため、単に「こうする」だけではなく、どの skill / script / OpenClaw 機能に影響し、どの運用上の制約を守るための判断なのかを具体的に書く。

## 現状の挙動

変更前の現状を書く。

関係する skill、script、metadata、設定、OpenClaw 側の仕様、外部サービスの前提があれば明記する。

## 問題

その挙動が、現在の目的、実行環境、依存関係、運用方法とどう衝突しているかを書く。

可能なら、実際のエラー、ログ、再現手順、確認したバージョンを書く。

## 5W1H

### Who: 誰が関係するか

誰が影響を受けるか。誰の責任範囲として扱うか。

### What: 元は何で、何を変えるか

元の挙動と、変更後の挙動を書く。

### When: いつ決めたか

決定日と、きっかけになった作業や障害を書く。

### Where: どこを変えるか

関係するコード、設定、文書、コマンド、OpenClaw skill metadata を書く。

### Why: なぜ変更が必要か

なぜ現状のままでは困るか。なぜこのリポジトリ側で扱うのかを書く。

### How: どう実装し、どう確認するか

実装方針と確認手順を書く。

## 検討した選択肢

- 案 A:
- 案 B:
- 採用しない案と理由:

## 決定

最終的に採用する方針を書く。

## 影響

良い点、注意点、将来見直す条件を書く。

## 検証

実行した、または実行予定の確認コマンドと期待結果を書く。
```

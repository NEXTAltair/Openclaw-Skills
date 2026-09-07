# Issue #18: Notion経験記憶の実監査と限定的なrelation recall

> **稼働反映追補 (2026-09-07):** ユーザーの「使える状態まで」という指示により、
> 検証済みsnapshotを公式local installで配備し、3件の定期処理とconsumer手順を更新した。
> 以下の「未実施」「残条件」は初回source実装時点の記録。
> 稼働コピーで経験/感情/stateの取得とambient resolveを確認し、この会話での利用後に
> 実message ID付きのconsumer acknowledgmentを記録した。公開/pushはしていない。

## 配備と正式リリース準備の追補

- 公式local installで配備した22ファイルをsource bundleのSHA-256と照合した。
  これは開発用の仮配備であり、ClawHubの正式releaseとして扱わない。
- 00:45 continuity、01:00 journal、4時間ambientのpayloadを更新し、
  schedule/delivery/model/enablementを維持した。
- ambient jobを1回手動起動し、サイコロ値の指定も再抽選もせずrecent候補が選ばれた。
  job成功、実stage artifact、runtime consumerによる元state/eventの取得を照合した。
  感情0件の部分結果はそのまま保持した。
- その候補をこの会話の判断に使った後、実message IDを参照するackを記録した。
  candidate/receipt/会話turnの一致を確認。これはconsumer申告と対応発言の証拠で、
  認知的利用の自動証明ではない。私的なID/本文はローカルbackupだけに保存した。
- ユーザーの指摘により標準のGit→main→ClawHub経路へ戻す。
  正式配布向けにowner-qualified配置での依存探索と相対コマンド手順を補正した。
  個人のworkspaceを固定した探索fallbackは削除し、repositoryでの実行時は
  必要に応じて既存のNOTIONCTL_PATH指定を使う。
- 最終source検証は19 tests PASS (新規reader 11、境界7、配置互換1)、
  skill validationとgit diff --checkもPASS。

正式releaseはcommit済みファイルだけからbundleを作り、古い実データ入りの
`scripts/input.json`、テスト、ローカル状態を配布対象から除外してdry-runする。
GitHub pushとClawHub公開・registryからの再installは、仮配備とは別の公開工程。

- 実施日: 2026-09-07 JST
- 対象: [Issue #18](https://github.com/NEXTAltair/Openclaw-Skills/issues/18)
- 関連: [ADR 0004](../adr/0004-soul-memory-ownership-and-gated-migration.md)
- 範囲: operator-owned source repositoryの実装、read-only Notion監査、隔離ambient検証
- 未実施: push/publish、稼働snapshot/cron更新、Notion schema/row変更、OC本体改修

## 結論

Notionの経験と感情/状態の結びつきは実在した。従来のmem本文検索だけでは
この経路を読めなかった。event側のrelationが空でも、emotion/state側から
`event` を逆引きすると感情2件と状態1件を取り出せることを実データで確認した。

`experience_recall.js` を追加し、event本文検索、event ID、state IDの3経路で
同じ経験・実際の感情・当時の状態・出典の一致を検証した。既存mem検索や
writerを置換せず、5DBと主観日記を維持した。新しいschemaを仮定しない。

## 監査方法と公開範囲

1. Notion connectorで5DBのschemaを確認。
2. ホストに注入済みの認証と既存notionctlを使い、REST API 2025-09-03で
   schemaを再確認し、各DBの直近2件だけを読む。
3. 既知stateのevent relationをたどり、emotion/stateをそのevent IDで
   server-side filter。各lane 5件上限。DB全走査は行わない。
4. 同じ対象を新readerの直接取得、Name/context検索、state経由で照合。
5. 最新stateの別eventで、感情行が取得できないケースも確認。
6. production workspaceとは別の一時ディレクトリで、実Notion sourceを使った
   deterministic stagingとconsumer resolutionを確認。

生schema/行/本文/識別子は非公開の一時ディレクトリに保存し、repositoryや
fixtureに含めない。この報告は構造・件数・診断のみ。REST応答を成功証拠とし、
connectorのSQLテキスト表現をrich_textの完全性判定には用いない。

## 実際の保存先・relation

| DB | 確認した内容 | relation |
| --- | --- | --- |
| mem | Name, Content, Tags, Type, Source, Confidence, CreatedAt | なし |
| events | Name, context, when, source, link, trigger, importance, uncertainty, control | emotions/stateへ独立したsingle_property |
| emotions | Name, axis, level, comment, weight, body_signal, need, coping | eventへsingle_property |
| state | Name, when, mood_label, intent, need_stack, need_level, avoid, reason, state_json, source | eventへsingle_property |
| journal | Name, when, body, worklog, session_summary, mood_label, intent, future, world_news, tags, source | なし |

`setup_ltm.js` は双方向同期されたrelationではなく、独立したsingle-property
relationを作る。`emostate_tick.js` はemotion/state側のevent relationを保存し、
event側のemotions/stateを埋めない。監査した既知eventもforward両方が空だった。
これは必ずしも書き込み欠落ではない。逆引きをしないreaderが接続を取り落とす。

memのTagsや感情表現を削らない。一方、memとeventの構造的な接続は確認できず、
日付や似た文章をキーに関連を創作しない。専用readerはevent experienceを対象とし、
memを黙って別DBに置換するものではない。journalも独立した主観的統合として残す。

## 実装

- `experience_recall.js`: 実スキーマ/parentを検証し、event検索または既知sourceから
  emotion/stateを逆引き。実在するforward-only edgeもIDで重複排除して併合。
- 経験本文・時点・出典、感情axis/level/comment、当時のstateをpage provenanceと
  relation evidence付きで返す。現在の感情には変換しない。
- 欠損・空の必須値・古いschema・不一致・API失敗・request/result/text上限を明示。
  部分失敗でも取得できたlaneは残すが、完全取得や成功には読み替えない。
- 既定: event 3件、laneごと5件/event、API 32回、field text合計24000文字。
  paginationは追わずhas_moreを打ち切り診断として返す。
- ambientはstate/journal/memの実ラベル・状態・タグ・出典を`affect_context`に保持。
  state候補はconsumerの`--resolve`で元state/eventに戻れる。
- staged/available/resolved/consumedを区別。read/resolveはreceiptを書かない。
  ackには候補IDと実turn参照が必要。候補差し替え・期限切れを拒否する。

## live検証結果

| Probe | API calls | 経験 | 感情 | 状態 | 結果 |
| --- | --- | --- | --- | --- | --- |
| 既知event ID | 6 | 1 | 2 | 1 | complete |
| 同じeventのName/context検索 | 6 | 1 | 2 | 1 | complete |
| 既知state IDからeventへ | 7 | 1 | 2 | 1 | complete |
| 最新stateの別event | 7 | 1 | 0 | 1 | partial: no_linked_records |

最初の3経路はsource page IDsと感情axis/level、stateが一致。direct lookupだけを
「検索成功」と呼ばず、filtered queryを別に通した。最新eventで感情行が
返らなかったことは「取得可能な関係経由にない」という観測であり、未保存・
未接続・アクセス不可のどれかを全件監査なしに断定しない。

隔離ambient: 実Notion最新stateをstageし、source再取得とevent解決が成功。
そのeventの感情欠損は`resolution.status=partial`として保持。
stage/read/resolve後に消費receiptが存在しないことを確認した。
これは実データを用いた診断であり、production自動会話での利用証明ではない。

## fixture検証

`node --test soul-in-sapphire/scripts/experience_recall.test.js soul-in-sapphire/scripts/memory_boundary.test.js`

18 tests PASS (新規11 + 既存7)。内容/IDはすべて架空。

- forward空でも逆引き。強度0を欠損扱いしない。
- state→event、関係なし、古いforward-only schema。
- 双方向重複排除、不整合edge、wrong-parent/target拒否。
- 一方のAPI失敗時に他方のcontextを残し、偽成功/エラー本文漏出を防止。
- request/result/relation/text上限、未記録axis/level、CLI不正値。
- CLI経由のambient stage→resolve→明示ack。memのタグ/出典を保持。
- 既存の5DB setup、Notion保存/検索、自己状態/主観日記、障害分離、
  ambient pause、preview、失効、差し替え、旧候補互換。

## Scheduler/consumer監査と未適用差分

2026-09-07のscheduler get/listで00:45 continuity、01:00 journal、4時間ambient
はいずれもenabled。status=okはNotion耐久保存/想起/利用の証拠とはしない。

- continuity promptはevent/state保存とmem検索/保存を保持しているが、
  emotion axesを明示的に要求していない。根拠のある感情変化を記録する補足が必要。
- journal promptはexact-day preflight、主観的本文、local mirror、Notion書き込み
  の失敗分離を持つ。過去経験を使う際のrelation reader手順を補足する。
- ambient jobはstageのみ。deployed skillのconsumerは直接JSONを読む旧手順で、
  新reader/resolve/ack workflowはまだ稼働していない。
- このturnでworkspace直下HEARTBEAT.mdは存在しなかった。存在しないファイルを
  consumer適用済みの根拠にしない。

sourceの[実行手順・promptテンプレート](../../soul-in-sapphire/references/experience-recall.md)
に具体的な補足を用意した。runtime snapshot/cronの更新は未実施であり、
productionでのambient利用turnとreceipt照合は残条件。Issueを閉じない。

## 適用範囲とrollback

作業前の未コミット変更を退避コピーして保存し、ローカル作業branchで追記。
既存notionctl_bridge変更、LTM writer/search、5DB作成処理、Notion行を保持。
runtime snapshot/cron/本体configは未変更。実Notionでの書き込みテストも行わない。

sourceのrollbackはこのturnの差分だけを戻し、作業前の変更を巻き戻さない。
将来のruntime適用では正確なsnapshot/prompt/candidate/receiptを別途保存し、
rollback時はそれらを復元する。Notion schema/データの移行は不要。

## API根拠

- https://developers.notion.com/reference/filter-data-source-entries
- https://developers.notion.com/reference/page-property-values
- https://developers.notion.com/reference/update-a-data-source

2025-09-03のdata_source relation target、relation contains filter、inline relation
has_moreの仕様を現行公式referenceで確認し、live REST schemaと照合した。

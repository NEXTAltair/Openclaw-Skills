# ADR 0004: Notion の感情付き経験記憶を保持した責務整理

- 日付: 2026-09-06
- ステータス: Accepted (ユーザーの意味論の訂正を反映; Notion退役案を撤回)
- 対象: soul-in-sapphire、旧 LTM / ambient CLI、setup、手順
- 関連: [Issue #17](https://github.com/NEXTAltair/Openclaw-Skills/issues/17)、[ADR 0001](0001-soul-in-sapphire-ambient-recall-dice.md)、[ADR 0002](0002-separate-skill-source-from-runtime-installation.md)、[ADR 0003](0003-preserve-relational-reflection-without-asserting-user-psychology.md)

## 結論

2026-09-07追補: [Issue #18](https://github.com/NEXTAltair/Openclaw-Skills/issues/18)
に基づき5DBの実スキーマと少数の既知レコードを読み取り監査し、
`experience_recall.js` の限定的なrelation取得を実装した。
mem/journalにevent relationはなく、emotion/stateからeventへの
single-property relationを逆引きする必要がある。
以下の9月6日時点の「未監査」「残条件」は当時の記録であり、現在の結果は
[Issue #18の監査・検証報告](../investigations/18-notion-experience-recall.md) を参照。
sourceの更新でruntime適用済みとはしない。

ユーザーは「Notionの記憶した感情ラベル付きの記憶がこのスキルには重要」と明示した。Notion は経験と感情の結びつきを保存・想起する Soul の中核である。OpenClaw の一般記憶や Dreaming 生成物と同じではなく、検索・昇格という機能名の類似だけで退役や archive 化を決めない。

初回実装の Notion LTM write/search の既定停止、setup の4DB化、ambient の既定停止は撤回した。保存・想起と5DB setupを維持し、独立に有用な失敗表示・消費観測の改善だけを残す。Notionの記憶内容・関係とOC側との対応は未監査であり、Issue本文の remove 候補はそのまま受け入れない。OC側の検索改善は別課題で、成功しても Notion 退役の根拠にはならない。

## 先行分析: Issue の主張の判定

| 主張 | 判定・修正 |
| --- | --- |
| core に索引、検索、provenance、Dreaming がある | 機能の存在を確認。ただしNotionの感情付き経験記憶を代替する証拠ではない |
| hybrid に vector / BM25 / recency / importance / MMR がある | 通常の builtin hybrid では有効。追調査で訂正: 低レベル mmr.ts の既定は disabled だが、実際の src/agents/memory-search.ts は enabled=true を渡す。時間減衰・重み・MMR は現行版では固定値で、設定ノブではない |
| 独立した writer が二重化している | 00:45 Notion mem writer と03:00 core Dreaming は存在する。しかし別の意味を持つ記憶への複数writerは直ちに重複管理ではない。実データと用途の重複は未監査 |
| 旧 dice / staging は標準 recall と同じ | 同じではない。旧機能は文脈非依存の偶発的想起。Active Memory の既定は escalate、trigger は関連性で選ぶ。廃止は製品挙動の変更でもある |
| 検索不調は source missing ではない | 今回の gold source はファイルにも索引にも存在。今回の失敗を欠損や dirty のせいにしてはならない |
| Dreaming が候補窓を占有する ranking 問題 | 初回は症状のみ確認。追調査では token 原文は FTS 3位で候補に入っており、固定時間減衰と混合後の順位が問題。件数200/minScore=0で原文取得可能。初回の候補取得前 filter 案を確定修正として扱わない |
| chunking 互換性変更に Soul が対応すべき | index の互換性判定・再構築は core の責務。Soul は障害分類と既知原文の直接確認を行う。今回の index は valid / clean |
| staging 成功は consumption 成功ではない | 正しい。従来の producer は receipt を持たず、shelf 例外すら ok=true としていた |
| Notion は第二 canonical memory にしない | 一律な縮小案を撤回。Soulの感情付き経験記憶には独立した保存・想起の意味がある。OCとの類似だけでarchive化しない |
| 各データの canonical writer は1つ | ファイルを書けるプロセスが物理的に1つ、ではなく、意味ごとの primary ownership と解釈する。core 自体が daily note、flush、consolidation、明示的 user edit を持つ |

## 根拠のバージョンと調査順

公式 documentation を先に読み、source、その後 live evidence を照合した。

- [公式 Memory architecture](https://docs.openclaw.ai/concepts/memory-architecture)
- [公式 Memory](https://docs.openclaw.ai/concepts/memory)
- [公式 Active Memory](https://docs.openclaw.ai/concepts/active-memory)
- [公式 Dreaming](https://docs.openclaw.ai/concepts/dreaming)
- 公式 GitHub の現行 `docs/concepts/memory-architecture.md` も API で確認した。
- 調査した local OpenClaw HEAD: `2d77f73dae7c3cd87ee249fc50282b48f7571675`。調査開始時の checkout に変更なし。
- Skills baseline: `e63207e`。`notionctl_bridge.js` の既存未コミット変更は本件と別で、上書き・取り消ししていない。

Source の主な照合先 (上記 OpenClaw revision):

- `extensions/memory-core/src/memory/manager-search.ts`: vector / keyword 候補取得、SQL LIMIT。
- `extensions/memory-core/src/memory/hybrid.ts`、`mmr.ts`: ranking と MMR。実効値は `src/agents/memory-search.ts` が渡す。
- `extensions/memory-core/src/memory/manager-sync-ops.ts`: index の同期・再構築。
- `extensions/memory-core/src/short-term-promotion-record.ts`: recall signals。
- `extensions/memory-core/src/short-term-promotion-apply.ts`: promotion の適格性。
- `extensions/active-memory/index.ts`、`config.ts`、`types.ts`、`trigger-recall.ts`: recall の条件・可視性・注入。

## Store / writer / reader / injector / provenance

| データ | canonical store / primary writer | reader / injector | 境界 |
| --- | --- | --- | --- |
| 一般 episodic notes | core workspace daily notes / agent・flush | core search・Active Memory | daily notes は自動 bootstrap の curated core ではない |
| session history | core transcript capture / ingestion | core の許可された session recall | session visibility・rememberAcrossConversations に従う |
| curated facts / profile | MEMORY.md・USER.md / core consolidation、明示的なユーザー修正 | 適格な bootstrap・trigger | provenance・budget・project 条件に従う |
| index / provenance | core SQLite / core indexer | core search | 書き手の prose で origin を owner に格上げしない |
| short-term signals | core SQLite plugin state / core recall recorder | Dreaming | staged・recalled・promoted は別段階 |
| Dreaming reports | DREAMS.md・memory/dreaming / core phases | human review・明示的な診断 | 原文と同格の証拠として再昇格しない |
| event → emotion → state | Soul Notion DB / emostate_tick | state_recall・限定した自己状態 context | Valentina 自身の内面。ユーザー心理の断定ではない |
| subjective journal | Soul Notion journal / journal_write | 日次の主観統合・continuity | core Dreaming report とは別。新規 full mirror は indexed memory の外 |
| identity / unresolved conflict | SOUL・IDENTITY と local conflict artifacts / 根拠付きの自己理解手順 | continuity_check・identity_diff | transient mood を恒久 identity へ即昇格しない |
| Notion memory / ambient | Soulの能動的な長期・経験記憶 / Notion writer | mem検索、実際のevent/emotion/state関係の参照、ambient consumer | 感情ラベルと経験を一体として保持。mem検索CLI単体はName/Content検索でありrelation取得は証明しない |

## Live 検証 (2026-09-06 JST)

### Scheduler

- 00:45 continuity synthesis: enabled。event/state と一般 LTM promotion を含む。
- 01:00 subjective journal: enabled。保持対象。
- 4時間 ambient staging: enabled だが直近 run は managed Codex app-server binary missing で error。予定の存在は成功の証拠ではない。
- 03:00 Memory Dreaming Promotion: enabled、直近 scheduler status は ok。
- 直近の Deep artifact: ranked 3、promoted 0。スイープ成功を既知記憶の昇格成功に読み替えない。
- runs API は list/get で見えた core job に対して not found/scope 案内を返したため、run の詳細は取得済みとは扱わない。get の state と実際の Deep artifact を分けて記録した。

### Index / known-memory probes

`openclaw memory status --agent main --json`:

- builtin / hybrid、OpenAI text-embedding-3-small。
- dirty=false、indexIdentity=valid、vector index=complete、FTS available。
- 619 files、4,394 chunks。configured source は memory のみ、extraPaths は空。
- short-term store: 512 entries、promotedCount=0。これは保持中 store の値であり、過去の全 promotion が0という意味ではない。
- active-memory と memory-core は enabled。ただし enabled はこのターンの injection receipt ではない。

SQLite は read-only で調査した。原文 `memory/2026-06-01.md` に1 chunk、`memory/2026-06-02.md` に3 chunks が存在する。後者の `1d100` も index text に存在した。Dreaming は3,135 chunks (約71.3%)、その他は1,259 chunks。

| Probe | 結果 |
| --- | --- |
| 既知原文の直接読み取り / indexed coverage | PASS。内容と保存先を確認 |
| Issue の日本語 query、通常 minScore、maxResults=10 | FAIL。Dreaming light の1件だけ。原文なし |
| `1d100`、minScore=0、maxResults=10 | FAIL。10件すべて Dreaming light/rem。原文なし |
| 日本語 semantic paraphrase、minScore=0、maxResults=10 | FAIL。10件すべて Dreaming light。原文なし |
| trigger / Active Memory の既知記憶 injection | UNVERIFIED。設定・実装確認のみ |
| この probe に対応する short-term signal 増分 | UNVERIFIED。store 存在確認と当該 signal 記録は別 |
| 既知記憶の gated Deep promotion | UNVERIFIED。直近 sweep の promoted 0 は成功証拠にならない |
| live Notion の新規耐久書き込み | NOT RUN。本件では既存データを書き換えず、分離テストで検証 |

検索品質の問題は [設定可否の追調査と本体側の修正候補](../investigations/17-core-memory-review-artifact-ranking.md) に分離する。単純な故障ではなく、固定時間減衰を含む現行設計と要求の不一致がある。調査結果に合わせて core の trust boundary を緩めたり、private session を広く公開したりはしない。

## 5W1H / 決定と実装

- Who: memory core は一般的な作業・会話記憶、SoulはNotionの感情付き経験記憶・自己状態・主観統合を扱う。
- What: Notion writer/search、5DB setup、ambient recallを保持し、失敗表示と消費証跡を改善する。
- When: 初回分析後、ユーザーが記憶の意味の違いを明示したため訂正した。
- Where: このリポジトリのsource、CLI、テスト、手順。live snapshot / cron / Notionデータは未変更。
- Why: 機能名の類似をデータの意味的重複と誤認し、感情記憶を失う変更を防ぐため。
- How:
  - ltm_write.js、ltm_search.js、setup_ltm.jsは変更前の実装へ戻した。新しいLTM停止フラグは存在しない。
  - setupはmem/events/emotions/state/journalの5DBを維持する。
  - ambientだけ `SIS_AMBIENT_RECALL=0` で明示的に一時停止できる。unset/empty/1 は有効。OC移行用の既定停止ではない。
  - Notion LTM / self-state / journal helper は ambient flag や core search に依存しない。
  - staged candidate に ID を付け、別の消費 receipt に candidate_id / consumed_at / used_in を保存する。read は書き込みをせず、ack は期限・IDを検証する。
  - 旧 ID 無し artifact は元 bytes の SHA-256 で識別し、履歴を書き換えず扱う。
  - dry-run は preview、shelf exception は ok=false / exit 1。receipt は consumer の利用申告であり、認知的利用の自動証明ではない。
  - SKILL の required Notion env を外し、ローカル自己状態の確認を資格情報で丸ごと無効化しない。Notion 書き込みの成功条件は緩めない。

## 検討して採用しなかった案

- Notion記憶を削除・archive化・既定停止: 感情付き経験記憶を維持するユーザーの意図に反する。OC側probeの合否とは無関係。
- 片方をもう片方の自動fallbackにする: 異なる記憶の意味と成功条件を混同する。
- Dreaming を Soul 側で独自検索・再ランキングする: 本体側の欠陥を第二検索 stack で隠す。
- staging を injection と見なす: producer の成功は consumer の利用を証明しない。
- subjective journal を日次イベント列挙へ縮退: Issue の非目標と ADR 0003 に反する。

## 移行 / rollback

実際の手順は skill 内の [memory-transition.md](../../soul-in-sapphire/references/memory-transition.md) を単一の運用参照にする。

この作業でlive runtime / cron / staged artifacts / Notion rowsは変更していない。初回source変更のうちNotion縮小につながる部分は取り消した。本番rollbackは不要。観測改善の本番適用前にはsnapshot、env、prompt、artifactのpre-imageを保存する。

00:45のNotion記憶writer、感情記録、01:00journal、ambientを退役させる計画は取り下げる。実際のデータと用途を監査するまでは重複と決めない。ADR 0001のambientを維持する方向を尊重し、今回追加するのは失敗/消費観測と明示的な一時停止だけ。

## 検証結果 / 残条件

`node --test soul-in-sapphire/scripts/memory_boundary.test.js`: 7 tests PASS。

- ambientの明示的一時停止でAPI接触・既存stage書き換えなし。
- Notion LTM保存・検索は通常動作し、不正ambient設定に影響されない。タグと感情を表す本文を保持。
- setupは既定で5DB。ambientはopt-inなしで動作。
- Notion shelf failure が非0終了。
- preview / staging / read / acknowledgment を区別。期限切れ・候補差し替えを拒否、ack は冪等。
- ID無しの旧 candidate も消費記録可能。
- 不正ambient設定に影響されずevent/emotion/state relationと主観日記を保存。Notion failureはfalse successにならない。

skill-creator の `quick_validate.py`: PASS。`git diff --check`: PASS。

上記は local fixture による契約検証であり、live Notion 可用性や core injection の検証を代用しない。

残条件: Soul側の実際の感情付き記憶とrelationを使った保存→検索→感情文脈の参照→会話利用の監査、OC記憶との実内容・用途の比較、観測改善のruntime検証。OC ranking / injection / promotionは独立課題であり、Notionを置換するためのgateではない。Issue本文の一律退役案は再設計が必要。GitHubへの投稿、push、publishは行っていない。

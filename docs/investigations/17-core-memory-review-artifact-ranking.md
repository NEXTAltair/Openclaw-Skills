# Issue #17 から分離: Dreaming review artifacts による既知記憶の検索不達

状態: 設定だけでの回避可否を追調査済み。本体修正は未着手、GitHub へ未投稿。OpenClaw source / live config は未変更。

範囲の訂正: ここで調べたのはOC側の原文とDreaming生成物の検索順位であり、SoulのNotion感情付き記憶ではない。ユーザーの明示によりNotionは保存・想起する中核として維持する。本調査の結果や将来のOC検索改善は、Notion記憶の代替・退役を意味しない。

## 再現と確認済み事実

詳細な環境・監査は [ADR 0004](../adr/0004-soul-memory-ownership-and-gated-migration.md) を参照。

1. 既知の日次原文がファイルと index の両方に存在することを確認する。
2. `memory_search` に `{query: "1d100", maxResults: 10, minScore: 0}` を渡す。
3. 返った10件はすべて `memory/dreaming/light/*` または `rem/*`。原文を含む日次ファイルは返らない。
4. Issue 本文の日本語 query と、文意を言い換えた日本語でも同種の不達を確認。
5. 同時点の index は dirty=false / identity=valid / vector complete。原文欠損ではない。

表示上の generated provenance は system。明示的な検索で system を返すこと自体と、それを自動注入・昇格することは別の規則であり、混同しない。

## 初回調査時の仮説 (以下の追調査で更新)

- 4,394 chunks中3,135が Dreaming。生成物の量と繰り返しが候補窓を圧迫し得る。
- `manager-search.ts` の keyword / vector が有限の候補窓を返し、その後 hybrid ranking が処理する。
- `hybrid.ts` の recency / importance と MMR も影響し得る。追調査で実効 MMR は enabled と確認した。
- 今回は各段階の候補 ID・SQL結果・スコア寄与を記録していない。生成物だけを結果後段で filter すれば直る、とは断定できない。
- 低 minScore でも gold source が返らないため、最終閾値を下げるだけでは受け入れ条件を満たせない。

## 初回の本体側変更案 (確定案ではない)

- indexed provenance とは独立した source role (source / curated / generated review) を取得計画で扱う。
- 通常の事実 recall では generated review が primary source の枠を消費しないよう、SQL LIMIT / KNN window より前に候補枠を分離するか、role-aware な overfetch を行う。
- review artifact は明示的な Dreaming review / diagnostic 経路で引き続き読めるようにする。データ削除や trust class の格上げを解決策にしない。
- `source role` は content に埋めた自己申告で決定しない。core が管理する path / writer metadata を根拠にする。
- path 判定には区切り・正規化・custom workspace を含め、似た名前の通常ノートを巻き込まない。

## 必要な本体側 regression tests

- 古い gold daily note / curated entry と、大量の新しい generated reports を同時に索引する。
- exact wording、CJK semantic paraphrase、vector only、FTS only、hybrid で gold を取得する。
- candidate window を超える生成物を置き、結果の後段 filter だけでテストが偶然通らないようにする。
- provenance / visibility withholding、project scope、query budget を維持する。
- 明示的な review 要求は generated artifact を取得できる。
- fixture テストとは別に、この環境の既知記憶から trigger / Active Memory injection / short-term / promotion を追跡する。

これは調査に基づく修正候補であり、実装済み・検証済みの本体修正ではない。

## 追調査: ソース変更か、設定変更か (2026-09-06)

ユーザーから「重大さが違うので設定で済むか先に調べる」と指示を受け、live config と source を変更せずに再調査した。

### 判定

**原文を取得するだけなら設定/呼び出し条件で回避可能。ただし、通常の少数件検索で古い原文を優先し、意味検索も維持する改善は、現在の builtin の公開設定だけでは実現する制御がない。** その挙動を変更する場合は、検索実装またはそれを変更した将来版が必要になる。

「OC が壊れているからソース修正が必須」という初回の言い方は強すぎた。固定30日半減期という仕様が観測結果を説明する。まず設定だけの回避、読み取り手順での回避、仕様変更を区別する。

### 公式仕様 / schema / 実効値

- [公式 memory config](https://docs.openclaw.ai/reference/memory-config) を HTTP 200 で取得し、現行 checkout と照合。
- `src/config/zod-schema.agent-runtime.ts:854`: query は maxResults / minScore のみ。strict schema。
- `src/agents/memory-search.ts:120`: default maxResults=6、minScore=0.35。
- 同ファイル: vectorWeight=0.7、textWeight=0.3、candidateMultiplier=4、MMR enabled=true / lambda=0.7、temporalDecay enabled=true / halfLifeDays=30。resolver はこれらの定数をそのまま渡す。
- `manager-search-orchestration.ts:276`: retrieval leg ごとの候補は maxResults×4、上限200。
- live top-level memory は search.enabled=true、main の個別 search override はなし。
- main 用の変更は公開設定上 `agents.entries.main.memory.search.query` に限定できる。全体既定を変える必要はない。

実際の `MemorySearchSchema.safeParse` をメモリ内で実行した結果:

| 入力 | 結果 |
| --- | --- |
| query.maxResults=50 / minScore=0 | accepted |
| query.hybrid.temporalDecay.enabled=false | rejected: Unrecognized key hybrid |
| excludePaths=[memory/dreaming/**] | rejected: Unrecognized key excludePaths |

extraPaths.pattern は追加 roots の対象指定で、既定の memory/ 配下を除外する仕組みではない。memoryPolicy.excludeSessions は自動 session ingestion の制御で、既存 Dreaming report の explicit-search 除外ではない。Dreaming を停止しても既存生成物は索引から消えない。

前の ADR にあった「MMR は既定で無効」は誤り。低レベル helper の既定と、実運用 resolver が渡す値を混同したため、ADR も訂正した。

### 変更しない live probes

`openclaw memory search --agent main --query <query> --max-results <n> --min-score 0 --json` を実行し、完全な CLI JSON をローカルで集計した。live 設定ファイルは変更していない。

| query / 件数 | gold 原文 | Dreaming件数 |
| --- | --- | --- |
| 1d100 / 50 | なし | 46/50 |
| 1d100 / 200 | 2026-06-02.md が111位、score 約0.0322 | 184/200 |
| 日本語 semantic paraphrase / 200 | 2026-06-01.md が65位、約0.0344。06-02が85位、約0.0288 | 192/200 |
| exact path memory/2026-06-02.md / 10 | 06-02が1位、score=1 | 0/10 |

したがって maxResults と minScore の緩和で到達可能性は上がるが、ランキング自体は直らない。200件の大半が生成物であり、agent tool の出力予算もある。実際、tool 経由50件の raw result は途中で切れたため、それを完全な結果とせず、CLIで再集計した。200件を通常既定へ変更することは推奨しない。

exact path は即時の読み取り回避策になるが、過去の日付を知らない意味的想起の代替ではない。

### 固定 ranking の因果確認

live SQLite を readOnly=true で開き、FTS MATCH を直接照合した。1d100 の全文一致は7件、gold は3位。gold provenance は agent、importance は未設定。index欠損・system provenance による gold 除外ではない。

次に、現行 core の searchKeyword / mergeHybridResults を変更せず import し、メモリ上で同じ候補を再計算した。live の400件要求で返った204件から全200 vector candidatesを取得し、FTS7件と対応付けた。完全候補の現在設定 replay は gold111位 / 約0.0322 を再現した。

診断用に候補を40件の vector + FTS7件へ固定した比較:

| 再計算条件 | gold順位 | gold score |
| --- | --- | --- |
| 現在の固定値 | 33 | 約0.0322 |
| 時間減衰だけ無効 | 1 | 0.3 |
| MMRだけ無効 | 32 | 約0.0322 |

これは live 設定を切り替えた実験ではなく、同じ関数・候補集合を使った一要因の比較。小さな候補集合での診断順位を実際のtool全体の順位と同一視しない。

この token probe では、約96日前の原文にかかる30日半減期の減衰が大きな要因。さらに原文は vector candidate には入らず text-only の混合寄与が0.3であるため、減衰だけ外しても既定 minScore=0.35 は通らない。MMRを切るだけでは解決しない。

### 選択肢と影響

| 方法 | source修正 | 効果 / 負担 |
| --- | --- | --- |
| 既知の日時/pathで絞る・原文を直接読む | 不要、設定変更も不要 | 即時に使える限定的回避策。意味想起の品質改善ではない |
| mainだけ件数を増やしminScoreを下げる | 不要 | 取得できるが大半がノイズ。tool出力・context負担が増える。既定変更は未実施 |
| provider=noneでFTS中心にする | 不要 | 語句検索中心へ機能を変える。意味検索を失い、index identityにも関わるため同等な修正ではない。live切替は未実施 |
| embedding modelの変更 | 不要 | similarity改善の可能性は未検証。固定時間減衰は残り、再embeddingの負担がある。解決済みとは言えない |
| 通常の少数件・意味検索で古いsourceを優先する | 現行builtinでは実装変更が必要 | source-role handling、historical recall時の減衰/閾値、lexical evidenceの扱い等の局所設計。採用案は未決定 |

新しい独立 memory stack やDB全面移行が必要と判明したわけではない。一方、core ranking を変えるなら利用する全agentへの影響があり、regression tests・build・runtime反映を伴うため「設定1行と同じ」とは扱わない。

**次の判断は、件数を増やす暫定回避を許容するか、標準の少数件検索品質を改善するかで分かれる。現段階ではOC本体の改修へ自動的に進まない。**

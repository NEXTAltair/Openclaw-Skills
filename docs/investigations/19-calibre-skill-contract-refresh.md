# Calibreスキルの契約見直し (2026-10-10)

対象は `calibre-catalog-read` と `calibre-metadata-apply`。リポジトリのソース更新であり、ClawHub公開・インストール済みスナップショットの差し替え・本番書籍の更新は含めない。

## 調査基準

- 調査時の公式CLIマニュアルはCalibre 9.16.0表記。
- 検証ホストの `calibredb --version` は9.2.1。現行マニュアルだけでなく、この実機のhelpと隔離ライブラリで互換性を確認する。
- 既存Content serverへの接続とライブラリID列挙は読み取り専用で確認。認証情報や実書籍の内容はこの資料に記載しない。
- 比較元: `d3e8e8ae33e2a2fcdef8607c582834e7b834829b`。他スキルの作業中変更は対象外。

## 旧実装で確認した問題

1. 読み取り用の解析パイプラインと完了ハンドラが、解析後に `set_metadata` でcommentsを書き換えていた。名称・ルーティングと副作用が一致していない。
2. 更新用のdry-runはコマンド表示に留まり、確認したbefore/afterと適用時の入力を結びつけない。複数行の後半で不正入力が判明しても、前半は既に適用され得る。
3. `cp.status || 0` がspawn失敗を成功扱いする。隔離ライブラリと `calibredb` を含まないPATHで再現し、実行不能なのに `applied: 1` / exit0となった。本番で発生したと主張するものではない。
4. DNS nameserverと `host.docker.internal` を接続先候補へ自動追加し、別ホストへ同じ認証情報を送る設計だった。明示した接続先を固定する必要がある。
5. READMEには実装にないconfig/auth保存オプション、固定の専用agent、必須2ターン、旧IP例が残り、必要バイナリも単純なカタログ参照と重い本文解析で区別されていない。
6. 本文解析はライブラリを区別しないcacheキー、既存export先の最初のファイル選択、定型文のfallback分析を持ち、対象・原本・解析範囲の結びつきが弱い。

## 改修方針

- 読み取り側は検索・参照・書き出し・抽出・解析結果の検証とローカル提案まで。comments/tagsも更新側の対象とする。
- 更新側は全入力検証、保存した変更計画、対象/現在値の再照合、実行記録、再読み取り検証を一連の契約とする。
- 接続先を明示または設定から1つに決定し、暗黙のホスト探索・切替を行わない。パスワードは値をコマンド引数やログへ出さない。
- 原本ハッシュ・ライブラリ・書籍・run・言語・解析範囲を明示する。未読部分を読了扱いしない。
- runtime状態は配布ディレクトリから分離する。旧状態の破壊的移行は行わない。
- 外部書き込みの承認は人間の意図・対象・変更内容に基づく。CLIフラグや計画のハッシュは人間の承認を代替しない。

## 実機で注意が必要な意味論

- `authors` 配列は著者名中のカンマを保持し、Calibreの著者区切りで送る。著者変更だけではauthor_sortが自動更新されない場合がある。
- `languages:ja,en` は `jpn,eng` に正規化される。
- このホストでは裸の `pubdate:2024-02-29` が `2024-02-28T00:00:00+00:00` になった。`2024-02-29T00:00:00Z` なら日付が保持される。隔離ライブラリで再現した挙動であり、日付文字列の見かけだけで検証しない。
- exportは既定でコピー内のメタデータを更新する。原本の同一性確認には `--dont-update-metadata` を使う。
- Calibre CLIはサーバー全体の比較交換/CASやバッチトランザクションを提供しない。直前照合でも他クライアントとの競合を完全には封じられず、途中失敗は記録と再照合が必要。

## 検証

- メタデータ側: Nodeの回帰テスト12件成功。全入力検証、タグ置換、言語/日付/sort、stale対象、計画改変、書込失敗・偽成功、receiptによる再試行拒否、認証経路、重複完了を検証。
- 読み取り側: Python unittest16件成功。CLI JSON/ID完全一致/help/ライブラリ列挙、日本語ID、準備からオフライン完了、部分解析、不正coverage、原本改変、短文/漫画停止、並行完了、cacheの言語/接続先分離と旧DB保持を検証。
- 実Calibre 9.2.1: 隔離した合成EPUB/ローカルライブラリで3件成功。2スキル連携、dry-run前後のメタデータ不変、適用/readback、日付/言語/著者/sort、値の消去、コメント区画の再置換を確認。合計31件成功、skip0。
- 両SKILL.mdのquick_validate、JavaScript構文、JSONリソース、git diff --checkを確認。
- 既存Content serverでは、新wrapperによるライブラリ列挙・ID読み取りと、同じ値を指定したno-op dry-runだけを実行。changed0/no_op1、前後のtitle/UUID/last_modified一致。remote applyは呼んでいない。

再実行コマンド(リポジトリ直下):

    node --test calibre-metadata-apply/tests/*.test.mjs
    python3 -m unittest discover -s calibre-catalog-read/tests -v
    CALIBRE_NATIVE_TESTS=1 python3 -m unittest discover -s tests -p test_calibre_integration.py -v

追加の実機差分:

- Calibre CLIはURL fragmentのライブラリIDをpercent-decodeしない。内部の正規化済みidentityと、CLIへ渡す日本語のリテラルIDを分離して修正。
- set_metadataのauthorsフィールドでは名前中のリテラル&を安全にescapeできず、&&でも別の著者へ分割されることを隔離検証で確認。OPFで著者を個別に照合し、このwrapperでは名前中の&/|を書込前に拒否する。フルOPF置換へ勝手に切り替えない。
- 解析coverageは準備済みの実ファイル・hash・件数・文字数と自己申告を照合するもので、モデルが内容を理解したことの証明ではない。
- 本番書込、サーバー起動、設定変更、インストール済みスナップショットの差し替え、commit/push/ClawHub公開は対象外。

## 公開準備の再確認

- 2026-10-10に上記31件を再実行し、すべて成功、skip0。構文・JSONリソース・両SKILL.mdの形式・git diff --checkも確認。
- 新規ヘルパーとテストを含む配布候補は、実indexを変更しない一時Git treeから抽出。本番書籍・認証情報・実行ログは含めない。
- ClawHub CLI 0.23.1は`.jsonl`を配布対象から除外する。変更例を`references/changes.example.md`のJSONLコードブロックへ移し、SKILL.md/README.mdの参照を更新。
- 修正後の配布候補はcatalog 15ファイル、metadata 11ファイル。CLIと同じ配布選別で必須リソースの欠落0、fingerprint一致を確認し、両方の2.0.0候補がdry-runで`would-publish`。これは未commitの候補検証であり、実公開時は対象ファイルをcommitして、そのcommitから再抽出する。
- 公開準備時点ではcommit・push・実公開は未実施。YomiTokuの導入・試用は別作業で、今回のCalibreパイプラインには未統合。

## 一次資料

- [Calibre CLI manual](https://manual.calibre-ebook.com/generated/en/calibredb.html)
- [Calibre export](https://manual.calibre-ebook.com/generated/en/calibredb.html#export)
- [Calibre v9.2.1 set_metadata implementation](https://github.com/kovidgoyal/calibre/blob/v9.2.1/src/calibre/db/cli/cmd_set_metadata.py)
- [OpenClaw subagent tool reference](https://docs.openclaw.ai/tools/subagents/tool-reference)

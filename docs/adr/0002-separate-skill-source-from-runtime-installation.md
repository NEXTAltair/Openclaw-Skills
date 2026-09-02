# ADR 0002: skill の authoring source と runtime installation を分離する

- **日付**: 2026-09-02
- **ステータス**: Accepted
- **対象**: Openclaw-Skills repository、OpenClaw workspace skills、ClawHub publish/install、Skill Workshop
- **関連 Issue / PR**: なし
- **関連 commit**: `eb42867` (`Curate workshop skills into source repository`)

## 背景

`/home/altair/.openclaw/workspace/val/skills` は、OpenClaw が実行時に読む
skill 配置先である一方、`NEXTAltair/Openclaw-Skills` の Git checkout としても
使われていた。

そのため、次の異なる所有物が同じ directory に混在していた。

- 自作 skill の編集元と Git metadata
- ClawHub から install した skill
- Skill Workshop が生成した未採用 skill
- plugin が配布する skill への symlink
- runtime state、cache、install metadata

この構成では、編集元と配布物の境界、Git へ取り込むべき差分、ClawHub publish
対象、rollback 対象が分かりにくい。

## 現状の挙動

OpenClaw の `openclaw skills install @owner/slug` は、release bundle を active
workspace の `skills/` directory へ展開する。install 済み skill は
`.clawhub/origin.json` を持つ物理 directory であり、authoring repository への
symlink ではない。

owner-qualified skill は、例えば次のように配置される。

```text
<workspace>/skills/@nextaltair/soul-in-sapphire/
```

plugin-owned skill は plugin 側 directory への symlink として露出する場合がある。
これは ClawHub install とは別の配布経路である。

## 問題

source checkout と runtime install 先を同一 directory にすると、次の問題が起きる。

- Workshop 生成物や ClawHub 配布物が Git の未追跡差分として見える。
- live runtime を直接編集し、source と release が食い違う。
- publish 時に runtime state や第三者 skill を誤って含める危険がある。
- source を更新しただけで live skill が変化したのか、再installが必要なのか判別しにくい。
- backup、rollback、所有権の境界が曖昧になる。

## 5W1H

### Who: 誰が関係するか

- 自作 skill を編集・releaseする repository owner
- workspace skill を読み込む OpenClaw agent
- candidate skill を生成する Skill Workshop
- release bundle を配布する ClawHub
- plugin-owned skill を配布する OpenClaw plugin

### What: 元は何で、何を変えるか

元は workspace `skills/` が Git source checkoutを兼ねていた。

変更後は次のように分離する。

```text
/home/altair/src/Openclaw-Skills/
  Git管理された authoring source

/home/altair/.openclaw/workspace/val/skills/
  ClawHub install、private runtime skill、plugin symlink
```

採用済みの公開 skill は source repository からClawHubへpublishし、workspaceへ
ClawHub releaseとしてinstallする。

### When: いつ決めたか

2026-09-02、Workshop生成skillを自作repositoryへ昇格する作業中に、source checkoutと
runtime配置先の混在が確認されたため決定した。

### Where: どこを変えるか

- source: `/home/altair/src/Openclaw-Skills`
- runtime: `/home/altair/.openclaw/workspace/val/skills`
- registry: `@NEXTAltair/*` ClawHub releases
- decision log: `docs/adr/`

### Why: なぜ変更が必要か

source、release、runtime、Workshop candidate、plugin配布物の所有境界を明確にし、
誤publishやlive directoryの直接編集を防ぐため。

### How: どう実装し、どう確認するか

1. workspaceにあったGit履歴を保って`/home/altair/src/Openclaw-Skills`へcloneする。
2. Workshop候補を選別し、採用品だけsource repositoryへ取り込む。
3. Git追跡fileだけをstageしてClawHubのdry-run file listを確認する。
4. releaseをpublishする。
5. workspaceの旧local copiesをrecoverable backupへ退役させる。
6. `openclaw skills install @NEXTAltair/<slug>`でreleaseをinstallする。
7. source/release/runtimeのhash、skill validation、`.clawhub/origin.json`を確認する。

## 検討した選択肢

### 案A: workspaceをGit checkoutのまま使う

編集は簡単だが、source、runtime、第三者skill、Workshop候補が再び混在するため不採用。

### 案B: source repositoryからworkspaceへsymlinkする

重複copyは避けられ、編集も即時反映される。ただしsource編集がそのままlive runtimeへ
反映され、release前の検証・配備境界が消えるため、公開済みskillの通常運用には不採用。

plugin-owned skillのsymlinkはplugin lifecycleが所有するため、この判断の対象外とする。

### 案C: local directory installを使う

sourceとruntimeは分離できるが、`openclaw skills update`のClawHub version trackingを
利用できない。公開前の試験やprivate skillには利用できるが、公開済みskillの標準配備には
採用しない。

### 案D: ClawHub releaseをworkspaceへinstallする

source、公開release、runtime snapshotの境界が明確になり、versionとoriginも追跡できる。
これを採用する。

## 決定

- `/home/altair/src/Openclaw-Skills`を唯一のauthoring sourceとする。
- 公開済み自作skillはClawHub releaseからworkspaceへinstallする。
- ClawHub installがworkspace内へ物理copyを作ることを正常な配備状態とする。
- plugin-owned symlinkはplugin lifecycleへ委ねる。
- private skillは公開せず、必要に応じてlocal installまたは明示的な手動管理とする。
- Workshop生成物はcandidateとして扱い、採用判断・source編集・validation・commit・publishを
  経てからruntimeへ配備する。
- workspaceのruntime copyを直接編集しない。

## 影響

良い点:

- authoring sourceとlive runtimeの境界が明確になる。
- ClawHubのversion、origin、scan、update経路を利用できる。
- Workshop候補や第三者skillを誤publishしにくくなる。
- source repositoryのcommitとruntime releaseを対応付けやすい。

注意点:

- sourceとworkspaceに同じskillの物理copyが存在する。これはClawHub installの仕様であり、
  重複排除を目的にした構成ではない。
- source変更はpublishとreinstallを行うまでruntimeへ反映されない。
- scoped installでは物理pathが`skills/@owner/slug`になる。skill本文やscriptが
  `skills/<name>/...`を固定参照していないか、release前に検査する必要がある。
- registry slugと`SKILL.md`の`name`が異なる場合は対応を明記する。

将来、ClawHubがcontent-addressed storeとsymlinkによるinstallを正式対応した場合は、
物理copyの重複と配備境界を再評価する。

## Rollback

1. workspaceの対象ClawHub skillをuninstallする。
2. 保存済みworkspace backupから旧配置を復元するか、source directoryからlocal installする。
3. source repository自体は`/home/altair/src/Openclaw-Skills`に保持する。
4. runtime hashとskill validationを再確認する。

## 検証

移行時に次を確認した。

- source repositoryの採用skillがvalidatorを通ること。
- Git追跡fileだけがClawHub publish bundleへ含まれること。
- ClawHub install後のruntime skillに`.clawhub/origin.json`が存在すること。
- sourceとruntimeの内容hashが一致すること。
- plugin-owned skill symlinkが維持されること。
- workspace rootがGit checkoutではなくなっていること。

今後のreleaseでは、固定path検査を含めて次を実行する。

```bash
git diff --check
rg -n 'skills/[A-Za-z0-9_-]+/' --glob 'SKILL.md' --glob '*.js' --glob '*.mjs'
openclaw skills verify @NEXTAltair/<slug>
```

- [x] 音源の改善
- [x] velocity-config の MELODY_SQUARE を変更し、音量調整
- [x] SE の test から hash の整合を削除中。テストに問題があり、修正が必要
  - 現状のテストの問題点を検証し、その検証結果をまずユーザに提示せよ
  - 必要に応じて test を通過していた git 上の最新版を確認する
- [x] MELODY_SQUARE という命名は実態と合わない。メロディ担当チャネルの音量であることを示す
- [x] SE全体の音量が小さいので、調整する

- [x] 一通り修正が完了したら、現状の実装をレビューする
  - レビュー結果: テスト99件全件通過。実装は概ね良好。
  - 発見した課題:
    1. `phase/structure-planning.ts` と `phase/structure-planning/voice-arrangements.ts` + `voice-arrangement-selector.ts` でVoice Arrangementの定義が重複している（後者は未使用の可能性）。
    2. `sectionRepeatBias` オプションが内部API `runPipeline()` のみで利用可能で、公開API `generateComposition()` からは使えない。
    3. その他小さな改善点あり（詳細は実装レビューログ参照）。
- [x] ドキュメントを現状に合わせて更新する
  - `score.md` / `score_ja.md`: velocity scaling値を現行実装（triangle 85%/non-bass full strength, square bass 0.66, melody 0.4）に修正。
  - `se.md`: 「SE typeあたり4テンプレート」という表現を「全体で43テンプレート」に修正。

- [x] 生成されるBGMのバリエーション増加のための施策を考える
  - score.md 記載のロジックをレビューし、8つの施策を特定。
  - 施策一覧（影響度順）:
    1. **リズムモチーフの重複削除・拡充**: rhythm.jsonに22重複+18重複があり、実質34%が無駄。dedup後に新パターン追加。
    2. **Hook再利用の緩和**: sectionRepeatBiasのデフォルトを下げ、再現Aセクションを自動的に変化させる。テストも緩和。
    3. **タグフィルタリング強化**: preferTagPresenceのminRatioを0.4→0.15程度に、pickWithAvoidのリトライ回数を増やす。
    4. **Two-Axis意図の連続強度化**: StyleIntentをbooleanから0.0-1.0の連続値にし、座標の微妙な差異が結果に反映されるようにする。
    5. **テクスチャ・構造の多様化**: テンプレート数を4→8-10種に、texture変異確率を10%→25-30%に。sparse/call_and_response等の新テクスチャ追加。
    6. **テクニックライブラリ拡充**: techniques.jsonのduty sweep/gain profile/ornamentを増やす。vibrato等の新ファミリ追加。
    7. **Voice Arrangementの再バランス**: standard/swappedの重みを下げ、未使用presetの確率を上げる。セクション毎のarrangement変更も検討。
    8. **ベースアルペジオの拡充**: bass-patterns.jsonのarpeggioが4種のみ。8-10種に増やす。
  - 実装の際は各施策ごとにテスト・seed sweepで検証が必要。

- [x] 上記レビューで発見された課題の解決
  - 課題1: `structure-planning.ts` からVoice Arrangement定義を削除し、`voice-arrangement-selector.ts`を使用するように変更。
  - 課題2: `sectionRepeatBias` を `CompositionOptions` に追加し、`profile-resolver.ts` で `PipelineCompositionOptions` に伝達。
- [ ] BGMバリエーション施策を順に実施。実施後は逐次多様性検証スクリプトで検証すること
  - [x] 施策1 dedup: rhythm.jsonから59件の重複モチーフを削除（135→76件）。
  - [ ] 施策1 expansion: 新規リズムパターンを追加（dedup後の余白を埋める）。
  - [x] 施策2: Hook再利用の緩和（sectionRepeatBiasデフォルトを0.3→0.15に変更、閾値0.25→0.20に変更。テスト緩和済）。seed-sweep検証通過。
  - [x] 施策3: タグフィルタリング強化（preferTagPresenceのminRatioを0.4→0.15、pickWithAvoidリトライを3→6）。seed-sweep検証通過。
  - [ ] 施策4: Two-Axis意図の連続強度化（StyleIntent boolean→float化は影響範囲が大きいため次期対応）。
  - [x] 施策5: テクスチャ・構造の多様化（TEXTURE_VARIATION_PROBABILITYを0.1→0.25に増加。seed-sweep検証通過）。
  - [x] 施策6: テクニックライブラリ拡充（techniques.jsonにduty sweep +2、gain profile +2、pitchBend ornament +1を追加。seed-sweep検証通過）。
  - [x] 施策7: Voice Arrangementの再バランス（standard/swappedの重みを5/4→3/3に、他presetを2→3に均等化。seed-sweep検証通過）。
  - [x] 施策8: ベースアルペジオの拡充（bass-patterns.jsonにarpeggioパターンを4→10種に追加。seed-sweep検証通過）。

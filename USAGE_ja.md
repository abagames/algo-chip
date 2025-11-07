# 利用ガイド

[English](./USAGE.md) | 日本語

このガイドは `@algo-chip/core` を Web Audio アプリケーションへ統合する際の実用例をまとめています。高レベルのアーキテクチャや詳細仕様は `score.md` と `se.md` が正となるため、ここではプロジェクトに貼り付けて使えるコードにフォーカスします。

## 1. BGM 生成

```typescript
import { generateComposition } from "@algo-chip/core";

const bgm = await generateComposition({
  lengthInMeasures: 16,
  seed: 12345,
  twoAxisStyle: {
    percussiveMelodic: -0.2,
    calmEnergetic: 0.6,
  },
});

console.log(`BPM: ${bgm.meta.bpm}, events: ${bgm.events.length}`);
```

- `seed` を指定すると生成結果を決定的に再現できます。
- `twoAxisStyle` は打楽器/旋律軸と静穏/躍動軸で楽曲の雰囲気を指定します。

## 2. 効果音生成

```typescript
import { SEGenerator } from "@algo-chip/core";

const generator = new SEGenerator();
const jumpEffect = generator.generateSE({
  type: "jump",
  seed: 4242,
});

console.log(`Template used: ${jumpEffect.meta.templateId}`);
```

効果音のイベントも BGM と同じ `Event[]` 形式なので、同じスケジューラでミックスできます。

## 3. AlgoChipSynthesizer での最小再生

```typescript
import { AlgoChipSynthesizer } from "@algo-chip/core";

const audioContext = new AudioContext();
const synth = new AlgoChipSynthesizer(audioContext, {
  workletBasePath: "./worklets/",
});
await synth.init();

await synth.play(bgm.events, {
  loop: true,
  volume: 0.8,
});

await synth.play(jumpEffect.events, {
  startTime: audioContext.currentTime + 0.2,
  volume: 0.6,
});
```

`SynthPlayOptions`（`docs/api/` に出力される TypeDoc を参照）で `startTime`, `loop`, `lookahead`, `leadTime`, `onEvent`, `volume` を制御できます。

## 4. セッション志向の再生（共有ヘルパー）

`@algo-chip/util` パッケージは、BGM 生成・ループ再生・効果音の量子化/ダッキングをまとめた高レベルな `AudioSession` を提供します。Web デモ UI もこの仕組みを内部で利用しているため、下流アプリはデモコードをコピーせず公開パッケージへ依存できます。

```typescript
import { createAudioSession } from "@algo-chip/util";

const session = createAudioSession({
  workletBasePath: "./worklets/",
});

// ブラウザの自動再生ポリシーにより、ユーザー操作ハンドラー内で呼び出す必要があります。
await session.resumeAudioContext();

// BGM を生成してループ再生（効果音量子化用にアクティブなタイムラインを保持）
const bgm = await session.generateBgm({
  lengthInMeasures: 16,
  seed: 9001,
  twoAxisStyle: { percussiveMelodic: -0.3, calmEnergetic: 0.7 },
});

await session.playBgm(bgm, {
  loop: true,
  onEvent: (event, when) => {
    // 任意: 可視化フック
  },
});

// 固定シードでビート量子化＋ダッキングした効果音を生成して再生
const coinSe = session.generateSe({
  type: "coin",
  seed: 4242,
});

await session.playSe(coinSe, {
  duckingDb: -4,
  quantize: {
    quantizeTo: "beat",
    phase: "next",
    loopAware: true,
  },
});
```

- `configureSeDefaults({ duckingDb, volume, quantize })` で後続の `triggerSe` 呼び出しが使うデフォルト値を調整できます。
- `setBgmVolume(value)` はシンセを再構築せずにループ中の BGM 音量をスケールします。
- `cancelScheduledSe()` は未再生の SE をすべてキャンセルします（ポーズ/停止時に有用）。
- `triggerSe(options)` は `generateSe` と `playSe` を一括実行するラッパーとして使えます。

内部的には `AlgoChipSynthesizer` と `SoundEffectController` をラップしているため、より細かい制御が必要な場合は `@algo-chip/util` から個別に import して組み合わせられます。

### 4.1 タブ非表示時の一時停止/再開

`@algo-chip/util` には `createVisibilityController` も含まれており、ブラウザの visibility 変化に合わせてセッションの pause/resume を管理します。現在のループオフセットを保持し、タブ非表示中は AudioContext を suspend し、復帰時にシームレスに再生を再開します。

```typescript
import { createAudioSession, createVisibilityController } from "@algo-chip/util";

const session = createAudioSession();

const detachVisibility = createVisibilityController(session, {
  // 任意: BGM 再生中のみ自動一時停止したい場合に条件を指定。省略すると常に停止。
  shouldPause: () => session.getActiveTimeline() !== null,
  onPause: ({ offsetSeconds }) => {
    console.log("Paused at", offsetSeconds);
  },
  onResume: ({ resumed }) => {
    console.log(resumed ? "Resumed playback" : "Resume failed");
  },
});

// クリーンアップ時
detachVisibility();
await session.close();
```

コールバックは任意で、デフォルト動作だけが必要なら省略可能です。アプリ終了時は必ず disposer（`detachVisibility`）と `session.close()` を呼び出してください。

## 5. API リファレンスの再生成

公開 API を変更した際は TypeDoc を再生成します。

```bash
npm run docs:api
```

HTML 出力は `docs/api/` に書き出され、短い導入ページは `docs/api-reference.md` に置かれます。

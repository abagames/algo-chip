# algo-chip

[English](./README.md) | 日本語

**4チャンネルチップチューン音源による高品質BGM自動作曲エンジン**

## 🎵 特徴

- **モチーフベース作曲**: インテリジェントなバリエーションを持つ事前定義済み楽曲パターン
- **4チャンネルチップチューン音源**: クラシックな4チャンネル音響（矩形波×2、三角波、ノイズ）
- **決定論的生成**: シードベースRNGによる再現可能な結果
- **2系統の配布形式**: npmパッケージ + CDN/`<script>`タグ用UMDバンドル

## 📦 インストール

### npm

```bash
npm install @algo-chip/core
```

### CDN (UMD)

```html
<script src="https://abagames.github.io/algo-chip/lib/algo-chip.umd.js"></script>
<script>
  const { generateComposition, SEGenerator, AlgoChipSynthesizer } = window.AlgoChip;
</script>
```

**重要**: UMD経由でWeb Audio再生（`AlgoChipSynthesizer`）を使用する場合、AudioWorkletプロセッサーの読み込み元を指定する必要があります。

**オプション1: GitHub Pages CDNを使用（推奨）**
```html
<script>
  const audioContext = new AudioContext();
  const synth = new AlgoChip.AlgoChipSynthesizer(audioContext, {
    workletBasePath: 'https://abagames.github.io/algo-chip/worklets/'
  });
  await synth.init();
</script>
```

**オプション2: workletsを自分でホスト**
```html
<!-- サーバーに以下のファイルをダウンロード・配置: -->
<!-- worklets/square-processor.js -->
<!-- worklets/triangle-processor.js -->
<!-- worklets/noise-processor.js -->

<script>
  const audioContext = new AudioContext();
  const synth = new AlgoChip.AlgoChipSynthesizer(audioContext, {
    workletBasePath: './worklets/'  // HTMLからの相対パス
  });
  await synth.init();
</script>
```

## 🚀 使い方

### 基本的なBGM生成

```typescript
import { generateComposition } from "@algo-chip/core";

const result = await generateComposition({
  lengthInMeasures: 16,
  seed: 12345,
  twoAxisStyle: {
    percussiveMelodic: -0.4, // パーカッシブ寄り
    calmEnergetic: 0.5, // エネルギッシュ
  },
});

// result.events - 再生イベントタイムライン
// result.meta - 生成メタデータ（BPM、キーなど）
console.log(
  `${result.events.length} イベントを ${result.meta.bpm} BPM で生成しました`
);
```

### 効果音（SE）生成

```typescript
import { SEGenerator } from "@algo-chip/core";

const generator = new SEGenerator();
const se = generator.generateSE({
  type: "jump",
  seed: 42,
});

// se.events - SEイベントタイムライン
// se.meta - SEメタデータ
```

### Web Audio再生

coreパッケージには音量制御付きWeb Audio再生用の`AlgoChipSynthesizer`が含まれています：

```typescript
import {
  generateComposition,
  SEGenerator,
  AlgoChipSynthesizer,
} from "@algo-chip/core";

// シンセサイザーを初期化
const audioContext = new AudioContext();
const synth = new AlgoChipSynthesizer(audioContext);
// オプション: カスタムworkletパスを指定
// const synth = new AlgoChipSynthesizer(audioContext, { workletBasePath: './custom-path/' });
await synth.init();

// 音量制御付きでBGMを再生
const bgm = await generateComposition({ seed: 123 });
await synth.play(bgm.events, {
  loop: true,
  volume: 0.8, // 80%音量（デフォルト: 1.0）
});

// 音量制御付きでSEを再生
const seGenerator = new SEGenerator();
const jump = seGenerator.generateSE({ type: "jump" });
await synth.play(jump.events, {
  volume: 0.5, // 50%音量（デフォルト: 1.0）
});
```

**volumeオプション**:

- デフォルト: `1.0`（ベースゲイン = 0.7）
- 範囲: `0.0+`（例: `0.5` = 50%、`1.5` = 150%）
- 生成時ではなく再生時に適用

**注意**: `AlgoChipSynthesizer`はブラウザ環境（Web Audio API）が必要です。BGMダッキングやクオンタイゼーションを含む高度なSE再生については、demoパッケージ（`packages/demo/src/playback.ts`）を参照してください。

## 🛠️ 開発

### セットアップ

```bash
npm install
```

### ビルドコマンド

```bash
npm run build              # 全パッケージをビルド
npm run build:core         # coreライブラリのみビルド
npm run build:demo         # demoアプリのみビルド
npm run build:pages        # docs/にビルド・デプロイ（GitHub Pages用）
```

### 開発サーバー

```bash
npm run dev                # demoデベロップメントサーバーを起動（http://localhost:5173）
npm run preview            # プロダクションビルドをプレビュー
```

## 📁 プロジェクト構造

```
algo-chip/
├── packages/
│   ├── core/              # @algo-chip/core npmパッケージ
│   │   ├── src/           # TypeScriptソース（5フェーズパイプライン）
│   │   ├── motifs/        # モチーフJSONライブラリ（コード、メロディ、リズムなど）
│   │   └── dist/          # ビルド出力
│   │       ├── index.js           # ESMバンドル
│   │       ├── index.d.ts         # TypeScript型定義
│   │       └── algo-chip.umd.js   # UMDバンドル
│   └── demo/              # デモWebアプリケーション
│       ├── src/           # デモUIコード（Web Audio再生）
│       ├── index.html     # メインデモページ
│       └── dist/          # デモビルド出力
└── docs/                  # GitHub Pagesアーティファクト（自動生成）
    ├── index.html         # デモページ（packages/demo/dist/から）
    ├── assets/            # Viteビルド出力（packages/demo/dist/から）
    ├── lib/               # UMDバンドル（packages/core/dist/から）
    └── worklets/          # Web Audio Workletプロセッサー（packages/demo/dist/から）
```

## 🎼 パイプラインアーキテクチャ

作曲エンジンは**5フェーズパイプライン**に従います：

1. **構造設計（Structure Planning）** - BPM、キー、セクション、コード進行
2. **モチーフ選択（Motif Selection）** - リズム、メロディ、ベース、ドラムパターン割り当て
3. **イベント実現（Event Realization）** - 抽象モチーフを具体的なノートイベントに変換
4. **テクニック適用（Techniques）** - エコー、デチューン、アルペジオを適用
5. **タイムライン確定（Timeline Finalization）** - イベントソート、拍→時間変換、診断情報生成

## 📖 ドキュメント

- `score_ja.md` ([English](./score.md)) - プロダクション仕様（主要リファレンス）
- `se_ja.md` ([English](./se.md)) - 効果音生成仕様
- `CLAUDE.md` - 開発ガイドラインとコーディング規約
- `docs/` - GitHub Pagesデプロイ先（`npm run build:pages`で同期）

## 🔗 リンク

- [ライブデモ](https://yourusername.github.io/algo-chip/) _（GitHubユーザー名で更新してください）_
- [UMDバンドル](https://yourusername.github.io/algo-chip/lib/algo-chip.umd.js)
- [npmパッケージ](https://www.npmjs.com/package/@algo-chip/core) _（公開後）_

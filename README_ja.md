# algo-chip ([Demo](https://abagames.github.io/algo-chip/))

[English](https://github.com/abagames/algo-chip/blob/master/README.md) | 日本語

**4 チャンネルチップチューン音源による高品質 BGM 自動作曲エンジン**

https://github.com/user-attachments/assets/b0897d24-abd3-4d9a-932a-4a0d4280a1f3

## 🎵 特徴

- **モチーフベース作曲**: インテリジェントなバリエーションを持つ事前定義済み楽曲パターン
- **4 チャンネルチップチューン音源**: クラシックな 4 チャンネル音響（矩形波 ×2、三角波、ノイズ）
- **決定論的生成**: シードベース RNG による再現可能な結果
- **2 系統の配布形式**: npm パッケージ + CDN/`<script>`タグ用 UMD バンドル

## 📦 インストール

### npm

```bash
npm install algo-chip
```

**npm で利用する場合の AudioWorklet 配置**

1. `node_modules/algo-chip/packages/core/worklets` を静的ファイル配信ディレクトリ（例: Vite/Next.js/CRA の `public/worklets`）にコピーしてください。バージョンアップ時にずれないよう、ビルドスクリプトへコピー処理を組み込みます。
2. `workletBasePath` をコピー先の公開パスに設定します（例: `workletBasePath: "/worklets/"`）。`AlgoChipSynthesizer` のデフォルトは `./worklets/` ですが、ファイルが存在しないと `audioWorklet.addModule` が実行時に失敗します。

### CDN (UMD)

```html
<script src="https://abagames.github.io/algo-chip/lib/algo-chip.umd.js"></script>
<script>
  const { generateComposition, SEGenerator, AlgoChipSynthesizer } =
    window.AlgoChip;
</script>
```

**重要**: UMD 経由で Web Audio 再生（`AlgoChipSynthesizer`）を使用する場合、AudioWorklet プロセッサーの読み込み元を指定する必要があります。

**オプション 1: GitHub Pages CDN を使用（推奨）**

```html
<script>
  const audioContext = new AudioContext();
  const synth = new AlgoChip.AlgoChipSynthesizer(audioContext, {
    workletBasePath: 'https://abagames.github.io/algo-chip/worklets/'
  });
  await synth.init();
</script>
```

**オプション 2: worklets を自分でホスト**

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

### 基本的な BGM 生成

```typescript
import { generateComposition } from "algo-chip";

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
import { SEGenerator } from "algo-chip";

const generator = new SEGenerator();
const se = generator.generateSE({
  type: "jump",
  seed: 42,
  quantizeToChord: "C",
  variantIntent: "bright",
  velocityScale: 0.8,
});

// se.events - SEイベントタイムライン
// se.meta - SEメタデータ
```

#### 利用可能な SE type

`SEGenerator` は以下の `type` 文字列を標準サポートしています（詳細は `se.md` を参照）。

| Type        | 説明                           |
| ----------- | ------------------------------ |
| `jump`      | 軽い上昇系のジャンプ音         |
| `coin`      | コイン/アイテム取得音          |
| `explosion` | ノイズ主体の爆発音             |
| `hit`       | ダメージ/ヒットアクセント      |
| `powerup`   | パワーアップ風ファンファーレ   |
| `select`    | UI/メニュー選択のブリップ音    |
| `laser`     | レトロなショット/レーザー      |
| `click`     | ミニマルなクリック音           |
| `synth`     | ワンショットのシンセアクセント |
| `tone`      | 持続する矩形波/三角波トーン    |

各タイプはテンプレートファミリーと紐づいており、決定的なパラメーター範囲で生成されます。

### Web Audio 再生

core パッケージには音量制御付き Web Audio 再生用の`AlgoChipSynthesizer`が含まれています：

```typescript
import {
  generateComposition,
  SEGenerator,
  AlgoChipSynthesizer,
} from "algo-chip";

// シンセサイザーを初期化
const audioContext = new AudioContext();
const synth = new AlgoChipSynthesizer(audioContext);
// オプション: カスタムworkletパスを指定
// const synth = new AlgoChipSynthesizer(audioContext, { workletBasePath: './custom-path/' });
await synth.init();

// 音量制御付きでBGMを再生（ループは非同期解決しません）
const bgm = await generateComposition({ seed: 123 });
synth.playLoop(bgm.events, {
  volume: 0.8, // 80%音量（デフォルト: 1.0）
});

// 音量制御付きでSEを再生
const seGenerator = new SEGenerator();
const jump = seGenerator.generateSE({ type: "jump" });
await synth.play(jump.events, {
  volume: 0.5, // 50%音量（デフォルト: 1.0）
});
```

**volume オプション**:

- デフォルト: `1.0`（ベースゲイン = 0.7）
- 範囲: `0.0+`（例: `0.5` = 50%、`1.5` = 150%）
- 生成時ではなく再生時に適用

**注意**: `AlgoChipSynthesizer`はブラウザ環境（Web Audio API）が必要です。ループ再生は `playLoop()` を呼び出して `await` しないようにし、単発再生や SE には `await play()` を使用してください。BGM ダッキングやクオンタイゼーションを含む高度な SE 再生パターンは、[USAGE_ja.md](https://github.com/abagames/algo-chip/blob/master/USAGE_ja.md)および demo パッケージ（`packages/demo/src/playback.ts`）を参照してください。

### セッションヘルパー（util エクスポート）

ループ BGM 管理や SE ダッキング／クオンタイゼーション、タブの可視状態連動が必要な場合は `algo-chip` から util ヘルパーをインポートできます。
必要に応じて `algo-chip/util` サブパスを指定しても構いません。

**ESM / npm**

```typescript
import { createAudioSession, createVisibilityController } from "algo-chip";

const session = createAudioSession({
  workletBasePath: "./worklets/",
});

await session.resumeAudioContext();
const bgm = await session.generateBgm({ seed: 9001 });
await session.playBgm(bgm, { loop: true });

const detachVisibility = createVisibilityController(session);
// クリーンアップ時: detachVisibility(); await session.close();
```

**CDN / UMD**

コアエンジンと util ヘルパーの両方を GitHub Pages ホスティングの UMD バンドルとして提供しています:

```html
<script src="https://abagames.github.io/algo-chip/lib/algo-chip.umd.js"></script>
<script src="https://abagames.github.io/algo-chip/lib/algo-chip-util.umd.js"></script>
<script>
  const { createAudioSession } = window.AlgoChipUtil;
  const session = createAudioSession({
    workletBasePath: "https://abagames.github.io/algo-chip/worklets/",
  });
  await session.resumeAudioContext();
  const bgm = await session.generateBgm({ seed: 12 });
  await session.playBgm(bgm, { loop: true });
</script>
```

より詳しい API 解説（SE ダッキング、クオンタイゼーション、デフォルト上書き、タイムライン検査など）は [USAGE.md](https://github.com/abagames/algo-chip/blob/master/USAGE.md) を参照してください。

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
│   ├── core/              # コアワークスペース（npm "algo-chip" が再エクスポート）
│   │   ├── src/           # TypeScriptソース（5フェーズパイプライン）
│   │   ├── motifs/        # モチーフJSONライブラリ（コード、メロディ、リズムなど）
│   │   └── dist/          # ビルド出力
│   │       ├── index.js           # ESMバンドル
│   │       ├── index.d.ts         # TypeScript型定義
│   │       └── algo-chip.umd.js   # UMDバンドル
│   ├── util/              # util ワークスペース（AudioSessionヘルパーはルートから利用）
│   │   ├── src/           # セッション制御、ダッキング、クオンタイゼーション
│   │   └── dist/
│   │       ├── index.js           # ESMバンドル
│   │       └── algo-chip-util.umd.js
│   └── demo/              # デモWebアプリケーション
│       ├── src/           # デモUIコード（Web Audio再生）
│       ├── index.html     # メインデモページ
│       └── dist/          # デモビルド出力
└── docs/                  # GitHub Pagesアーティファクト（自動生成）
    ├── index.html         # デモページ（packages/demo/dist/から）
    ├── assets/            # Viteビルド出力（packages/demo/dist/から）
    ├── lib/               # UMDバンドル（packages/*/dist/からコピー）
    │   ├── algo-chip.umd.js
    │   └── algo-chip-util.umd.js
    └── worklets/          # Web Audio Workletプロセッサー（packages/demo/dist/から）
```

## 🎼 パイプラインアーキテクチャ

作曲エンジンは**5 フェーズパイプライン**に従います：

1. **構造設計（Structure Planning）** - BPM、キー、セクション、コード進行
2. **モチーフ選択（Motif Selection）** - リズム、メロディ、ベース、ドラムパターン割り当て
3. **イベント実現（Event Realization）** - 抽象モチーフを具体的なノートイベントに変換
4. **テクニック適用（Techniques）** - エコー、デチューン、アルペジオを適用
5. **タイムライン確定（Timeline Finalization）** - イベントソート、拍 → 時間変換、診断情報生成

## 📖 ドキュメント

- `score_ja.md` ([English](https://github.com/abagames/algo-chip/blob/master/score.md)) - プロダクション仕様（主要リファレンス）
- `se_ja.md` ([English](https://github.com/abagames/algo-chip/blob/master/se.md)) - 効果音生成仕様
- `CLAUDE.md` - 開発ガイドラインとコーディング規約
- `docs/` - GitHub Pages デプロイ先（`npm run build:pages`で同期）

## 🔗 リンク

- [ライブデモ](https://abagames.github.io/algo-chip/)
- [API ドキュメント](https://abagames.github.io/algo-chip/api/)
- [UMD バンドル](https://abagames.github.io/algo-chip/lib/algo-chip.umd.js)
- [Util UMD バンドル](https://abagames.github.io/algo-chip/lib/algo-chip-util.umd.js)
- [algo-chip (npm)](https://www.npmjs.com/package/algo-chip)

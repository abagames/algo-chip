[English](./se.md) | 日本語

## **効果音（SE）自動生成システム**

### **1. 設計思想**

効果音（SE: Sound Effect）は「ジャンプ」「コイン取得」「爆発」といった特定のゲームイベントに対応する短い音響です。本システムは**モチーフベースアーキテクチャ**に従い、以下の特徴を持ちます：

- **テンプレートベース生成**: `packages/core/motifs/se-templates.json` に定義された20種類のテンプレートから、SETypeに基づいて選択
- **シードドリブンRNG**: 同じシード値で同じSEを再生成可能。パラメータのランダム化により自然なバリエーションを実現
- **BGMとの統合**: `Event[]` 型を共有し、BGMパイプラインとシームレスに統合
- **4チャンネルチップチューン音源**: square1/square2/triangle/noiseチャンネルを使用した本格的なチップチューンサウンド

---

### **2. アーキテクチャ**

#### **A. モジュール構成**

```
packages/core/
├── motifs/
│   └── se-templates.json           # SE テンプレート定義（20種類）
└── src/
    ├── se/
    │   ├── seGenerator.ts          # SEGenerator クラス
    │   ├── seTypes.ts              # 型定義（SEType, SETemplate, etc.）
    │   └── seTemplates.ts          # テンプレートローダー
    └── types.ts                    # Event, Channel 型（BGMと共有）
```

#### **B. BGMパイプラインとの関係**

SEジェネレーターはBGMのPhase1-5パイプラインとは**完全に独立**しています：

- **BGM**: `generateComposition(options)` → `PipelineResult`（5フェーズ処理）
- **SE**: `seGenerator.generateSE(options)` → `SEGenerationResult`（単一処理）
- **共通**: 両者とも`Event[]`形式で出力し、同じWeb Audio再生システムで処理

この設計により、BGMとSEを並行して生成・再生でき、任意のタイミングでSEを動的に挿入可能です。

---

### **3. TypeScript 型定義とAPI**

#### **A. 主要な型**

```typescript
/** SE のカテゴリ */
export type SEType =
  | "jump"      // ジャンプ音
  | "coin"      // コイン取得音
  | "explosion" // 爆発音
  | "hit"       // 被ダメージ音
  | "powerup"   // パワーアップ音
  | "select"    // メニュー・項目選択音
  | "laser"     // ショット・レーザー発射音
  | "click"     // クリック音
  | "synth"     // シンセサイザー単音
  | "tone";     // 矩形波/三角波の単音

/** ピッチ範囲の指定 */
export interface PitchRange {
  min: number; // MIDI note number
  max: number;
}

/** SE テンプレート定義 */
export interface SETemplate {
  id: string;                    // "SE_JUMP_01"
  type: SEType;                  // "jump"
  description: string;           // "軽快な上昇ジャンプ音"
  channels: Channel[];           // ["square1"]
  durationRange: [number, number]; // [0.10, 0.15] (秒)

  // チャンネルごとのパラメータ設定
  channelParams: {
    [ch in Channel]?: {
      pitchStart?: PitchRange;
      pitchEnd?: PitchRange;
      dutyCycle?: number[];      // [0.25, 0.5] からランダム選択
      noiseMode?: "short" | "long"; // noise チャンネル専用
      envelope?: "percussive" | "sustained";
      velocityRange?: [number, number];
      releaseRange?: [number, number];
    };
  };

  // 音符のシーケンス定義（アルペジオ等）
  noteSequence?: {
    intervals: number[];         // [0, 4, 7] = root, major3rd, perfect5th
    noteDurations: number[];     // [0.05, 0.05] (秒)
  };

  // ピッチスイープ設定
  pitchSweep?: {
    enabled: boolean;
    curveType?: "linear" | "exponential";
    curveOptions?: Array<"linear" | "exponential">;
    durationRange?: [number, number];
  };
}

/** SE 生成オプション */
export interface SEGenerationOptions {
  type: SEType;
  seed?: number;                 // 未指定時はランダム
  templateId?: string;           // 特定のテンプレートを強制選択
  startTime?: number;            // イベント時刻のオフセット（デフォルト: 0.0）
}

/** SE 生成結果 */
export interface SEGenerationResult {
  events: Event[];               // 既存の Event 型と互換
  meta: {
    type: SEType;
    templateId: string;
    seed: number;
    duration: number;            // 実際の SE の長さ（秒）
    channels: Channel[];         // 使用したチャンネル
    replayOptions: SEGenerationOptions; // 同じ SE を再生成するためのオプション
  };
}
```

---

### **4. SE テンプレートの JSON 定義**

`packages/core/motifs/se-templates.json` のサンプル：

```json
{
  "templates": [
    {
      "id": "SE_JUMP_01",
      "type": "jump",
      "description": "軽快な上昇ジャンプ音（矩形波スイープ）",
      "channels": ["square1"],
      "durationRange": [0.12, 0.25],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 50, "max": 62 },
          "pitchEnd": { "min": 72, "max": 84 },
          "dutyCycle": [0.25, 0.5]
        }
      },
      "pitchSweep": {
        "enabled": true,
        "curveType": "exponential"
      }
    },
    {
      "id": "SE_COIN_01",
      "type": "coin",
      "description": "キラキラ感のあるコイン取得音（2音アルペジオ）",
      "channels": ["square1"],
      "durationRange": [0.18, 0.24],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 72, "max": 84 },
          "dutyCycle": [0.5]
        }
      },
      "noteSequence": {
        "intervals": [0, 4],
        "noteDurations": [0.04, 0.16]
      }
    },
    {
      "id": "SE_EXPLOSION_01",
      "type": "explosion",
      "description": "衝撃的な爆発音（ノイズ + 三角波ベーススイープ）",
      "channels": ["noise", "triangle"],
      "durationRange": [0.80, 1.20],
      "channelParams": {
        "noise": {
          "noiseMode": "long",
          "envelope": "percussive"
        },
        "triangle": {
          "pitchStart": { "min": 36, "max": 43 },
          "pitchEnd": { "min": 24, "max": 31 }
        }
      },
      "pitchSweep": {
        "enabled": true,
        "curveType": "linear"
      }
    },
    {
      "id": "SE_HIT_01",
      "type": "hit",
      "description": "被ダメージ音（短い下降アルペジオ）",
      "channels": ["square1"],
      "durationRange": [0.08, 0.12],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 60, "max": 72 },
          "dutyCycle": [0.125],
          "envelope": "percussive"
        }
      },
      "noteSequence": {
        "intervals": [0, -2, -5],
        "noteDurations": [0.03, 0.03, 0.03]
      }
    },
    {
      "id": "SE_POWERUP_01",
      "type": "powerup",
      "description": "パワーアップ音（4音上昇アルペジオ）",
      "channels": ["square1"],
      "durationRange": [0.50, 0.70],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 60, "max": 67 },
          "dutyCycle": [0.5]
        }
      },
      "noteSequence": {
        "intervals": [0, 4, 7, 12],
        "noteDurations": [0.12, 0.12, 0.12, 0.20]
      }
    },
    {
      "id": "SE_LASER_01",
      "type": "laser",
      "description": "レーザー発射音（高速下降スイープ）",
      "channels": ["square1"],
      "durationRange": [0.10, 0.15],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 72, "max": 84 },
          "pitchEnd": { "min": 48, "max": 60 },
          "dutyCycle": [0.125, 0.25]
        }
      },
      "pitchSweep": {
        "enabled": true,
        "curveType": "exponential"
      }
    },
    {
      "id": "SE_SELECT_01",
      "type": "select",
      "description": "メニュー選択音（短い単音）",
      "channels": ["square1"],
      "durationRange": [0.05, 0.08],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 72, "max": 84 },
          "dutyCycle": [0.25]
        }
      }
    },
    {
      "id": "SE_CLICK_01",
      "type": "click",
      "description": "クリック音（極短・高音）",
      "channels": ["square1"],
      "durationRange": [0.02, 0.03],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 84, "max": 96 },
          "dutyCycle": [0.125],
          "envelope": "percussive"
        }
      }
    },
    {
      "id": "SE_SYNTH_01",
      "type": "synth",
      "description": "シンセ単音（矩形波）",
      "channels": ["square1"],
      "durationRange": [0.15, 0.30],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 48, "max": 72 },
          "dutyCycle": [0.125, 0.25, 0.5]
        }
      }
    },
    {
      "id": "SE_TONE_01",
      "type": "tone",
      "description": "基本トーン（矩形波・中音域）",
      "channels": ["square1"],
      "durationRange": [0.10, 0.20],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 60, "max": 72 },
          "dutyCycle": [0.5]
        }
      }
    }
  ]
}
```

**設計ノート**:
- `intervals` は半音単位の相対ピッチ（0 = 基準音）
- `pitchStart.min/max` は MIDI ノート番号（60 = C4）
- `durationRange` はシードドリブン RNG でサンプリング
- 各テンプレートに `id` を付与し、将来的な統計解析や検証に利用
- **実装状況**: 全10タイプ、計20テンプレート実装済み（各タイプ2個ずつ）

#### **D. 使用例**

```typescript
import { SEGenerator } from "algo-chip";

const generator = new SEGenerator();

// 基本的な使用法
const jumpSE = generator.generateSE({ type: "jump" });
console.log(jumpSE.events);  // Event[] を取得
console.log(jumpSE.meta.duration);  // 実際の長さ（秒）

// シード指定で再現性を確保
const coinSE1 = generator.generateSE({ type: "coin", seed: 12345 });
const coinSE2 = generator.generateSE({ type: "coin", seed: 12345 });
// coinSE1.events === coinSE2.events（完全に同一）

// 特定のテンプレートを強制選択
const explosionSE = generator.generateSE({
  type: "explosion",
  templateId: "SE_EXPLOSION_02",
  startTime: 2.5  // 2.5秒後から開始
});

// BGMと組み合わせて使用
import { generateComposition } from "algo-chip";

const bgm = await generateComposition({ seed: 999 });
const jump = generator.generateSE({ type: "jump", startTime: 3.0 });

// 両方のイベントをマージして再生
const allEvents = [...bgm.events, ...jump.events].sort((a, b) => a.time - b.time);
```

---

### **5. SEタイプ別の特性**

本システムは10種類のSEタイプをサポートし、各タイプに2つのテンプレートバリエーションが用意されています：

| SEType | 説明 | チャンネル | 主な特徴 |
|--------|------|----------|----------|
| **jump** | ジャンプ音 | square1/square2 | 上昇ピッチスイープ（0.12～0.30秒） |
| **coin** | コイン取得音 | square1 | 2～3音の上昇アルペジオ（0.18～0.24秒） |
| **explosion** | 爆発音 | noise + triangle | ノイズ + 下降ベーススイープ（0.80～1.20秒） |
| **hit** | 被ダメージ音 | square1 | 短い下降アルペジオ（0.08～0.12秒） |
| **powerup** | パワーアップ音 | square1 | 4音上昇アルペジオ（0.50～0.70秒） |
| **laser** | レーザー発射音 | square1/square2 | 高速下降スイープ（0.10～0.20秒） |
| **select** | メニュー選択音 | square1 | 短い単音（0.05～0.10秒） |
| **click** | クリック音 | square1 | 極短・高音（0.02～0.04秒） |
| **synth** | シンセ単音 | square1/square2/triangle | 持続音（0.15～0.40秒） |
| **tone** | 基本トーン | square1/triangle | シンプルな単音（0.10～0.30秒） |

---

### **6. 主要な生成パラメータ**

SEジェネレーターは以下のパラメータをテンプレートから動的にサンプリングします：

- **ピッチスイープ**: 開始ピッチ～終了ピッチをlinear/exponentialカーブで補間
- **デューティサイクル**: square1/square2の波形形状（12.5%, 25%, 50%）
- **ノートシーケンス**: アルペジオパターンの音程間隔と音符長
- **ノイズモード**: short（高周波）/long（低周波）の選択
- **デュレーション**: テンプレート定義の範囲内でランダムサンプリング
- **ベロシティ**: 音量の範囲指定

すべてのパラメータは`seed`に基づく決定論的RNGで選択されるため、完全な再現性が保証されます。

---

### **7. Web Audio統合**

BGMとSEは同じ`Event[]`形式を共有しているため、同じWeb Audioシンセサイザーで再生可能です：

**共有コンポーネント**:
- `ChipSynthesizer`: イベントスケジューラー
- チャンネルクラス（`SquareChannel`, `TriangleChannel`, `NoiseChannel`）
- Audio Worklet プロセッサー

**統合パターン**:
1. **独立再生**: BGMとSE用に別々のシンセサイザーインスタンスを使用（実装がシンプル）
2. **チャンネル共有**: 単一のシンセサイザーでチャンネルを動的に管理（4チャンネル構成準拠）

現在の`packages/demo`では独立再生方式を採用し、BGMとSEを並行して再生できます。

---

### **8. まとめ**

本SE自動生成システムは以下の特徴を持ちます：

**設計の特徴**:
- モチーフベース・テンプレート方式による高品質なSE生成
- シードドリブンRNGによる完全な再現性
- BGMパイプラインと同じ`Event[]`形式での出力

**実装の特徴**:
- 10種類のSEタイプ、計20テンプレート
- ピッチスイープ、アルペジオ、ノイズ合成など多彩な音響技法
- TypeScript型システムによる型安全性

**統合の特徴**:
- BGMとSEを並行生成・再生可能
- Web Audioとシームレスに統合
- ゲームエンジンへの組み込みが容易

本システムにより、レトロゲーム風の本格的なチップチューンSEを、再現性とバリエーションを両立しながら自動生成できます。

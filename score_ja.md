[English](./score.md) | 日本語

### **ドキュメント: 高度自動作曲エンジン - モチーフベース楽譜生成ロジック**

#### **1. 目的と前提**

本ドキュメントは、高品質な BGM を自動生成するためのコアロジックを定義する。
本アルゴリズムは、以下の 2 つの要素を前提とする。

1.  **モチーフライブラリ (`motifLibrary`)**: 事前に LLM 等で生成され、人間によって品質管理とメタデータ付与が行われた、コード進行・リズム・メロディのモチーフ群。
2.  **ターゲット音源**: クラシック4チャンネル構成（2 つの矩形波、1 つの三角波、1 つのノイズチャンネル）の音響特性と制約を再現した Web Audio 音源。

最終的な出力は、ターゲット音源を完全に制御可能な、時系列の**`eventList`**（再生イベントの配列）である。

#### **2. 入力と出力**

- **入力**: `CompositionOptions` オブジェクト
  ```typescript
  // 2軸スタイルシステム - 音楽的特性を2次元空間で表現
  interface TwoAxisStyle {
    percussiveMelodic: number;  // -1.0（打楽器的） ～ +1.0（旋律的）
    calmEnergetic: number;      // -1.0（穏やか） ～ +1.0（激しい）
  }

  // スタイル意図 - 楽曲の質感と構造を制御（0.0=オフ、1.0=最大）
  interface StyleIntent {
    textureFocus: number;        // テクスチャ重視
    loopCentric: number;         // ループ適性重視
    gradualBuild: number;        // 段階的盛り上がり
    harmonicStatic: number;      // 和声の安定性
    percussiveLayering: number;  // パーカッシブレイヤー
    breakInsertion: number;      // ブレイク挿入
    filterMotion: number;        // フィルター変調
    syncopationBias: number;     // シンコペーション傾向
    atmosPad: number;            // アトモスフェリックパッド
    lofiFeel: number;            // ローファイ美学（calm+melodic象限）
  }

  // スタイルプリセット - ジャンル固有の意図バンドル（明示的に指定する必要あり）
  type StylePreset =
    | "minimalTechno"
    | "progressiveHouse"
    | "retroLoopwave"
    | "breakbeatJungle"
    | "lofiChillhop";

  // スタイルプロファイル上書き
  type StyleOverrides = Partial<{
    tempo: "slow" | "medium" | "fast";
    intent: Partial<StyleIntent>;
    randomizeUnsetIntent: boolean;
  }>;

  // 作曲オプション（メインAPI）
  interface CompositionOptions {
    lengthInMeasures?: number;    // 小節数（デフォルト: 32）
    seed?: number;                 // 乱数シード（未指定時は自動生成）
    twoAxisStyle?: TwoAxisStyle;   // 2軸スタイル（デフォルト: {0, 0}）
    preset?: StylePreset;          // ジャンルプリセット（明示的に設定必須; 軸座標から自動推定しない）
    mode?: "major" | "minor";      // 調性モード上書き（未設定時は軸から導出）
    sectionRepeatBias?: number;   // フック再現の再使用度 0.0=最大変化、1.0=完全再現（デフォルト: 0.15）
    overrides?: StyleOverrides;    // スタイルプロファイル上書き
  }
  ```
- **出力**: `PipelineResult`
  ```typescript
  // イベント - Web Audio再生用の時系列コマンド
  interface Event {
    time: number;                                    // 秒単位の絶対時刻
    channel: "square1" | "square2" | "triangle" | "noise";
    command: "noteOn" | "noteOff" | "setParam";
    data: any;                                       // コマンド固有データ
  }

  // ボイス配置 - 音楽的役割とチャンネルのマッピング
  interface VoiceArrangement {
    id: string;                                      // プリセット識別子
    voices: Array<{
      role: "melody" | "melodyAlt" | "bass" | "bassAlt" | "accompaniment" | "pad";
      channel: "square1" | "square2" | "triangle";
      priority: number;                              // 生成確率（0.0～1.0）
      octaveOffset?: number;                         // オクターブ移動（-1/0/+1）
      seedOffset?: number;                           // パターン変化用シードオフセット
    }>;
    description: string;
  }

  // パイプライン実行結果
  interface PipelineResult {
    events: Event[];                                 // 再生イベントリスト
    diagnostics: {
      voiceAllocation: Array<{ time: number; channel: string; activeCount: number }>;
      loopWindow: { head: Event[]; tail: Event[] };
    };
    meta: {
      bpm: number;
      key: string;
      seed: number;
      mood: "upbeat" | "sad" | "tense" | "peaceful";
      tempo: "slow" | "medium" | "fast";
      lengthInMeasures: number;
      styleIntent: StyleIntent;
      voiceArrangement: VoiceArrangement;
      profile: ResolvedStyleProfile;               // 解決済みスタイルプロファイル
      replayOptions: CompositionOptions;           // 再生成用オプション
      loopInfo: {
        loopStartBeat: number;
        loopEndBeat: number;
        loopStartTime: number;
        loopEndTime: number;
        totalBeats: number;
        totalDuration: number;
      };
    };
  }
  ```

#### **3. コア・アルゴリズム: 5 段階パイプライン処理**

楽譜生成は、以下の 5 つの独立したフェーズをパイプラインのように順次実行することで行われる。

##### **フェーズ 1: 設計図の構築 (Structure Planning)**

**目的**: 楽曲全体の構造と音楽的コンテキストを決定する。

**入力処理**: 入力された `CompositionOptions` は `resolveGenerationContext()` によって、二軸スタイル (`twoAxisStyle`) を基にムード、テンポ、`StyleIntent` を導出する。`twoAxisStyle` が未指定の場合は `{ percussiveMelodic: 0, calmEnergetic: 0 }` が適用される。
**主要処理**:

1. **2軸スタイルの解釈**:
   - `percussiveMelodic`軸: -1.0（打楽器的）～ +1.0（旋律的）
   - `calmEnergetic`軸: -1.0（穏やか）～ +1.0（激しい）
   - `deriveModeFromAxis()` により調性モード（`major`/`minor`）を導出:
     - calm+melodic象限（`calmEnergetic ≤ -0.3` かつ `percussiveMelodic ≥ 0.2`） → minor
     - 強くパーカッシブ（`percussiveMelodic ≤ -0.4`）→ エネルギー軸に関わらず minor
     - それ以外 → major
   - `CompositionOptions.mode` が指定されている場合はそれで上書き
   - テンプレート選択・テクニック戦略用にレガシームード文字列（upbeat/sad/tense/peaceful）を推定
   - `calmEnergetic` からテンポ（slow/medium/fast）を導出
   - 10個の `StyleIntent` フラグを軸座標から設定; `lofiFeel` は `calmStrength > 0.5 && melodicStrength > 0.3` で有効化

2. **楽曲パラメータ決定**:
   - テンポ基準値: `slow=90BPM`, `medium=120BPM`, `fast=150BPM`
   - 2軸座標とシードに基づき±15BPMの範囲で微調整
   - 導出モードに基づくキー選択 — モード別候補プール:
     - major: G Major, C Major, D Major, F Major
     - minor: E Minor, A Minor, D Minor, B Minor, C Minor
   - `(seed + salt) % pool.length` により候補から最終キーを決定

3. **軸ベースのコードタグ選択**:
   - 各コードタグには `TAG_AXIS_POSITION` によって (melodic, calm) 2次元空間上の正規位置が割り当てられている
   - `selectChordTagsFromAxis()` が現在の軸から各タグ位置までのユークリッド距離を計算し、選択中のキーのコードデータに存在する最も近い2タグを選択する
   - フォールバック: 軸情報がない場合（レガシーパス）は `MOOD_TAG_MAP` でムード文字列をタグ候補にマッピング

4. **楽曲構成選択**:
   - 小節数（16/32/64など）に最適化されたセクションテンプレートを選択
   - 例: 32小節のupbeat → A(8) - B(8) - C(8) - D(8)
   - ループ整合性を考慮した構成（`loop_safe`タグ付きモチーフを終端に配置）

5. **コード進行選択**:
   - 各セクションに対しムードタグとキーに合致するコード進行を選択
   - `cadence`（終止）や`loop_safe`用途タグで終端整合性を確保

6. **Voice Arrangement選択**:
   - シードとスタイルに基づきボイス配置プリセットを選択
   - メロディ・ベース・伴奏の物理チャンネル割り当てを決定
   - オクターブオフセットとパターンバリエーション設定

7. **テクニック戦略定義**:
   - `StyleIntent`フラグに基づきテクニック適用確率を設定
   - デューティサイクルスイープ、アルペジオ、デチューンなどの使用率を決定

##### **フェーズ 2: 抽象トラックの生成 (Abstract Track Generation)**

- **目的**: チャンネル割り当てや奏法を意識せず、純粋な音楽情報として「メロディ」「ベース」「リズム」の 3 トラックを生成する。
- **処理**:
  1.  **メロディトラック生成**:
      a. フレーズ単位（1〜2小節）でメロディ音価モチーフ (`melody-rhythm.json`) を選択する。`start` / `middle` / `end` などの機能タグとムード別タグ（`drive`, `legato`, `rest_heavy`, `staccato` など）を考慮し、`loop_safe` / `cadence` タグで終端整合性を確保する。音価モチーフは休符情報を含み、フレーズ全体で正確に 4 or 8 拍となるよう検証する。
      b. 小節ごとのリズムモチーフ (`rhythm.json`) は引き続き伴奏・アクセント用途で選択し、テンプレート／セクション単位でキャッシュする。メロディ音価モチーフとは独立に選びつつ、A セクション初出のフレーズはフックとして保存し、再登場時に再利用する。デフォルト（`sectionRepeatBias` ≥ 0.25）ではリズム・メロディ・音価モチーフの完全同一を再利用する。`sectionRepeatBias` < 0.25 の場合はバリエーションフックが選択され、リズムと音価モチーフは保持しつつ音程度数モチーフ（`melody.json`）のみ近い別案に差し替えられ、同質ながら完全同一ではない再現になる。
      c. 音価モチーフを展開した結果のノートスケジュールに対し、スケール度数モチーフ (`melody.json`) を逐次マッピングする。休符ステップでは度数を進めず、ノート生成時のみ進行させることで息継ぎ・間を作る。
      d. レトロゲームBGMのモチーフ設計指針:
         - 16分主体＋間: フレーズ内に必ず休符（または 2 拍以上のロングトーン）を含め、機械的連打を避ける。
         - シンコペーション: 裏拍からの食い込みや 2 拍跨ぎのタイを `syncopated` タグで管理し、ムードが `tense` / `upbeat` の場合は優先度を上げる。
         - 反復と変形: 2 拍モチーフ `[A][A][A][A']` を音価レベルでも再現し、B セクションでは `[A' B][A'' B']` のような変奏を付けてコール＆レスポンス構造を維持する。
         - タグ駆動キャッシュ: セクションテンプレート／小節機能の組み合わせで選んだモチーフ ID をテンプレートキャッシュに保存する。`sectionRepeatBias` ≥ 0.25（デフォルト）の場合、A1 と A2 は完全同一の聴感になる。`sectionRepeatBias` < 0.25 の場合、A2 はリズム・音価パターンを保持しつつ音程モチーフを差し替えることがあり、一貫性を保ちつつ同一ではない反復になる。再現状況は `diagnostics.sectionMotifPlan` の `hookReuse` フィールド（`"exact"` / `"varied"` / `"none"`）で確認できる。
  2.  **ベーストラック生成**:
      a. コード進行のルートを基準に 8 分音符で刻みつつ、`loop_safe` 区間ではルート保持、`cadence` 区間では 5度からルートへの解決を優先する。
      b. 小節単位でフィル用モチーフタグ（例: `bridge`, `build`）があれば確率的に追加し、終端では不要な低音余韻が残らないよう調整する。
  3.  **リズムトラック生成**:
      a. 小節位置とムードに基づき、`beat` / `fill` ドラムモチーフをタグ優先で選ぶ。終端は `loop_safe`、盛り上げ区間は `build` / `break` を参照する。
      b. 4/8 小節ごとにフィルを挿入しつつ、同じフィルが連続する場合は `variations` リンクを使って回避する。
      c. `noise` チャンネルは純粋なモノフォニック回路であるため、同じ 16 分ステップ内に複数のヒットを重ねない。必要な場合は三角波や矩形波でレイヤーを受け持たせるか、後述のクランプ処理に従って時間をずらす。
      d. モチーフ選択は `seed` ドリブンの RNG で行い、タグ条件を満たす候補の中から確率的に選択する。直前と同一モチーフが続いた場合は最大 3 回まで再抽選し、意図しない繰り返しを抑止する。
      e. **タグフィルタリングの過剰抑制防止**: `preferTagPresence`によるタグ優先フィルタリングが候補を40%未満に削減する場合、フォールバックして元の候補プールを維持する。これにより、複数のstyleIntentフラグが重複適用された際の候補枯渇と極端なモチーフ繰り返しを防止する。
  4.  **ハーモニー整合処理**:
      生成されたメロディ・伴奏・ベースをスケール度数から MIDI へ変換する際、**強拍**（4拍小節内の拍1・拍3、すなわち `beat % 2 === 0` となる拍位置）ではコードトーンへ量子化し、弱拍ではコード内で最も滑らかに接続する音を選択する。伴奏については同時発音するメロディ音に対して協和度を評価し、必要ならオクターブ移動を行う。伴奏のベースレジスタはメロディベースの完全4度下に設定し、ボイスクロッシングを防止する。

##### **フェーズ 3: チャンネル・マッピングと奏法の実装 (Channel Mapping & Technique Implementation)**

- **目的**: 抽象トラックを、4チャンネルチップチューン音源の物理チャンネルに割り当て、同時に特有の奏法を適用して楽譜を具体化する。
- **処理**:
1.  **Voice Arrangement システム**:
      - **概要**: `seed`に基づき、メロディ・ベース・伴奏の各音楽的役割（VoiceRole）を物理チャンネル（square1/square2/triangle）に動的に割り当てる。これにより同一のスタイル設定から多様なサウンドバリエーションを生成可能。
      - **VoiceRole**: `melody`, `melodyAlt`, `bass`, `bassAlt`, `accompaniment`, `pad` の6種類。各roleは独立した音楽機能を持つ。
      - **VoiceArrangement プリセット**:
        - `standard`: melody(sq1) + acc(sq2) + bass(tri) - 標準配置
        - `swapped`: melody(sq2) + acc(sq1) + bass(tri) - square入れ替え
        - `dualBass`: melody(sq1) + bass(sq2) + bassAlt(tri, octave -1) - 重厚な低音
        - `bassLed`: bass(sq1) + bassAlt(sq2, octave +1) + melody(tri, sparse) - ベース主導
        - `layeredBass`: bass(sq1) + bassAlt(tri, octave +1, variation seed) + melody(sq2) - 補完レイヤー
        - `minimal`: bass(sq1) + pad(tri, sparse) - メロディなしミニマル
        - `breakLayered`: ブレイクビート志向のデュアルベース強調・シンコペーションメロディ対応
        - `lofiPadLead`: パッド前景のローファイ配置・スパースメロディ。ドラム入りを2小節遅らせる
        - `retroPulse`: レトロアルペジオ重視・三角波ベース基盤
      - **Voice 属性**:
        - `priority`: 0.0-1.0の生成確率。1.0=常に生成、0.7=70%の小節で生成（スパースな表現用）
        - `octaveOffset`: -1/0/+1のオクターブ移動。bassAlt(octave -1)でサブベース（D1-E2域）生成
        - `seedOffset`: 同role内でパターンを変えるためのseed加算値
      - **選択ロジック**: フェーズ1で`seed`と`stylePreset`に基づき重み付き抽選。`stylePreset`は `CompositionOptions.preset` で明示的に指定する必要があり、軸座標から自動推定されることはない。minimalTechnoはminimal/bassLed優先、progressiveHouseはlayeredBass優先、retroLoopwaveはretroPulse優先、breakbeatJungleはbreakLayered/dualBassを重視、lofiChillhopはlofiPadLead/minimalを優先するなど、ジャンル特性を反映。
      - **velocity調整**: `adjustVelocityForChannel()` がロールとチャンネルに応じたスケーリングを実施。ベース系ロールは70%に抑え、さらにMIDI 52未満では0.85を乗算して超低域を制御。`triangle`は基準値の85%に減衰（非ベース時はフルストレングス）、ベースを担当する`square`は0.66倍、メロディは0.4倍を掛けてミックスを支配しないよう調整する。
      - **後方互換性**: `standard`/`swapped` arrangementではフェーズ2の従来ロジック（`selectMotifsLegacy`）を呼び出し、既存の楽曲生成動作を保証。
2.  **リズムトラックの特殊変換**:
     - **キック (K)**: 長 LFSR モード（`mode: "long"`）＋短めのディケイで `noise` チャンネルに `noteOn` を送出し、低域ランブルを得る。さらにヒット時点で triangle チャンネルが空いている場合は、G2→C2 への 12 ms ピッチスライド（velocity 75）を triangle チャンネルに同時発音し、NES 定番のノイズ＋三角波レイヤーによるキックボディを再現する。
     - **スネア (S)**: 短 LFSR モード（`mode: "short"`）でメタリックなクラックを出す。各小節のバックビート位置（拍 2 または 4 ±0.1 拍）では長 LFSR モード＋`periodIndex: 4`（約 1.75 kHz）に切り替え、重みのあるアクセントスネアとして機能させる。
     - **ハイハット/オープン (H/O)**: ともに短 LFSR モードを使用。オープンハイハット (O) が鳴っている最中にクローズドハイハット (H) が発音される場合、O の `noteOff` を H の開始拍に移動させ `releaseSeconds: 0.003`（3 ms スナップクローズ）を付与し、物理的なシンバルチョークを再現する。
     - **タム (T)**: 短 LFSR モードで低めの period index を使用。スネア同様、ヒット時間の 40 % 時点で `setParam periodIndex` を +3 ステップ下降させ、タム特有のミッドヒット・ピッチ降下を再現する。
     - **ミッドヒット・ピリオドフォール**: S と T ヒットは、ヒット時間の 40 % 地点に `setParam { param: "periodIndex", value: idx + Δ }` を挿入する（S は +2 ステップ、T は +3 ステップ降下）。これにより NES 独特のピッチ降下テクスチャが得られる。
     - **4 ビットエンベロープ量子化**: ノイズエンベロープ出力を 16 段階に量子化（`stepSize = amplitude / 15` として `Math.round(env / stepSize) * stepSize`）し、NES APU ハードウェアのボリュームレジスタ動作に合わせる。
     - **LFSR モードマッピング**: 長周期楽器（K・T）はビット1フィードバック（`mode: "long"`）、短周期楽器（S・H・O）はビット6フィードバック（`mode: "short"`）を使用する。worklet `noteOn` には実際の `"long"` / `"short"` 文字列を渡し、説明ラベル（`"long_period"` 等）はログ用に別途保持する。
     - **単一発音ガード**: `noise` の `noteOn` は常に 1/8 拍以下の長さに量子化し、次のヒットが前の余韻内に到達した場合は直前の `noteOff` を同拍まで切り詰める。スタック不可な楽器が衝突した際は `splice(lastNoteStartIndex)` により前ヒットの全イベント（ミッドヒット `setParam` を含む）を一括削除する。
     - **RNG 制御**: リズム／メロディ／ドラムの候補選択は `seed` 付き RNG に基づき、ムード別タグと機能タグのフィルタリング後にランダム抽選する。抽選結果は診断ログに残し、同一 seed では常に再現できるよう決定論的に動作させる。
3.  **伴奏トラック (`square2`) の動的生成**:
     a. `seed` で初期化した RNG を用い、小節単位で伴奏シードをグルーピングする。連続する小節が極端に鳴ったり沈黙したりしないよう、前回の判定結果を踏まえて `fast_arpeggio` の採否を決める。
     b. アルペジオが選ばれた場合は、現在のコードトーンを 16 分刻みで再構成し、メロディとの協和度を評価してピッチ補正する。選ばれなかった場合は 8 分のブロークンコードを自動生成し、最低限の埋め草を行う。
     c. `detune` は半音コピーではなくセント単位の微分ピッチを付与し、`echo` は四分音符遅延＋減衰を基本とする。各テクニックは同時発音数を監視し、限界を超える場合はスキップする。

4. **ピッチベンド / ポルタメント適用**: 
     - 効果音用途: キックやシンセベースなど特定タグを持つイベントを検出し、三角波に短時間の下降スライド（例: 40→32→24）を付加してインパクトを出す。
     - 音楽的表現: メロディの音符間に低確率で滑らかなポルタメントを挿入し、フェーズ4の装飾と連携して「泣き」や「ビブラート」的ニュアンスを追加する。

##### **フェーズ 4: 音色の装飾と最終調整 (Timbral Decoration)**

- **目的**: 生成された楽譜全体をスキャンし、音色に表情とリアリティを与える最終的な「味付け」を行う。
- **処理**:
  1.  **デューティ比設定**:
      - `square1`のイベント群の先頭に`setParam: {param: 'duty', value: 0.25}`を追加。
      - `square2`のイベント群の先頭に`setParam: {param: 'duty', value: 0.50}`を追加。
  2.  **デューティサイクル・スイープ適用**:
      - 矩形波チャンネルのノートで、持続時間が一定以上のものを検出。
      - そのノートの`noteOn`から`noteOff`の間に、デューティ比を周期的に変更する複数の`setParam`イベントを挿入する。
  3.  **スタイル連動オートメーション**:
      - `filterMotion` が有効な場合は duty スイーププリセットにスタイル専用パターンを追加する。
      - `percussiveLayering` や `atmosPad` などのフラグに応じてノイズ／三角波のゲインプロファイルを補強し、`breakInsertion` が成立する小節ではノイズとスクエアのゲインを一時的に下げてブレイクを演出する。
  4.  **ループ整合とダイナミクス制御**:
      - `gradualBuild` が有効なトラックでは小節単位でゲインランプを挿入し、楽曲全体の盛り上がりを形成する。
      - ループ終端ではチャンネルごとのゲインを段階的に下げ、次ループ頭への自然な接続と残響制御を行う。

##### **フェーズ 5: イベントリストへの最終変換 (Final Conversion to Event List)**

- **目的**: これまでの中間データを、最終的な再生用`eventList`に変換する。
- **処理**:
  1.  全てのノート情報とパラメータ情報を、時間順にソートする。
  2.  各ノートを、`noteOn`イベントと`noteOff`イベントに分解する。
  3.  BPM に基づき、全てのイベントの時間を**小節・拍から秒単位に正確に計算**し、`time`プロパティに設定する。
  4.  全てのイベントを単一の配列にフラット化し、最終的な`eventList`として出力する。
  5.  ループ整合性チェック用に、冒頭・終端 0.1/0.25/0.5 秒窓のイベント数、未解決 note、release tail 数を診断情報へ含め、後段の検証ループで参照できるようにする。

---

このパイプライン処理により、各フェーズは自身の責務に集中できる。高品質な素材を元に、構造的・音楽的な正しさを担保しつつ、クラシックチップチューン音源ならではの制約とそれを逆手に取った創造的なテクニックをアルゴリズミックに再現することで、一貫して高品質かつ多様な BGM の自動生成が実現される。

#### **付録: モチーフ編集ガイド**

モチーフを追加する際は、JSON ライブラリを決定論的で、タグ検索しやすく、4 チャンネルのレトロ再生で破綻しない状態に保つ。既存パターンの表面的な複製ではなく、明確な音楽的役割を拡張するモチーフとして追加する。

- **共通スキーマ規律**: 各ファイルの既存フィールド名、ID 接頭辞、タグ語彙を維持する。広すぎるラベルよりも具体的なタグを 1〜2 個追加する。選択ロジックや診断で使わない新しいタグ系統は増やさない。
- **メロディ音価モチーフ (`melody-rhythm.json`)**: 各 pattern は休符を含め、宣言された `length` と合計拍が完全に一致しなければならない。息継ぎを作るため、休符またはロングトーンを入れる。明示的な texture pattern でない限り、16 分音符だけの連続は避ける。`pickup` は前倒しの開始、`cadence` は解決するフレーズ終端、`loop_safe` は次ループ頭へ無理なく戻れる終端に使う。
- **メロディ度数モチーフ (`melody.json`)**: どのキーでも歌いやすく再利用できる音程にする。基本は順次進行にし、跳躍は意図した 1〜2 箇所へ絞る。近い変形はほぼ同じ項目を複製せず、`variations` で結ぶ。cadence モチーフは安定した度数へ着地させ、緊張感のあるモチーフは終端音価と組み合わせて解決を遅らせる。
- **ベースモチーフ (`bass-patterns.json`)**: 低域が濁らないよう、動きは必要十分に抑える。battle や breakbeat ではオクターブ反復や approach を使ってよいが、`loop_safe` bass は終端で次の root に着地または明確に接近させる。最終ステップに長い release の低音を残さない。
- **ドラムとトランジションモチーフ (`drums.json`, `transitions.json`)**: モノフォニックな `noise` チャンネル制約を守る。ハット、キック、スネア、タム、FX は同じ 16 分ステップで同時 noise 発音を要求しない。配置意図は ID だけでなく、`fill`, `build`, `break`, `loop_out`, プリセット固有タグで表す。
- **テクニックモチーフ (`techniques.json`)**: synthesizer / worklet が対応している param だけを出力する。新しい装飾は `channels`、持続時間しきい値、`styleFlag`、cadence / boundary 用途など狭い発火条件を持たせ、全ノートに過密適用されないようにする。
- **Variation リンク**: 繰り返しセクションで置換可能な近縁案は `variations` で結ぶ。変形はフレーズ長と大まかな機能を保ちつつ、リズム、輪郭、音域、密度のどれか 1 要素を変える。
- **避けるべきパターン**: 使用可能なハードウェアチャンネル数を超える同時発音を前提にしたモチーフ、ループ頭へ重なる長い終端 release、実態と矛盾するタグ、毎拍反復される極端な高音跳躍、重複 ID、音楽的にほぼ同じ重複項目は避ける。
- **必須検証**: モチーフ編集後は `npm test`、`npm run build:core`、`npm run report:seed-sweep -- --seeds=101,202,303 --assert`、`git diff --check` を実行する。`--assert` フラグは自動閾値チェックを有効にし（fallback 率 ≤ 0.40/実行、melody モチーフ種類数 ≥ 2/実行、ユニークなアレンジメント数 ≥ 3/全実行、ループ・ノイズテール問題 = 0）、違反があれば終了コード 1 を返す。閾値は `--max-fallback-rate=`、`--min-melody-kinds=`、`--min-arrangement-variety=` で個別に上書きできる。melody-rhythm 変更時は duration sanity テストが全新規モチーフを対象にしていることを確認する。drums/noise 変更時は `noise-collision` が clean であることを確認する。スタイル固有モチーフを追加した場合は seed sweep の `diagnostics.motifSelection.candidatePools` と `motifUsage` を見て、新タグが過剰 fallback なしで到達可能か確認する。

#### **付録: 生成後検証ループとチェックポイント**

本番仕様では、生成した楽曲を複数のランダムシードで出力し、以下のチェックポイントに基づいて `node` 上での自動解析と最終的な試聴を繰り返す。解析結果はログ・メトリクスとして保存し、リグレッションを防ぐ。全ての検証ランは `CompositionOptions` を明示的に記録し、`PipelineResult.meta` の内容（seed / mood / tempo / length）と突き合わせること。

- **シード多様性**: 同一のムード・テンポ・長さ設定について必ず複数シードを走らせ、フェーズごとの診断値（使用モチーフ ID、テクニック適用率、チャンネル別 noteOn 数、セクション配置）が十分に散らばっているかを統計化する。`seed` は必須入力とし、未指定でランダム補完された場合でも `meta.seed` を検証ログに保存する。
- **オプション多様性**: ムード・テンポ・長さの組み合わせ自体が偏っていないかを監査する。検証バッチではムード/テンポ/Measures をカバレッジ表に沿って巡回させ、`meta.mood`・`meta.tempo`・`meta.lengthInMeasures` のヒストグラムを確認し、どれかに集中していればスクリプト/テンプレートを調整する。
- **モチーフ分布**: リズム・メロディ・ドラムのタグ選択ログを比較し、ムードに応じた候補が実際に切り替わっているか、同じモチーフ列に固定化されていないか確認する。必要に応じて `loop_safe` など追加タグを設計する。
- **メロディ形状と伴奏密度**: `square1` の音域ヒートマップ、跳躍幅、終止位置、`square2` の小節単位の発音数・休符率を集計し、極端な無音や連打が連続していないか見る。結果をもとにモチーフ JSON やフェーズ3のテクニック確率を調整する。
- **ベースラインとドラム**: `triangle` のルート/5度比率、`noise` の beat/fill ID 分布、フィル挿入周期を比較し、単調になっていればモチーフ設計を見直す。
  同時に `noise` のアクティブ発音数が常に 1 以下であることを自動テスト/リンタで確認し、違反するモチーフやフェーズ変換ロジックは差し戻す。
- **ダイナミクス**: velocity の平均・レンジ、セクションごとの強弱パターンを数値化し、山谷ができているか、シード差で変化しているかを監視する。
- **ループ整合性**: 最終小節と冒頭小節を連結した仮想タイムラインを解析し、残響イベントが次ループ頭に重ならないか、各チャンネルのアクティブ数が滑らかに遷移するか確認する。必要なら終端専用モチーフやテール処理を導入する。
- **重複防止**: `eventList` の内容ハッシュや motif ID シグネチャを比較し、既存成果物との重複を検出する。閾値超過時は生成ロジックまたはモチーフを更新する。
- **モチーフ再帰の計測**: セクション単位で選択された代表モチーフ ID を集計し、再登場率（例: メロディ/リズムいずれも全小節の 25% 以上）が基準値を下回った場合はフェーズ2のモチーフキャッシュやバリエーション適用を見直す。
- **フレーズ整合性チェック**: 2〜4 小節フレーズの境界で pickup/cadence タグが欠落または重複していないかを検証し、異常時はフェーズ2のフレーズ組成やセクション連結ロジックを調整する。
- **テクスチャプラン監査**: フェーズ1で定義したセクション別テクスチャ（ブロークンコード、8 分アルペジオ等）が実際の square2/square1 イベント密度に反映されているか、voice_allocation をヒートマップ化して乖離を検知する。
- **ダイナミクスプロファイル比較**: セクションごとの平均 velocity・ピーク差を記録し、想定した山谷（例: A=mf, B=f, Outro=mp）と一致しない場合はフェーズ3のエンベロープ生成を再調整する。
- **トランジション診断**: セクション切り替え直前のドラムフィル/ pickup イベントや phase4 の duty・gain スイープが想定タイムスタンプで発火したかを検証し、欠落時はトランジション設計を差し戻す。
- **メロディ音価検証**: `melody-rhythm` モチーフの長さ合計が小節長と一致しているか、休符／ロングトーンがループ頭と重なっていないかを解析し、逸脱があればモチーフ定義と適用ロジックを修正する。定期的に `npm run check:melody-rhythm` を実行し、長さ検証とモチーフ使用頻度のヒートマップを取得する。

解析フェーズで問題が見つかった場合は、対応するフェーズ（モチーフ選択、ハーモニー補正、テクニック適用ペースなど）を改良し、再度シード走査を行う。最終成果物はブラウザデモで試聴して感覚的な違和感を排除し、同じチェックリストで回帰を確認する。この PDCA ループを開発サイクル全体で徹底する。

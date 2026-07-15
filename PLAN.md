# 実装設計書(オーケストレーター承認済み)— SPEC.md v1.3 準拠

この文書は SPEC.md の曖昧箇所を確定させた設計判断集。SPEC.md と矛盾した場合は SPEC.md が正。
実装エージェントはこの設計に従って書くこと(=「実装計画の承認」はこの文書で完了している。追加の承認待ちは不要)。

## A. アーキテクチャ

- `app.js` は「純粋ロジック層」と「DOM配線層」の2部構成。ロジックはグローバルオブジェクト `TateAlign` に公開し、`tests.js` から直接呼べるようにする:
  - `TateAlign.charWidth(cp)` / `TateAlign.displayWidth(str)`
  - `TateAlign.parseSeparators(fieldText)` → トークン配列(内部表現)
  - `TateAlign.splitLine(line, seps)` → セル配列(行頭インデント保持込み)
  - `TateAlign.detectMode(text)` → 'code' | 'table'
  - `TateAlign.detectLineEnding(clipboardText)` → 'CRLF' | 'LF'
  - `TateAlign.format(text, options)` → 整形済み文字列(改行はLFで返し、出力時に変換)
  - `options = { mode:'auto'|'code'|'table', fill:'space'|'tab', gap:1..4, tabWidth:number, alignEquals:boolean, separators:string(欄の生テキスト), lineEnding:'auto'|'LF'|'CRLF', detectedLineEnding:'LF'|'CRLF' }`
- DOM配線層は `document.getElementById` の存在チェックで tests.html 読み込み時にも安全に動くこと(tests.html は app.js + tests.js を読み込む)。
- `DEFAULT_SEPARATORS = '\\s,\\t'`(欄の見た目そのまま。バックスラッシュ+s)。

## B. 幅テーブル(charWidth)

幅2とするレンジ(ソート済み配列 + 二分探索 or 線形で可):

- Fullwidth/Wide(SPEC記載): U+1100–115F, U+2E80–A4CF, U+AC00–D7A3, U+F900–FAFF, U+FE30–FE4F, U+FF00–FF60, U+FFE0–FFE6, U+1F300–1FAFF
- 追加のWide: U+3000–303E は U+2E80–A4CF に含まれるので不要。U+1F000–1F2FF(麻雀牌・囲み文字)は v1 では対象外でよい
- Ambiguous を幅2として追加(日本語フォント前提。主要レンジのみで可):
  - U+00A7, U+00A8, U+00B0, U+00B1, U+00B4, U+00B6, U+00D7, U+00F7(§ ¨ ° ± ´ ¶ × ÷)
  - U+2010, U+2014–2016, U+2018–2019, U+201C–201D, U+2020–2021, U+2025–2026, U+2030, U+2032–2033, U+203B(※), U+2103(℃), U+2113, U+2121
  - U+2160–216B, U+2170–2179(ローマ数字)
  - U+2190–2199(矢印), U+21D2, U+21D4
  - U+2200–22FF の主要記号は個別でなくレンジごと幅2でよい(∀∂∇∈≒≠≡≦≧√∞∫ など)
  - U+2460–24FF(①〜⑳・囲み英数), U+25A0–25FF(■□▲△▼▽◆◇○◎●), U+2605–2606(★☆), U+2640, U+2642, U+266A, U+266D, U+266F
  - 完全な Unicode EAW 表の再現は不要。上記+テストが通る範囲で簡潔に
- それ以外は幅1。`displayWidth` は `for...of` でコードポイント走査(サロゲートペア対応)

## C. 引用符の簡易走査

- 対象引用符: `'` `"` `` ` `` の3種。行内を左から走査し、引用符外で出会った引用符で「その文字で閉じるまで」引用中とする(ネスト・エスケープは考慮しない=簡易走査)
- 引用符が閉じないまま行末に達したら、行の残りは引用中扱い
- 引用中は:コメント記号(`//` `#`)判定、区切りトークン判定、=揃えの `=` 判定、すべてスキップ

## D. 区切り欄のパース(parseSeparators)

- 欄テキストを「エスケープ考慮でカンマ分割」:`\,` は分割せずリテラルカンマトークンに。空トークンは無視。前後の空白はトリム(ただし全角スペース1文字のトークンは残す)
- トークン種別: `{type:'spaces'}`(`\s`)/ `{type:'tab'}`(`\t`)/ `{type:'literal', text:'...'}`
- 欄が空(全削除)の場合:区切りなし=分割しない(1列扱い)

## E. 行分割(splitLine)— 表モード

1. 行頭の空白・タブ列(インデント)を先に取り出す。インデントは第1セルの先頭に付けたまま保持し、幅計算にも含める(行頭空白では分割しない)
2. `\t` が区切りに**ない**場合のみ、行内のタブをタブ幅で空白展開してから処理(幅を正しくするため)。`\t` が区切りにある場合は展開しない
3. 残りを左から走査(引用符状態を追跡):各位置で literal トークン(**長いもの優先**でマッチ)→ `\t` → `\s`(半角スペース連続)の順に照合
   - literal: トークンは**左セルの末尾に残して**そこで分割
   - `\t` / `\s`: 区切り文字自体は除去して分割
4. 分割後、各セルの**先頭**の半角スペース・タブをトリム(第1セルのインデントは除く)
5. 行末の区切りで生じた末尾の空セルは削除

## F. 各モードの適用順序

- コードモード: タブ展開 → (=揃え ON なら =揃え) → コメント揃え。=揃えの `=` はコード部(コメント除去後)内で判定
- =揃えの左辺は `rstrip` してから幅計算。max はコードモード対象行のうち「代入=を持つ行」だけで取る
- 表モード: splitLine → 列ごと max → 最終列以外を埋め方式で連結。ギャップ既定はコード1・表2(モード自動切替時、ユーザーが手動変更していなければ既定値に追従。一度手動変更したらその値を維持)
- 全モード共通: 出力各行の行末空白(スペース・タブ)除去。空行はそのまま(区切り処理対象外)
- 自動判定: 非空行のうち、引用符外の `//` または `#` を持つ行が過半なら code、それ以外 table

## G. タブ方式(§6.2)の実装確認値

- T = 列max より**大きい**最小のタブ幅倍数(max が倍数ちょうどでも次へ)
- セル後のタブ本数 = `ceil((T − displayWidth(セル)) / tabWidth)`
- 例F 検算済み: 幅 10/15/11, tabWidth=4, max=15, T=16 → タブ 2/1/2 本

## H. 改行コード

- `paste` イベントの `clipboardData.getData('text')` で `\r\n` と 裸の `\n` を数え多数決 → 状態に保持し UI 表示
- 出力: auto=検出値(未検出は LF)/ LF / CRLF。コピー時・表示時に変換

## I. UI 実装メモ

- レイアウト: CSS Grid。デスクトップ =「整形元 | オプション列 | 整形後」の3カラム、〜800px では縦積み
- 等幅フォント: `font-family: ui-monospace, "Cascadia Mono", Consolas, "BIZ UDGothic", "MS Gothic", monospace`
- 「コピー」: `navigator.clipboard.writeText(出力改行コード適用済みテキスト)`。成功時ボタンラベルを一時的に「コピーしました ✓」。失敗時(file:// 等)はエラーメッセージ表示
- ギャップ・タブ幅は number input(ギャップ min1 max4)。タブ方式選択時はギャップを `disabled` + グレーアウト、§6.2 の注意書きを表示
- モードのラジオ/セレクト「自動判定 / コード / 表」+ 自動時の判定結果表示(例:「自動判定: コードモード」)
- =揃えチェックボックスはコードモードが有効なときのみ活性
- ダーク: `prefers-color-scheme` + CSS変数
- index.html の `<html lang="ja">`、UTF-8

## J. テストランナー(tests.html / tests.js)

- 依存なしの自前ランナー。`test(name, fn)` + `assertEqual(actual, expected)`。失敗時は expected/actual を等幅で並べて表示(不一致行がわかること)
- 結果: 上部に「N passed / M failed」、失敗は赤・成功は緑の一覧
- SPEC §8 のテスト一覧(①②③)を全て実装。①は8ケース以上
- テストは `TateAlign.format` / 各純関数を直接呼ぶ(DOM操作テストは「既定に戻す」= リセット関数が DEFAULT_SEPARATORS を返すこと+ボタンの存在確認程度でよい)

## K. 成果物

`index.html` / `style.css` / `app.js` / `tests.html` / `tests.js` / `README.md`(SPEC §10 の内容。スクショは後で撮るためプレースホルダ可)/ `LICENSE`(MIT, holder は "tate-align authors" で仮置き)

## L. 完成条件

- tests.html の全テスト緑
- index.html 単体でフレームワーク・CDN・外部フォント読み込み一切なし(完全オフライン動作)

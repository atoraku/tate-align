/*
 * tests.js — 依存なしの自前テストランナー
 * SPEC §8 のテスト一覧 ①②③ を実装。app.js の TateAlign を直接呼ぶ。
 * tests.html から読み込むほか、Node でも実行可能。
 */
(function (global) {
  'use strict';

  var T = global.TateAlign;
  var results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name: name, ok: true });
    } catch (e) {
      results.push({ name: name, ok: false, message: e.message, detail: e.detail });
    }
  }

  function assertEqual(actual, expected) {
    if (actual !== expected) {
      var err = new Error('not equal');
      err.detail = { expected: expected, actual: actual };
      throw err;
    }
  }

  // タブ展開ヘルパ(例F の展開位置検証用・テスト内で完結)
  function expandTabs(str, tw) {
    var out = '', col = 0;
    for (var ch of str) {
      if (ch === '\t') { var n = tw - (col % tw); out += ' '.repeat(n); col += n; }
      else { out += ch; col += T.charWidth(ch.codePointAt(0)); }
    }
    return out;
  }

  /* ========== ① displayWidth(8ケース以上) ========== */
  test('① displayWidth: ASCII', function () { assertEqual(T.displayWidth('abc'), 3); });
  test('① displayWidth: ひらがな', function () { assertEqual(T.displayWidth('あいう'), 6); });
  test('① displayWidth: 漢字', function () { assertEqual(T.displayWidth('日本語'), 6); });
  test('① displayWidth: 全角記号', function () { assertEqual(T.displayWidth('！？'), 4); });
  test('① displayWidth: Ambiguous ①', function () { assertEqual(T.displayWidth('①'), 2); });
  test('① displayWidth: Ambiguous ※±℃', function () { assertEqual(T.displayWidth('※±℃'), 6); });
  test('① displayWidth: 絵文字😀', function () { assertEqual(T.displayWidth('😀'), 2); });
  test('① displayWidth: サロゲート混在 a😀い', function () { assertEqual(T.displayWidth('a😀い'), 5); });
  test('① displayWidth: 全角スペース', function () { assertEqual(T.displayWidth('　'), 2); });
  test('① displayWidth: 混在 abcあ①', function () { assertEqual(T.displayWidth('abcあ①'), 7); });

  /* ========== ② 例A〜G ========== */

  // 例A:コードモード(スペース、ギャップ1、=揃えOFF)
  test('② 例A コードモード', function () {
    var input = 'int a = 0; // 速度\nint speed = 10; // 加速度の設定\nlong t = 3; // 時間';
    var expected = 'int a = 0;      // 速度\nint speed = 10; // 加速度の設定\nlong t = 3;     // 時間';
    assertEqual(T.format(input, { mode: 'code', fill: 'space', gap: 1, alignEquals: false }), expected);
  });

  // 例B:表モード(タブ区切り入力、区切り欄=既定、スペース、ギャップ2)
  test('② 例B 表モード(タブ入力)', function () {
    var input = '名前\t点数\t備考\n田中\t90\tよい\nAlexander\t100\ttops';
    var expected = '名前       点数  備考\n田中       90    よい\nAlexander  100   tops';
    assertEqual(T.format(input, { mode: 'table', fill: 'space', gap: 2, separators: '\\s,\\t' }), expected);
  });

  // 例C:=揃え
  test('② 例C =揃え', function () {
    var input = 'speed = 0\n加速度 = 10\nname = "テスト"';
    var expected = 'speed  = 0\n加速度 = 10\nname   = "テスト"';
    assertEqual(T.format(input, { mode: 'code', fill: 'space', gap: 1, alignEquals: true }), expected);
  });

  // 例D:区切り欄 \s,\t,;
  test('② 例D 区切り欄に ; を追加', function () {
    var input = 'int speed;// 速度\nlong acceleration;// 加速度\nchar c;// 文字';
    var expected = 'int  speed;        // 速度\nlong acceleration; // 加速度\nchar c;            // 文字';
    assertEqual(T.format(input, { mode: 'table', fill: 'space', gap: 1, separators: '\\s,\\t,;' }), expected);
  });

  // 例E:区切り欄 \s,\t,\,
  test('② 例E 配列初期化(カンマ区切り)', function () {
    var input = '{1,22,333},\n{444,5,66},';
    var expected = '{1,   22, 333},\n{444, 5,  66},';
    assertEqual(T.format(input, { mode: 'table', fill: 'space', gap: 1, separators: '\\s,\\t,\\,' }), expected);
  });

  // 例F:タブ方式(例Aと同じ入力、タブ幅4)
  test('② 例F タブ方式(生出力一致)', function () {
    var input = 'int a = 0; // 速度\nint speed = 10; // 加速度の設定\nlong t = 3; // 時間';
    var expected = 'int a = 0;\t\t// 速度\nint speed = 10;\t// 加速度の設定\nlong t = 3;\t\t// 時間';
    assertEqual(T.format(input, { mode: 'code', fill: 'tab', tabWidth: 4, alignEquals: false }), expected);
  });
  test('② 例F タブ本数 2/1/2', function () {
    var input = 'int a = 0; // 速度\nint speed = 10; // 加速度の設定\nlong t = 3; // 時間';
    var lines = T.format(input, { mode: 'code', fill: 'tab', tabWidth: 4, alignEquals: false }).split('\n');
    assertEqual((lines[0].match(/\t/g) || []).length, 2);
    assertEqual((lines[1].match(/\t/g) || []).length, 1);
    assertEqual((lines[2].match(/\t/g) || []).length, 2);
  });
  test('② 例F 展開後の // が全行表示幅16から開始', function () {
    var input = 'int a = 0; // 速度\nint speed = 10; // 加速度の設定\nlong t = 3; // 時間';
    var lines = T.format(input, { mode: 'code', fill: 'tab', tabWidth: 4, alignEquals: false }).split('\n');
    for (var i = 0; i < 3; i++) {
      var beforeComment = lines[i].split('//')[0];
      assertEqual(T.displayWidth(expandTabs(beforeComment, 4)), 16);
    }
  });

  // 例G:区切り欄=既定 \s,\t
  test('② 例G 既定区切り(空白1個の宣言が揃う)', function () {
    var input = 'int a = 0;\nint speed = 10;\nlong t = 3;';
    var expected = 'int  a     = 0;\nint  speed = 10;\nlong t     = 3;';
    assertEqual(T.format(input, { mode: 'table', fill: 'space', gap: 1, separators: '\\s,\\t' }), expected);
  });

  /* ========== ③ エッジ ========== */

  test('③ 空行混在(表)', function () {
    assertEqual(T.format('a b\n\nc d', { mode: 'table', gap: 1, separators: '\\s,\\t' }), 'a b\n\nc d');
  });

  test('③ コメントなし行混在(コードは変更しない)', function () {
    assertEqual(
      T.format('x = 1\ny = 2 // memo', { mode: 'code', gap: 1, alignEquals: false }),
      'x = 1\ny = 2 // memo'
    );
  });

  test('③ 文字列リテラル内の // ; 空白で分割しない(表)', function () {
    assertEqual(
      T.format('a "b // c" d', { mode: 'table', gap: 1, separators: '\\s,\\t,;' }),
      'a "b // c" d'
    );
  });

  test('③ 文字列リテラル内の // をコメント扱いしない(コード)', function () {
    assertEqual(
      T.format('s = "http://x" // 実コメント\nn = 1 // n', { mode: 'code', gap: 1, alignEquals: false }),
      's = "http://x" // 実コメント\nn = 1          // n'
    );
  });

  test('③ == を =揃え対象にしない', function () {
    // 'a == b' は代入=を持たないので不変。'cd = 1' のみ揃う。
    assertEqual(
      T.format('a == b\ncd = 1', { mode: 'code', gap: 1, alignEquals: true }),
      'a == b\ncd = 1'
    );
  });

  test('③ <= >= += は =揃え対象にしない', function () {
    assertEqual(
      T.format('x <= 5\ny = 2', { mode: 'code', gap: 1, alignEquals: true }),
      'x <= 5\ny = 2'
    );
  });

  test('③ 列数不一致(存在する列だけ揃える)', function () {
    assertEqual(
      T.format('a b c\nx y', { mode: 'table', gap: 1, separators: '\\s,\\t' }),
      'a b c\nx y'
    );
  });

  test('③ 行頭インデント保持(行頭空白では分割しない)', function () {
    assertEqual(
      T.format('  a b\n  cc d', { mode: 'table', gap: 1, separators: '\\s,\\t' }),
      '  a  b\n  cc d'
    );
  });

  test('③ 行末空白除去', function () {
    // 出力末尾に余分な空白が付かない
    var out = T.format('a b   \nc d', { mode: 'table', gap: 1, separators: '\\s,\\t' });
    assertEqual(out, 'a b\nc d');
  });

  test('③ 連続スペースを1区切りに集約', function () {
    assertEqual(
      T.format('a    b\ncc   d', { mode: 'table', gap: 1, separators: '\\s,\\t' }),
      'a  b\ncc d'
    );
  });

  test('③ \\s を欄から消すと空白で分割しない', function () {
    // 区切りは \t のみ。'a b'(内部スペース)は割れず1セル(幅3=colmax, gap1)。
    assertEqual(
      T.format('a b\tc\nx y\tz', { mode: 'table', gap: 1, separators: '\\t' }),
      'a b c\nx y z'
    );
  });

  test('③ 列maxがタブ幅の倍数ちょうどのときのタブ方式(次の倍数へ)', function () {
    // コード部 'abcd'=4(=4の倍数), 'ef'=2。max=4 → T=8。
    var out = T.format('abcd // c\nef // d', { mode: 'code', fill: 'tab', tabWidth: 4, alignEquals: false });
    var lines = out.split('\n');
    assertEqual((lines[0].match(/\t/g) || []).length, 1); // 4→8
    assertEqual((lines[1].match(/\t/g) || []).length, 2); // 2→8
    // 展開後の // 位置は両行とも 8
    assertEqual(T.displayWidth(expandTabs(lines[0].split('//')[0], 4)), 8);
    assertEqual(T.displayWidth(expandTabs(lines[1].split('//')[0], 4)), 8);
  });

  test('③ CRLF入力→auto でCRLF出力', function () {
    assertEqual(
      T.format('a\r\nb', { mode: 'table', separators: '\\s', lineEnding: 'auto', detectedLineEnding: 'CRLF' }),
      'a\r\nb'
    );
  });

  test('③ CRLF入力→LF強制でLF出力', function () {
    assertEqual(
      T.format('a\r\nb', { mode: 'table', separators: '\\s', lineEnding: 'LF', detectedLineEnding: 'CRLF' }),
      'a\nb'
    );
  });

  test('③ detectLineEnding: CRLF多数', function () {
    assertEqual(T.detectLineEnding('a\r\nb\r\nc\n'), 'CRLF');
  });

  test('③ detectLineEnding: 手打ち(未検出)はLF', function () {
    assertEqual(T.detectLineEnding(''), 'LF');
  });

  test('③ detectMode: コメント過半でコード', function () {
    assertEqual(T.detectMode('a // x\nb // y\nc'), 'code');
  });

  test('③ detectMode: それ以外は表', function () {
    assertEqual(T.detectMode('a b\nc d\ne // f'), 'table');
  });

  test('③ 「既定に戻す」= DEFAULT_SEPARATORS を返す', function () {
    assertEqual(T.resetSeparators(), '\\s,\\t');
    assertEqual(T.DEFAULT_SEPARATORS, '\\s,\\t');
  });

  test('③ parseSeparators: 既定は spaces + tab', function () {
    var toks = T.parseSeparators('\\s,\\t');
    assertEqual(toks.length, 2);
    assertEqual(toks[0].type, 'spaces');
    assertEqual(toks[1].type, 'tab');
  });

  test('③ parseSeparators: \\, はリテラルカンマ', function () {
    var toks = T.parseSeparators('\\s,\\t,\\,');
    assertEqual(toks.length, 3);
    assertEqual(toks[2].type, 'literal');
    assertEqual(toks[2].text, ',');
  });

  test('③ parseSeparators: 空欄は区切りなし', function () {
    assertEqual(T.parseSeparators('').length, 0);
  });

  /* ========== レンダリング ========== */

  var passed = results.filter(function (r) { return r.ok; }).length;
  var failed = results.length - passed;

  if (typeof document !== 'undefined' && document.getElementById('results')) {
    var summary = document.getElementById('summary');
    summary.textContent = passed + ' passed / ' + failed + ' failed';
    summary.className = failed === 0 ? 'ok' : 'ng';

    var container = document.getElementById('results');
    results.forEach(function (r) {
      var div = document.createElement('div');
      div.className = 'case ' + (r.ok ? 'pass' : 'fail');
      var head = document.createElement('div');
      head.className = 'case-head';
      head.textContent = (r.ok ? '✓ ' : '✗ ') + r.name;
      div.appendChild(head);
      if (!r.ok && r.detail) {
        var pre = document.createElement('pre');
        pre.className = 'diff';
        pre.textContent = 'expected:\n' + r.detail.expected + '\n\nactual:\n' + r.detail.actual;
        div.appendChild(pre);
      } else if (!r.ok) {
        var msg = document.createElement('div');
        msg.textContent = r.message;
        div.appendChild(msg);
      }
      container.appendChild(div);
    });
  } else {
    // Node 実行時
    results.forEach(function (r) {
      if (!r.ok) {
        console.log('FAIL ' + r.name);
        if (r.detail) {
          console.log('  expected: ' + JSON.stringify(r.detail.expected));
          console.log('  actual  : ' + JSON.stringify(r.detail.actual));
        }
      }
    });
    console.log(passed + ' passed / ' + failed + ' failed');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { passed: passed, failed: failed, results: results };
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);

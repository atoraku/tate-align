/*
 * tate-align — 全角対応・縦揃え整形ツール
 * app.js : 純粋ロジック層(グローバル TateAlign)+ DOM 配線層
 *
 * フレームワーク・外部ライブラリ非依存。素の JS のみ。
 * Node からも読み込めるよう、DOM 配線は document 存在チェックでガードする。
 */
(function (global) {
  'use strict';

  /* =========================================================
   * B. 幅計算(charWidth / displayWidth)
   * =======================================================*/

  // 表示幅 2(Fullwidth / Wide)レンジ
  var WIDE_RANGES = [
    [0x1100, 0x115F],
    [0x2E80, 0xA4CF], // CJK・かな・全角スペース U+3000 を含む
    [0xAC00, 0xD7A3],
    [0xF900, 0xFAFF],
    [0xFE30, 0xFE4F],
    [0xFF00, 0xFF60],
    [0xFFE0, 0xFFE6],
    [0x1F300, 0x1FAFF] // 絵文字(近似)
  ];

  // Ambiguous を幅 2 として扱う(日本語等幅フォント前提)
  var AMBIG_RANGES = [
    [0x00A7, 0x00A8], [0x00B0, 0x00B1], [0x00B4, 0x00B4], [0x00B6, 0x00B6],
    [0x00D7, 0x00D7], [0x00F7, 0x00F7],
    [0x2010, 0x2010], [0x2014, 0x2016], [0x2018, 0x2019], [0x201C, 0x201D],
    [0x2020, 0x2021], [0x2025, 0x2026], [0x2030, 0x2030], [0x2032, 0x2033],
    [0x203B, 0x203B], [0x2103, 0x2103], [0x2113, 0x2113], [0x2121, 0x2121],
    [0x2160, 0x216B], [0x2170, 0x2179],
    [0x2190, 0x2199], [0x21D2, 0x21D2], [0x21D4, 0x21D4],
    [0x2200, 0x22FF],
    [0x2460, 0x24FF], [0x25A0, 0x25FF], [0x2605, 0x2606],
    [0x2640, 0x2640], [0x2642, 0x2642],
    [0x266A, 0x266A], [0x266D, 0x266D], [0x266F, 0x266F]
  ];

  function inRanges(cp, ranges) {
    for (var i = 0; i < ranges.length; i++) {
      if (cp >= ranges[i][0] && cp <= ranges[i][1]) return true;
    }
    return false;
  }

  function charWidth(cp) {
    if (inRanges(cp, WIDE_RANGES)) return 2;
    if (inRanges(cp, AMBIG_RANGES)) return 2;
    return 1;
  }

  function displayWidth(str) {
    var w = 0;
    for (var ch of str) {
      w += charWidth(ch.codePointAt(0));
    }
    return w;
  }

  /* =========================================================
   * 小さなユーティリティ
   * =======================================================*/

  function rstrip(s) {
    return s.replace(/[ \t]+$/, '');
  }

  function lstrip(s) {
    return s.replace(/^[ \t]+/, '');
  }

  function padRight(s, width) {
    var w = displayWidth(s);
    if (w >= width) return s;
    return s + ' '.repeat(width - w);
  }

  // max より大きい最小のタブ幅倍数(ちょうど倍数のときも次へ)
  function nextTabStop(max, tabWidth) {
    return Math.floor(max / tabWidth) * tabWidth + tabWidth;
  }

  // v1.3.1: タブを含む文字列の表示幅。タブは「次のタブ位置まで進む」ため幅が可変で、
  // displayWidth(タブ=幅1)では正しく測れない。列揃えでタブを挿入した後の
  // コード部を測る場面で使う。
  function displayWidthTabs(str, tabWidth) {
    if (str.indexOf('\t') < 0) return displayWidth(str); // 高速パス
    var col = 0;
    for (var ch of str) {
      if (ch === '\t') col += tabWidth - (col % tabWidth);
      else col += charWidth(ch.codePointAt(0));
    }
    return col;
  }

  // タブをタブ幅で空白展開(表示幅ベースのタブストップ)
  function expandTabs(str, tabWidth) {
    var out = '';
    var col = 0;
    for (var ch of str) {
      if (ch === '\t') {
        var n = tabWidth - (col % tabWidth);
        out += ' '.repeat(n);
        col += n;
      } else {
        out += ch;
        col += charWidth(ch.codePointAt(0));
      }
    }
    return out;
  }

  /* =========================================================
   * v1.4: 行頭インデントの正規化(オプション・既定オフ)
   * 行頭の空白幅がバラバラな入力を、いちばん多いインデント幅にそろえる。
   * 揃え型より前の前処理として走らせる。
   * =======================================================*/

  // 行頭の空白・タブ列を取り出し、タブ展開後の表示幅を返す
  function leadingIndentWidth(line, tabWidth) {
    var i = 0;
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
    return displayWidth(expandTabs(line.slice(0, i), tabWidth));
  }

  // 非空行のインデント幅の最頻値。同数のときは小さいほう(余計に字下げしない)
  function majorityIndentWidth(lines, tabWidth) {
    var tally = {};
    var found = false;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      var w = leadingIndentWidth(lines[i], tabWidth);
      tally[w] = (tally[w] || 0) + 1;
      found = true;
    }
    if (!found) return 0;
    var best = -1, bestW = 0;
    for (var key in tally) {
      if (!Object.prototype.hasOwnProperty.call(tally, key)) continue;
      var w2 = parseInt(key, 10);
      if (tally[w2] > best || (tally[w2] === best && w2 < bestW)) { best = tally[w2]; bestW = w2; }
    }
    return bestW;
  }

  // 非空行の行頭インデントを最頻値ぶんの半角スペースに統一する(空行はそのまま)
  function normalizeIndentLines(lines, tabWidth) {
    var pad = new Array(majorityIndentWidth(lines, tabWidth) + 1).join(String.fromCharCode(32));
    return lines.map(function (l) {
      if (l.trim() === '') return l;
      var i = 0;
      while (i < l.length && (l[i] === ' ' || l[i] === '\t')) i++;
      return pad + l.slice(i);
    });
  }

  /* =========================================================
   * C. 引用符の簡易走査ヘルパ
   * =======================================================*/

  function isQuoteChar(ch) {
    return ch === '\'' || ch === '"' || ch === '`';
  }

  /* =========================================================
   * D. 区切り欄のパース(parseSeparators)
   * =======================================================*/

  var DEFAULT_SEPARATORS = '\\s,\\t';

  // ,, 由来のリテラルカンマを表す内部センチネル(文字列トークンと区別する)
  var LITERAL_COMMA = { __literalComma: true };

  // 欄テキスト -> トークン配列 [{type:'spaces'|'tab'|'literal', text?}]
  function parseSeparators(fieldText) {
    if (fieldText == null) return [];
    var raw = [];
    var buf = '';
    var i = 0;
    var n = fieldText.length;
    // カンマ分割。ただし \, はエスケープされたカンマなので分割しない。
    // また ,,(カンマ2連続)はリテラルカンマ1個として扱う(\, と同義)。
    while (i < n) {
      var c = fieldText[i];
      if (c === '\\' && i + 1 < n) {
        buf += c + fieldText[i + 1]; // エスケープ列をそのまま保持
        i += 2;
        continue;
      }
      if (c === ',' && fieldText[i + 1] === ',') {
        raw.push(buf);               // 現在のバッファを確定
        raw.push(LITERAL_COMMA);     // ,, はリテラルカンマトークン
        buf = '';
        i += 2;
        continue;
      }
      if (c === ',') {
        raw.push(buf);
        buf = '';
        i++;
        continue;
      }
      buf += c;
      i++;
    }
    raw.push(buf);

    var tokens = [];
    for (var k = 0; k < raw.length; k++) {
      var t = raw[k];
      if (t === LITERAL_COMMA) {      // ,, 由来のリテラルカンマ
        tokens.push({ type: 'literal', text: ',' });
        continue;
      }
      // 前後の半角空白・タブをトリム(全角スペース1文字などは残る)
      var trimmed = t.replace(/^[ \t]+|[ \t]+$/g, '');
      if (trimmed === '') continue; // 空トークンは無視
      if (trimmed === '\\s') {
        tokens.push({ type: 'spaces' });
      } else if (trimmed === '\\t') {
        tokens.push({ type: 'tab' });
      } else {
        // リテラル。\, はカンマに戻す。
        var lit = trimmed.replace(/\\,/g, ',');
        if (lit.length > 0) tokens.push({ type: 'literal', text: lit });
      }
    }
    return tokens;
  }

  /* =========================================================
   * E. 行分割(splitLine)— 表モード
   * =======================================================*/

  // leadingTabIsIndent(v1.3・省略可):true のとき行頭のタブ列を「共通インデント」
  // とみなしてタブ幅で空白展開し保持する。省略時は従来動作(行頭タブは区切り扱い)。
  function splitLine(line, seps, tabWidth, leadingTabIsIndent) {
    if (tabWidth == null) tabWidth = 4;
    seps = seps || [];

    var hasTab = false, hasSpaces = false;
    var literals = [];
    for (var s = 0; s < seps.length; s++) {
      if (seps[s].type === 'tab') hasTab = true;
      else if (seps[s].type === 'spaces') hasSpaces = true;
      else if (seps[s].type === 'literal' && seps[s].text.length > 0) {
        literals.push(seps[s].text);
      }
    }
    // 長いリテラル優先でマッチ
    literals.sort(function (a, b) { return b.length - a.length; });

    var work = line;
    // \t が区切りに「ない」場合のみタブを空白展開
    if (!hasTab) {
      work = expandTabs(work, tabWidth);
    }

    // 1. 行頭インデントを取り出す。
    //    既定(leadingTabIsIndent なし)は半角スペースの連続のみ。行頭タブは
    //    \t が区切りにある場合は走査部で区切りとして処理され先頭に空セルが生じる
    //    (Excel貼付で先頭列が空のケース)。\t が区切りにない場合は上で空白展開済み
    //    なのでインデントとして収集される。
    //    leadingTabIsIndent = true(v1.3:非空行がすべて行頭タブ=ソースの共通
    //    インデント)のときは、行頭の空白・タブ列を展開してインデントとして保持する。
    var idx = 0;
    var indent = '';
    if (leadingTabIsIndent) {
      while (idx < work.length && (work[idx] === ' ' || work[idx] === '\t')) idx++;
      indent = expandTabs(work.slice(0, idx), tabWidth);
    } else {
      while (idx < work.length && work[idx] === ' ') {
        indent += work[idx];
        idx++;
      }
    }
    var rest = work.slice(idx);

    // 3. 走査して分割
    var cells = [];
    var cur = '';
    var quote = null;
    var p = 0;
    while (p < rest.length) {
      var ch = rest[p];

      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
        p++;
        continue;
      }
      if (isQuoteChar(ch)) {
        quote = ch;
        cur += ch;
        p++;
        continue;
      }

      // literal(長いもの優先)
      var matched = false;
      for (var li = 0; li < literals.length; li++) {
        var lit = literals[li];
        if (rest.substr(p, lit.length) === lit) {
          cur += lit;          // リテラルは左セル末尾に残す
          cells.push(cur);
          cur = '';
          p += lit.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      if (hasTab && ch === '\t') {
        cells.push(cur);       // タブ自体は除去
        cur = '';
        p++;
        continue;
      }
      if (hasSpaces && ch === ' ') {
        cells.push(cur);       // 連続スペースを1区切りに集約
        cur = '';
        while (p < rest.length && rest[p] === ' ') p++;
        continue;
      }

      cur += ch;
      p++;
    }
    cells.push(cur);

    // 第1セルにインデントを戻す
    if (cells.length === 0) cells = [indent];
    else cells[0] = indent + cells[0];

    // 4. 各セル先頭の空白をトリム(第1セルのインデントは除く)
    for (var ci = 1; ci < cells.length; ci++) {
      cells[ci] = lstrip(cells[ci]);
    }

    // 5. 行末の区切りで生じた末尾の空セルは無視
    while (cells.length > 1 && rstrip(cells[cells.length - 1]) === '') {
      cells.pop();
    }

    return cells;
  }

  /* =========================================================
   * コメント分割 / 代入= 検出(引用符外)
   * =======================================================*/

  // コード部 / コメント部に分割(区切りは引用符外の最初の // または # または /*)
  // 戻り値 isBlock: コメントが /* 始まりのブロックコメントか(後方互換: 既存呼び出しは code/comment のみ参照)
  function splitComment(line) {
    var quote = null;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (isQuoteChar(ch)) {
        quote = ch;
        continue;
      }
      if (ch === '/' && line[i + 1] === '/') {
        return { code: line.slice(0, i), comment: line.slice(i), isBlock: false };
      }
      if (ch === '/' && line[i + 1] === '*') {
        return { code: line.slice(0, i), comment: line.slice(i), isBlock: true };
      }
      if (ch === '#') {
        return { code: line.slice(0, i), comment: line.slice(i), isBlock: false };
      }
    }
    return { code: line, comment: '', isBlock: false };
  }

  var EQ_FORBIDDEN = '=<>!+-*/%&|^';

  // 代入の = の位置を返す(前後が禁止文字でない、行内最初の1個)。無ければ -1。
  function findAssignEq(code) {
    var quote = null;
    for (var i = 0; i < code.length; i++) {
      var ch = code[i];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (isQuoteChar(ch)) {
        quote = ch;
        continue;
      }
      if (ch === '=') {
        var prev = i > 0 ? code[i - 1] : '';
        var next = i + 1 < code.length ? code[i + 1] : '';
        var prevBad = prev !== '' && EQ_FORBIDDEN.indexOf(prev) !== -1;
        var nextBad = next !== '' && EQ_FORBIDDEN.indexOf(next) !== -1;
        if (!prevBad && !nextBad) return i;
      }
    }
    return -1;
  }

  /* =========================================================
   * N.2 ブロックコメントの閉じ揃え(コード・全部揃え共通の後処理)
   * =======================================================*/

  // parts: [{code, comment, isBlock}] を破壊的に更新する。
  // 対象: comment が /* 始まり かつ rstrip 後 */ 終わり の行。
  // 内文(/* と */ を除去し前後トリム)の max 幅で "/* " + pad + " */" に再構成。
  // */ で終わらない /* 行は再構成しない(/* の桁揃えは呼び出し側の列/コメント揃えで行う)。
  function alignBlockComments(parts) {
    var targets = [];
    var maxInner = 0;
    for (var i = 0; i < parts.length; i++) {
      var cm = parts[i].comment;
      if (cm === '') continue;
      var trimmed = rstrip(cm);
      if (trimmed.length >= 4 &&
          trimmed.slice(0, 2) === '/*' &&
          trimmed.slice(-2) === '*/') {
        var inner = trimmed.slice(2, trimmed.length - 2).replace(/^[ \t]+|[ \t]+$/g, '');
        var w = displayWidth(inner);
        if (w > maxInner) maxInner = w;
        targets.push({ idx: i, inner: inner });
      }
    }
    for (var j = 0; j < targets.length; j++) {
      var t = targets[j];
      parts[t.idx].comment = '/* ' + padRight(t.inner, maxInner) + ' */';
    }
  }

  // コメント揃え(コメントを持つ行だけを対象に開始桁を揃える)。
  // 先に alignBlockComments を適用。コード・全部揃えで共用。
  function attachComments(parts, opts) {
    var tw = opts.tabWidth;

    alignBlockComments(parts);

    // コード部は列揃えでタブが挿入されている場合があるので、タブ込みの表示幅で測る
    var maxCode = 0;
    for (var a = 0; a < parts.length; a++) {
      if (parts[a].comment !== '') {
        var w = displayWidthTabs(rstrip(parts[a].code), tw);
        if (w > maxCode) maxCode = w;
      }
    }

    var out = [];
    for (var b = 0; b < parts.length; b++) {
      var pt = parts[b];
      if (pt.comment === '') {
        out.push(rstrip(pt.code)); // コメントなし行はそのまま
        continue;
      }
      var code = rstrip(pt.code);
      var cw = displayWidthTabs(code, tw);
      var joined;
      if (opts.fill === 'tab') {
        var T = nextTabStop(maxCode, tw);
        // 現在位置 cw から T(タブ幅の倍数)へ進むのに必要なタブ本数
        var tabs = (T - Math.floor(cw / tw) * tw) / tw;
        if (tabs < 1) tabs = 1;
        joined = code + '\t'.repeat(tabs) + pt.comment;
      } else {
        var padWidth = maxCode > cw ? maxCode - cw : 0;
        joined = code + ' '.repeat(padWidth) + ' '.repeat(opts.gap) + pt.comment;
      }
      out.push(rstrip(joined));
    }
    return out;
  }

  /* =========================================================
   * F. コードモード整形
   * =======================================================*/

  function formatCode(lines, opts) {
    var tw = opts.tabWidth;

    // 1. タブ展開 + コメント分割
    var parts = lines.map(function (l) {
      return splitComment(expandTabs(l, tw));
    });

    // 2. =揃え(コメント揃えより先に適用)
    if (opts.alignEquals) {
      var maxLeft = 0;
      var info = [];
      for (var i = 0; i < parts.length; i++) {
        var eq = findAssignEq(parts[i].code);
        if (eq >= 0) {
          var left = rstrip(parts[i].code.slice(0, eq));
          var right = parts[i].code.slice(eq + 1);
          var lw = displayWidth(left);
          if (lw > maxLeft) maxLeft = lw;
          info.push({ idx: i, left: left, right: right });
        }
      }
      for (var j = 0; j < info.length; j++) {
        var it = info[j];
        parts[it.idx].code = padRight(it.left, maxLeft) + ' = ' + lstrip(it.right);
      }
    }

    // 3. コメント揃え(ブロックコメント閉じ揃え込み)
    return attachComments(parts, opts);
  }

  /* =========================================================
   * 列揃え(表モード・全部揃え共通)
   * rows: [セル配列 | null(空行)] -> 揃った行文字列配列
   * =======================================================*/

  function alignRows(rows, opts) {
    var tw = opts.tabWidth;

    // 列ごとの max
    var colMax = [];
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r];
      if (!cells) continue;
      for (var c = 0; c < cells.length; c++) {
        var w = displayWidth(cells[c]);
        if (colMax[c] === undefined || w > colMax[c]) colMax[c] = w;
      }
    }

    var out = [];
    for (var r2 = 0; r2 < rows.length; r2++) {
      var cs = rows[r2];
      if (!cs) { out.push(''); continue; }
      var line = '';
      for (var c2 = 0; c2 < cs.length; c2++) {
        if (c2 === cs.length - 1) {
          line += cs[c2];                  // 最終列は揃えない
        } else if (opts.fill === 'tab') {
          var T = nextTabStop(colMax[c2], tw);
          var cw = displayWidth(cs[c2]);
          var tabs = Math.ceil((T - cw) / tw);
          if (tabs < 1) tabs = 1;
          line += cs[c2] + '\t'.repeat(tabs);
        } else {
          line += padRight(cs[c2], colMax[c2]) + ' '.repeat(opts.gap);
        }
      }
      out.push(rstrip(line));
    }
    return out;
  }

  /* =========================================================
   * 表モード整形
   * =======================================================*/

  function formatTable(lines, opts, seps, leadingTabIsIndent) {
    var tw = opts.tabWidth;
    var rows = lines.map(function (l) {
      if (l === '') return null;           // 空行はそのまま
      return splitLine(l, seps, tw, leadingTabIsIndent);
    });
    return alignRows(rows, opts);
  }

  /* =========================================================
   * N.3 全部揃えモード(mode:'full')
   * コード部を表モードと同じ列揃え → コメント開始桁揃え → ブロック閉じ揃え
   * =揃えオプションは使用しない
   * =======================================================*/

  function formatFull(lines, opts, seps, leadingTabIsIndent) {
    var tw = opts.tabWidth;

    // 1. タブ展開 + コメント分割
    var parts = lines.map(function (l) {
      return splitComment(expandTabs(l, tw));
    });

    // 2. コード部を列分割(空行は null)。コメントなし行もコード部の列揃えに参加。
    var rows = [];
    for (var i = 0; i < parts.length; i++) {
      if (lines[i] === '') { rows.push(null); continue; }
      rows.push(splitLine(rstrip(parts[i].code), seps, tw, leadingTabIsIndent));
    }
    var alignedCode = alignRows(rows, opts);
    for (var k = 0; k < parts.length; k++) {
      parts[k].code = alignedCode[k];
    }

    // 3. コメント開始桁揃え(ブロックコメント閉じ揃え込み)
    return attachComments(parts, opts);
  }

  /* =========================================================
   * O.2 関数・括弧揃えモード(mode:'paren')— SPEC §5.7
   * ( ) ; をアンカーにしてコード部を揃える(コード部の連結はギャップ0)
   * 区切り欄・=揃えオプションは使用しない
   * =======================================================*/

  // コード部の引用符外を走査してアンカー候補を集める。
  // opens: '(' の位置(前から)/ closes: ')' の位置(全件・昇順)/ semi: 最後の ';' の位置(無ければ -1)
  function findAnchors(code) {
    var opens = [];
    var closes = [];
    var semi = -1;
    var quote = null;
    for (var i = 0; i < code.length; i++) {
      var ch = code[i];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (isQuoteChar(ch)) {
        quote = ch;
        continue;
      }
      if (ch === '(') opens.push(i);
      else if (ch === ')') closes.push(i);
      else if (ch === ';') semi = i;
    }
    return { opens: opens, closes: closes, semi: semi };
  }

  function formatParen(lines, opts) {
    var tw = opts.tabWidth;
    var i, t;

    // 1. タブ展開 + コメント分割
    var parts = lines.map(function (l) {
      return splitComment(expandTabs(l, tw));
    });

    // 2. アンカー判定の対象行(コード部が空でない行)を集める
    var codes = [];
    var targets = [];
    for (i = 0; i < parts.length; i++) {
      codes[i] = rstrip(parts[i].code);
      if (lines[i] === '' || codes[i] === '') continue;
      targets.push(i);
    }

    // 3. 採用アンカーの決定(open は前から・close は後ろから、全対象行にある限り)
    var anchors = {};
    var nOpen = Infinity, nClose = Infinity;
    var hasSemi = targets.length > 0;
    for (t = 0; t < targets.length; t++) {
      var a = findAnchors(codes[targets[t]]);
      anchors[targets[t]] = a;
      if (a.opens.length < nOpen) nOpen = a.opens.length;
      if (a.closes.length < nClose) nClose = a.closes.length;
      if (a.semi < 0) hasSemi = false;
    }
    if (!isFinite(nOpen)) nOpen = 0;
    if (!isFinite(nClose)) nClose = 0;

    // 4. 行ごとの採用位置(昇順ソート+重複除去)
    var positions = {};
    var countTally = {};
    for (t = 0; t < targets.length; t++) {
      var idx = targets[t];
      var an = anchors[idx];
      var pos = [];
      for (var k = 0; k < nOpen; k++) pos.push(an.opens[k]);
      for (var m = an.closes.length - nClose; m < an.closes.length; m++) pos.push(an.closes[m]);
      if (hasSemi) pos.push(an.semi);
      pos.sort(function (x, y) { return x - y; });
      var uniq = [];
      for (var q = 0; q < pos.length; q++) {
        if (q === 0 || pos[q] !== pos[q - 1]) uniq.push(pos[q]);
      }
      positions[idx] = uniq;
      countTally[uniq.length] = (countTally[uniq.length] || 0) + 1;
    }

    // 5. アンカー個数が最も多くの行で一致する値を基準に。外れた行は揃え対象外。
    var ref = -1, best = -1;
    for (var key in countTally) {
      if (!Object.prototype.hasOwnProperty.call(countTally, key)) continue;
      var kn = parseInt(key, 10);
      var cnt = countTally[key];
      if (cnt > best || (cnt === best && kn < ref)) { best = cnt; ref = kn; }
    }

    // 6. アンカー直前で分割(アンカー文字は右セルの先頭)
    var rows = [];
    var rawLine = {};
    for (i = 0; i < parts.length; i++) {
      var p = positions[i];
      if (!p || p.length !== ref) {
        rows.push(null);      // 列揃えに参加させない(colMax を汚さない)
        rawLine[i] = true;
        continue;
      }
      var cells = [];
      var prev = 0;
      for (var z = 0; z < p.length; z++) {
        cells.push(codes[i].slice(prev, p[z]));
        prev = p[z];
      }
      cells.push(codes[i].slice(prev));
      rows.push(cells);
    }

    // 7. コード部の連結はギャップ0・スペース埋め固定(タブでは括弧の桁を合わせられない)
    var codeOpts = {};
    for (var ok in opts) {
      if (Object.prototype.hasOwnProperty.call(opts, ok)) codeOpts[ok] = opts[ok];
    }
    codeOpts.gap = 0;
    codeOpts.fill = 'space';
    var aligned = alignRows(rows, codeOpts);

    for (i = 0; i < parts.length; i++) {
      parts[i].code = rawLine[i] ? codes[i] : aligned[i];
    }

    // 8. コメント開始桁揃え(+ブロックコメント閉じ揃え)。ここはギャップ・埋め方式が有効。
    return attachComments(parts, opts);
  }

  /* =========================================================
   * 自動判定 / 改行コード検出
   * =======================================================*/

  // v1.3: 行頭タブを「共通インデント」として保持するか、「空の先頭セル」として
  // 扱うかを入力全体から判定する。
  //   1) 非空行がすべて行頭タブ  → ソースコードの共通インデント(true)
  //   2) 非空行がすべてタブを含む → タブ区切りの表(Excel 貼り付け)とみなす(false)
  //   3) タブを含まない行がある   → 表ではないのでインデント扱い(true)
  //      例: 構造体を波括弧の行ごとコピーした場合(`typedef struct {` にはタブがない)
  function leadingTabIsIndent(lines) {
    var nonEmpty = 0;
    var allStartWithTab = true;
    var allContainTab = true;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      nonEmpty++;
      if (lines[i][0] !== '\t') allStartWithTab = false;
      if (lines[i].indexOf('\t') < 0) allContainTab = false;
    }
    if (nonEmpty === 0) return false;
    if (allStartWithTab) return true;
    return !allContainTab;
  }

  function detectMode(text) {
    var lines = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var nonEmpty = 0;
    var withComment = 0;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      nonEmpty++;
      if (splitComment(lines[i]).comment !== '') withComment++;
    }
    if (nonEmpty === 0) return 'table';
    return (withComment * 2 > nonEmpty) ? 'code' : 'table';
  }

  function detectLineEnding(clipboardText) {
    if (!clipboardText) return 'LF';
    var crlf = (clipboardText.match(/\r\n/g) || []).length;
    var totalN = (clipboardText.match(/\n/g) || []).length;
    var loneN = totalN - crlf;
    if (crlf === 0 && loneN === 0) return 'LF';
    return crlf > loneN ? 'CRLF' : 'LF';
  }

  /* =========================================================
   * オプション正規化 / format 本体
   * =======================================================*/

  // 全既定値を返す純関数(テスト用・「すべて既定に戻す」用)
  function defaultOptions() {
    return {
      mode: 'auto',
      fill: 'space',
      gap: 1,
      tabWidth: 4,
      alignEquals: true,
      separators: DEFAULT_SEPARATORS,
      lineEnding: 'auto',
      normalizeIndent: false
    };
  }

  function normalizeOptions(options) {
    var o = options || {};
    return {
      mode: o.mode || 'auto',
      fill: o.fill || 'space',
      gap: (o.gap == null) ? 1 : o.gap,
      tabWidth: (o.tabWidth == null) ? 4 : o.tabWidth,
      alignEquals: (o.alignEquals == null) ? true : !!o.alignEquals,
      separators: (o.separators == null) ? DEFAULT_SEPARATORS : o.separators,
      lineEnding: o.lineEnding || 'auto',
      detectedLineEnding: o.detectedLineEnding || 'LF',
      normalizeIndent: !!o.normalizeIndent
    };
  }

  function format(text, options) {
    var opts = normalizeOptions(options);
    var normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = normalized.split('\n');

    // v1.4: 行頭インデントの正規化(オプション)。列分割より前に効かせる
    if (opts.normalizeIndent) {
      lines = normalizeIndentLines(lines, opts.tabWidth);
      normalized = lines.join('\n');
    }

    var mode = opts.mode;
    if (mode === 'auto') mode = detectMode(normalized);

    // v1.3: 行頭タブを共通インデントとして保持するか、Excel の空セルとして扱うか
    var tabIsIndent = leadingTabIsIndent(lines);

    var outLines;
    if (mode === 'code') {
      outLines = formatCode(lines, opts);
    } else if (mode === 'full') {
      outLines = formatFull(lines, opts, parseSeparators(opts.separators), tabIsIndent);
    } else if (mode === 'paren') {
      outLines = formatParen(lines, opts);
    } else {
      var seps = parseSeparators(opts.separators);
      outLines = formatTable(lines, opts, seps, tabIsIndent);
    }

    var joined = outLines.join('\n');

    var le = opts.lineEnding;
    if (le === 'auto') le = opts.detectedLineEnding || 'LF';
    if (le === 'CRLF') joined = joined.replace(/\n/g, '\r\n');
    return joined;
  }

  /* =========================================================
   * 公開
   * =======================================================*/

  var TateAlign = {
    charWidth: charWidth,
    displayWidth: displayWidth,
    displayWidthTabs: displayWidthTabs,
    majorityIndentWidth: majorityIndentWidth,
    normalizeIndentLines: normalizeIndentLines,
    parseSeparators: parseSeparators,
    splitLine: splitLine,
    splitComment: splitComment,
    findAssignEq: findAssignEq,
    findAnchors: findAnchors,
    detectMode: detectMode,
    detectLineEnding: detectLineEnding,
    format: format,
    resolveMode: function (text, mode) {
      return (mode === 'auto' || mode == null) ? detectMode(text) : mode;
    },
    resetSeparators: function () { return DEFAULT_SEPARATORS; },
    defaultOptions: defaultOptions,
    DEFAULT_SEPARATORS: DEFAULT_SEPARATORS
  };

  global.TateAlign = TateAlign;

  /* =========================================================
   * DOM 配線層(index.html 用)
   * document が無い(Node / tests.html で要素が無い)場合は何もしない
   * =======================================================*/

  if (typeof document === 'undefined') return;

  // 揃え型ごとの説明文と、実際にこのツールで整形した短い実例(v1.4)
  var MODE_LABEL = {
    code: 'コメント揃え',
    full: '全部揃え',
    paren: '関数・括弧揃え',
    table: '表揃え'
  };
  var MODE_DESC = {
    code: 'コード部分はそのままで、行末コメント(// # /*)の桁だけを揃えます。',
    full: '単語や = の列を揃えたうえで、コメント開始と */ まで揃えます。',
    paren: '( ) ; の桁を揃えます。関数名の長さが違う行を並べるときに。',
    table: '区切り欄に従って列を揃えます。Excel から貼った表など。'
  };
  var MODE_SAMPLE = {
    code: 'a = 1;    // 速度' + '\n' + 'bbb = 22; // 加速度',
    full: 'int  a   = 1;  // 速度' + '\n' + 'long bbb = 22; // 加速度',
    paren: 'strncpy(d, n   );' + '\n' + 'memcpy (d, s, n);',
    table: '名前       点数' + '\n' + '田中       90' + '\n' + 'Alexander  100'
  };

  function wireUp() {
    var input = document.getElementById('input');
    var output = document.getElementById('output');
    if (!input || !output) return; // index.html 以外(tests.html 等)

    var modeSel = document.getElementById('mode');
    var fillSpaceBtn = document.getElementById('fill-space');
    var fillTabBtn = document.getElementById('fill-tab');
    var gapInput = document.getElementById('gap');
    var tabWidthInput = document.getElementById('tabWidth');
    var alignEqInput = document.getElementById('alignEquals');
    var normIndentInput = document.getElementById('normalizeIndent');
    var sepInput = document.getElementById('separators');
    var sepField = document.getElementById('sep-field');
    var sepResetBtn = document.getElementById('sep-reset');
    var sepChips = document.querySelectorAll('[data-sep-chip]');
    var resetAllBtn = document.getElementById('reset-all');
    var lineEndingSel = document.getElementById('lineEnding');
    var copyBtn = document.getElementById('copy');
    var modeInfo = document.getElementById('mode-info');
    var modeHint = document.getElementById('mode-hint');
    var modeExample = document.getElementById('mode-example');
    var leInfo = document.getElementById('le-info');
    var tabNote = document.getElementById('tab-note');
    var gapField = document.getElementById('gap-field');

    var state = {
      fill: 'space',
      detectedLineEnding: 'LF',
      gapTouched: false, // ユーザーが手動でギャップを変えたか
      lastOutput: ''     // 改行コード適用済みの整形結果(textarea は LF に正規化するため別持ち)
    };

    function currentGapDefault(mode) {
      return (mode === 'code' || mode === 'full' || mode === 'paren') ? 1 : 2;
    }

    function readOptions() {
      return {
        mode: modeSel ? modeSel.value : 'auto',
        fill: state.fill,
        gap: gapInput ? parseInt(gapInput.value, 10) || 1 : 1,
        tabWidth: tabWidthInput ? parseInt(tabWidthInput.value, 10) || 4 : 4,
        alignEquals: alignEqInput ? alignEqInput.checked : true,
        normalizeIndent: normIndentInput ? normIndentInput.checked : false,
        separators: sepInput ? sepInput.value : DEFAULT_SEPARATORS,
        lineEnding: lineEndingSel ? lineEndingSel.value : 'auto',
        detectedLineEnding: state.detectedLineEnding
      };
    }

    function updateFillUI() {
      if (fillSpaceBtn) fillSpaceBtn.setAttribute('aria-pressed', state.fill === 'space');
      if (fillTabBtn) fillTabBtn.setAttribute('aria-pressed', state.fill === 'tab');
      var isTab = state.fill === 'tab';
      if (gapInput) gapInput.disabled = isTab;
      if (gapField) gapField.classList.toggle('disabled', isTab);
      if (tabNote) tabNote.hidden = !isTab;
    }

    function run() {
      try {
        var opts = readOptions();
        var resolvedMode = TateAlign.resolveMode(input.value, opts.mode);

        // モード追従のギャップ既定(ユーザー未変更時のみ)
        if (!state.gapTouched && gapInput) {
          gapInput.value = currentGapDefault(resolvedMode);
          opts.gap = currentGapDefault(resolvedMode);
        }

        // =揃えチェックはコードモード時のみ活性
        if (alignEqInput) alignEqInput.disabled = (resolvedMode !== 'code');

        // 関数・括弧揃えは区切り欄を使わないので無効化(ギャップはコメント間隔として有効)
        var sepDisabled = (resolvedMode === 'paren');
        if (sepInput) sepInput.disabled = sepDisabled;
        if (sepResetBtn) sepResetBtn.disabled = sepDisabled;
        for (var si = 0; si < sepChips.length; si++) sepChips[si].disabled = sepDisabled;
        if (sepField) sepField.classList.toggle('disabled', sepDisabled);

        state.lastOutput = TateAlign.format(input.value, opts);
        output.value = state.lastOutput;

        // 選択中(自動判定なら判定結果)の揃え型の説明と実例を出す
        if (modeHint) modeHint.textContent = MODE_DESC[resolvedMode] || '';
        if (modeExample) modeExample.textContent = MODE_SAMPLE[resolvedMode] || '';
        if (modeInfo) {
          modeInfo.textContent = (opts.mode === 'auto')
            ? '自動判定: ' + (MODE_LABEL[resolvedMode] || resolvedMode)
            : '';
        }
        if (leInfo) {
          leInfo.textContent = '改行コード検出: ' + state.detectedLineEnding;
        }
      } catch (err) {
        // 例外時はサイレントに固まらせず、モード表示欄にエラーを出す
        if (modeInfo) {
          modeInfo.textContent = 'エラー: ' + (err && err.message ? err.message : String(err));
        }
      }
    }

    // イベント配線
    input.addEventListener('input', run);
    input.addEventListener('paste', function (e) {
      try {
        var data = (e.clipboardData || window.clipboardData).getData('text');
        state.detectedLineEnding = TateAlign.detectLineEnding(data);
      } catch (err) { /* 取得不能時は既定 LF */ }
      setTimeout(run, 0);
    });

    if (modeSel) modeSel.addEventListener('change', run);
    if (gapInput) gapInput.addEventListener('input', function () { state.gapTouched = true; run(); });
    if (tabWidthInput) tabWidthInput.addEventListener('input', run);
    if (alignEqInput) alignEqInput.addEventListener('change', run);
    if (normIndentInput) normIndentInput.addEventListener('change', run);
    if (sepInput) sepInput.addEventListener('input', run);
    if (lineEndingSel) lineEndingSel.addEventListener('change', run);

    if (fillSpaceBtn) fillSpaceBtn.addEventListener('click', function () {
      state.fill = 'space'; updateFillUI(); run();
    });
    if (fillTabBtn) fillTabBtn.addEventListener('click', function () {
      state.fill = 'tab'; updateFillUI(); run();
    });

    if (sepResetBtn) sepResetBtn.addEventListener('click', function () {
      if (sepInput) sepInput.value = TateAlign.resetSeparators();
      run();
    });

    // 区切りチップ:欄末尾にトークンを追記(既に同トークンがあれば何もしない)
    function hasLiteralToken(tokens, text) {
      for (var i = 0; i < tokens.length; i++) {
        if (tokens[i].type === 'literal' && tokens[i].text === text) return true;
      }
      return false;
    }
    function addSepChip(literalText, appendText) {
      if (!sepInput) return;
      var tokens = TateAlign.parseSeparators(sepInput.value);
      if (hasLiteralToken(tokens, literalText)) return; // 既に同トークンあり
      var v = sepInput.value.replace(/\s+$/, '');
      // 末尾の裸カンマ(\, 以外)は取り除いて ,, の誤生成を防ぐ
      if (v.slice(-1) === ',' && v.slice(-2) !== '\\,') {
        v = v.slice(0, -1).replace(/\s+$/, '');
      }
      sepInput.value = (v === '') ? appendText : v + ',' + appendText;
      run();
    }
    for (var ci = 0; ci < sepChips.length; ci++) {
      (function (chip) {
        chip.addEventListener('click', function () {
          var lit = chip.getAttribute('data-sep-chip'); // 追加するリテラル文字
          var append = (lit === ',') ? '\\,' : lit;     // カンマは \, として追記
          addSepChip(lit, append);
        });
      })(sepChips[ci]);
    }

    // 「オプションをすべて既定に戻す」(入力テキストは消さない)
    if (resetAllBtn) resetAllBtn.addEventListener('click', function () {
      var d = TateAlign.defaultOptions();
      if (modeSel) modeSel.value = d.mode;
      state.fill = d.fill;
      state.gapTouched = false; // ギャップ手動フラグ解除(run() でモード既定に追従)
      if (gapInput) gapInput.value = d.gap;
      if (tabWidthInput) tabWidthInput.value = d.tabWidth;
      if (alignEqInput) alignEqInput.checked = d.alignEquals;
      if (normIndentInput) normIndentInput.checked = d.normalizeIndent;
      if (sepInput) sepInput.value = d.separators;
      if (lineEndingSel) lineEndingSel.value = d.lineEnding;
      updateFillUI();
      run();
    });

    if (copyBtn) copyBtn.addEventListener('click', function () {
      var text = state.lastOutput;
      var done = function () {
        var old = 'コピー';
        copyBtn.textContent = 'コピーしました ✓';
        setTimeout(function () { copyBtn.textContent = old; }, 1500);
      };
      // フォールバック(file:// や API 拒否時)。textarea 経由のため改行は LF になる
      var fallback = function () {
        try {
          output.focus();
          output.select();
          var ok = document.execCommand('copy');
          if (ok) done();
          else copyBtn.textContent = 'コピー失敗(手動でコピーしてください)';
        } catch (err) {
          copyBtn.textContent = 'コピー失敗(手動でコピーしてください)';
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }
    });

    updateFillUI();
    run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUp);
  } else {
    wireUp();
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);

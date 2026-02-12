export class WebModuleUI {
  constructor(builder) {
    this.builder = builder;
    this.ctx = builder.ctx;
  }



  /**
   * HTML文字列をパースして実際のDOM要素（Element）に変換する
   * @param {string} html - 生成したいHTMLリテラル
   * @returns {Element} 変換されたDOM要素の第一要素
   */
  // ---------------------------------------------------------------
  parseHtml(html) {
    return document.createRange().createContextualFragment(html).firstElementChild;
  }
  // ---------------------------------------------------------------



  /**
   * 編集（⚙）ボタンを生成する
   * クリック時にメインクラスの編集パネル展開メソッドを呼び出す
   * @param {Object} node - 対象のツリーノードデータ
   * @returns {Element} 編集ボタン要素
   */
  // ---------------------------------------------------------------
  createEditButton(node) {
    const html = `<button type="button" class="editBtn" title="編集" data-tree-ignore>⚙</button>`;
    const btn = this.parseHtml(html);
    btn.onclick = (e) => {
      e.stopPropagation();
      this.builder.openEditPanel(node);
    };
    return btn;
  }
  // ---------------------------------------------------------------



  /**
   * 削除（×）ボタンを生成する
   * クリック時にメインクラスの削除実行メソッドを呼び出す
   * @param {Object} node - 対象のツリーノードデータ
   * @returns {Element} 削除ボタン要素
   */
  // ---------------------------------------------------------------
  createDeleteButton(node) {
    const html = `<button type="button" class="deleteBtn" title="削除" data-tree-ignore>×</button>`;
    const btn = this.parseHtml(html);
    btn.onclick = (e) => {
      e.stopPropagation();
      this.builder.deleteModule(node.id);
    };
    return btn;
  }
  // ---------------------------------------------------------------



  /**
   * 新規モジュール追加用のセレクトボックス（＋）を生成する
   * 定義データ(ELEMENT_DEFS)から選択肢を自動生成する
   * @param {Object} node - 親となるツリーノードデータ
   * @returns {Element} セレクトボックス要素
   */
  // ---------------------------------------------------------------
  createAddRow(node) {
    const options = Object.entries(this.ctx.ELEMENT_DEFS)
      .map(([key, def]) => `<option value="${key}">${def.label}</option>`).join('');

    const html = `
      <select class="moduleAddBtn" data-tree-ignore>
        <option value="">＋</option>
        ${options}
      </select>`.trim();

    const select = this.parseHtml(html);
    select.onchange = (e) => {
      const defId = e.target.value;
      if (!defId) return;
      // builder（WebModuleBuilder）の addModule を呼び出す
      this.builder.addModule(defId, node ? node.id : null);
      e.target.value = ""; // 選択をリセット
    };
    return select;
  }
  // ---------------------------------------------------------------



  /**
   * 特定の構造（スロット）を持つノード向けに「ブロック追加ボタン」を生成する
   * @param {Object} node - 対象のツリーノードデータ
   * @returns {Element|DocumentFragment} ボタン要素、または対象外なら空のフラグメント
   */
  // ---------------------------------------------------------------
  createBlockAddBtn(node) {
    const html = `
      <div class="tree-block-add-wrap">
        <button type="button" class="blockAddBtn">+ ${node.label}を追加</button>
      </div>`;
    const btnWrap = this.parseHtml(html);
    btnWrap.querySelector('button').onclick = () => {
      this.builder.fastAddFrame(node); // Builderのデータ操作版を呼ぶ
    };
    return btnWrap;
  }
  // ---------------------------------------------------------------



  /**
   * 編集パネルの基本骨格を生成する
   * @param {Object} node - 対象ノード
   * @param {Array} styleDefs - スタイル定義リスト
   * @returns {Element} パネルのDOM
   */
  // ---------------------------------------------------------------
  createEditPanelBase(node) {
    const html = `
      <div class="edit-panel-content">
        <div class="panel-header">
          <h3 class="panel-title" style="margin: 0;">${this.escapeHtml(node.label)}</h3>
          <button type="button" class="close-edit-panel" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #888;">&times;</button>
        </div>
        
        <div id="content-specific-editor" class="spec-editor"></div>
        
        <hr class="panel-divider">

        <div id="active-props-list" class="props-list"></div>
      </div>`.trim();

    return this.parseHtml(html);
  }
  // ---------------------------------------------------------------



  /**
   * 編集用の入力行を生成する
   * @param {string} label - 表示名
   * @param {string} value - 現在の値
   * @param {Function} onInput - コールバック
   * @param {string} type - 'input' または 'text' (textarea)
   */
  // ---------------------------------------------------------------
  createEditFieldRow(label, value, onInput, type = 'text') {
    const isInput = type === 'input';
    const html = `
      <div class="edit-field-row">
        <label>${this.escapeHtml(label)}</label>
        ${isInput 
          ? `<input type="text" value="${this.escapeHtml(value || '')}" data-tree-ignore>`
          : `<textarea data-tree-ignore>${this.escapeHtml(value || '')}</textarea>`
        }
      </div>`.trim();

    const row = this.parseHtml(html);
    const field = row.querySelector(isInput ? 'input' : 'textarea');
    field.oninput = (e) => onInput(e.target.value);
    return row;
  }
  // ---------------------------------------------------------------



  /**
   * 文字列内のHTML特殊文字をエスケープして安全にする
   * @param {string} s - エスケープ対象の文字列
   * @returns {string} 安全に処理された文字列
   */
  // ---------------------------------------------------------------
  escapeHtml(s = "") {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }
  // ---------------------------------------------------------------



  /**
   * スタイル編集用の入力フィールドセット（数値+単位 または カラー）を生成する
   * @param {Object} item - スタイル定義
   * @param {string} fullVal - 初期値
   * @returns {Element} 入力項目のDOM要素
   */
  // ---------------------------------------------------------------
  /**
   * スタイル項目の入力行（ラベル + 入力欄 + 単位 + 削除ボタン）を生成する
   */
  createPropInputItem(item, fullVal = "") {
    // 1. 数値と単位の解析ロジック（元コードのロジックを継承）
    let numVal = "", unitVal = "px";
    if (fullVal) {
      if (item.type !== 'color' && item.type !== 'textarea') {
        const match = fullVal.match(/(-?\d+\.?\d*)(.*)/);
        if (match) { 
          numVal = match[1]; 
          unitVal = match[2] || "px"; 
        }
      }
    }

    const units = ['px', '%', 'rem', 'vh', 'vw', 'auto'];
    const unitOptions = units.map(u => `<option ${unitVal === u ? 'selected' : ''}>${u}</option>`).join('');

    // 2. HTMLの組み立て（★ここでラベル item.name を追加！）
    const html = `
      <div class="prop-input-item" data-p="${item.prop}">
        <div class="prop-header" style="display:flex; justify-content:space-between; align-items:center;">
          <span class="prop-label" style="font-size:11px; font-weight:bold; color:#444;">${item.name}</span>
          <button type="button" class="del-p" data-tree-ignore>×</button>
        </div>
        
        <div class="prop-body" style="margin-top:4px;">
          ${item.type === 'textarea' ? 
            `<textarea class="t-in" data-tree-ignore style="width:100%; height:80px; font-family:monospace; font-size:11px; padding:4px;">${fullVal}</textarea>` :
            (item.type === 'color' ? 
              `<input type="text" class="c-in" value="${fullVal || '#ffffff'}" placeholder="#ffffff" data-tree-ignore style="width:100%;">` : 
              `<input type="number" class="n-in" value="${numVal}" data-tree-ignore style="width:60px;">
               <select class="u-in" data-tree-ignore>${unitOptions}</select>`
            )
          }
        </div>
      </div>`.trim();

    const div = this.parseHtml(html);

    // 3. 値の取得ヘルパー（元の getValue ロジックを完全再現）
    div.getValue = () => {
      if (item.type === 'textarea') return div.querySelector('.t-in').value;
      if (item.type === 'color') return div.querySelector('.c-in').value;
      
      const n = div.querySelector('.n-in').value;
      const u = div.querySelector('.u-in').value;
      if (u === 'auto') return 'auto';
      return (n !== "") ? n + u : "";
    };

    return div;
  }
  // ---------------------------------------------------------------



  /**
   * HTMLエスケープ（安全のため）
   */
  escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }
  // ---------------------------------------------------------------



  /**
   * ツールバーを生成し、クリックイベントもここで紐付ける
   * @param {WebModuleBuilder} builder - メソッド呼び出し用のインスタンス
   */
  createToolbar(builder) {
    const html = `
      <div class="toolbar-inner">
        <div class="toolbar-group">
          <button type="button" id="export-btn" class="toolbar-btn">エクスポート</button>
          <button type="button" id="import-btn" class="toolbar-btn">インポート</button>
          <button type="button" id="clear-btn" class="toolbar-btn btn-danger">初期化</button>
        </div>
        
        <div class="toolbar-group">
          <label class="toggle-switch-inline">
            <input type="checkbox" id="preview-drag-toggle">
            <span class="toggle-slider"></span>
            <span class="toggle-label">プレビュー操作</span>
          </label>
        </div>
      </div>
    `.trim();

    const temp = document.createElement('div');
    temp.innerHTML = html;
    const toolbarEl = temp.firstElementChild;

    // トグルのイベント
    const toggle = toolbarEl.querySelector('#preview-drag-toggle');
    toggle.onchange = (e) => builder.togglePreviewDrag(e.target.checked);

    // 他のボタン
    toolbarEl.querySelector('#export-btn').onclick = () => builder.exportJSON();
    toolbarEl.querySelector('#import-btn').onclick = () => builder.importJSON();
    toolbarEl.querySelector('#clear-btn').onclick = () => builder.clearLocalStorage();

    return toolbarEl;
  }
  // ---------------------------------------------------------------


} 
import Sortable from 'sortablejs';
import { WebModuleLogic } from './WebModuleLogic';
import { WebModuleUI } from './WebModuleUI';

export class WebModuleBuilder {
  constructor(options) {
    this.ctx = { ...options, LABELS: options.CONFIG.LABELS };
    this.logic = new WebModuleLogic(this.ctx);
    this.ui = new WebModuleUI(this);
    
    // マスターデータ（JSON）。この配列がページのすべてを決定します。
    this.data = []; 

    this.previewDragEnabled = false;
    this.historyStack = [];
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }


  /**
   * ビルダーの初期化
   */
  init() {
    this.renderToolbar(); 
    const previewRoot = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    
    // ★修正：まずローカルストレージからの読み込みを試みる
    const hasSavedData = this.loadFromLocalStorage();

    // 保存データがなかった場合のみ、既存のHTMLから読み込む
    if (!hasSavedData && previewRoot && previewRoot.children.length > 0) {
      this.data = this.logic.buildModuleTree(previewRoot);
    }

    this.syncView();
    window.addEventListener('keydown', this.handleKeyDown);
  }
  // ---------------------------------------------------------------



  /**
   * ツールバーのボタンをJSで生成して配置する
   */
  renderToolbar() {
    const toolbar = document.getElementById('builder-toolbar');
    if (!toolbar) return;

    toolbar.innerHTML = ""; // 初期化

    // 1. エクスポートボタン
    const exportBtn = document.createElement('button');
    exportBtn.id = "export-btn";
    exportBtn.textContent = "エクスポート";
    exportBtn.onclick = () => this.exportJSON();

    // 2. インポートボタン
    const importBtn = document.createElement('button');
    importBtn.id = "import-btn";
    importBtn.textContent = "インポート";
    importBtn.onclick = () => this.importJSON();

    // 3. 保存データ削除（リセット）ボタン
    const clearBtn = document.createElement('button');
    clearBtn.id = "clear-btn";
    clearBtn.textContent = "初期化";
    clearBtn.className = "btn-danger"; // 赤色にするなどのクラス
    clearBtn.onclick = () => this.clearLocalStorage();

    // まとめてツールバーに追加
    toolbar.appendChild(exportBtn);
    toolbar.appendChild(importBtn);
    toolbar.appendChild(clearBtn);
  }
  // ---------------------------------------------------------------



  /**
   * JSONデータ（this.data）を元に、プレビューDOMとサイドバーを一斉更新する
   */
  syncView(treeData = null) {
    const previewRoot = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    if (!previewRoot) return;

    if (treeData) {
      this.data = JSON.parse(JSON.stringify(treeData));
    } else if (this.data.length === 0) {
      // 本当に空の時だけDOMから吸い上げる
      this.data = this.logic.buildModuleTree(previewRoot);
    }

    previewRoot.innerHTML = "";
    this.data.forEach(node => {
      const el = this.renderNode(node);
      if (el) previewRoot.appendChild(el);
    });

    this.renderSidebar(this.data);

    // ★追加：データが更新されるたびにローカルストレージに保存
    this.saveToLocalStorage();

    this.initPreviewSortable();
  }
  // ---------------------------------------------------------------



  /**
   * JSONデータから実DOM（プレビュー用）を生成する
   */
  renderNode(nodeData, parentDef = null) {
    // 1. structure-box（グリッドの枠など）の描画
    if (nodeData.type === 'structure-box') {
      let wrapper;
      if (parentDef) {
        const temp = document.createElement('div');
        temp.innerHTML = parentDef.template;
        const dzTemplate = temp.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`);
        if (dzTemplate) wrapper = dzTemplate.cloneNode(false);
      }
      if (!wrapper) wrapper = document.createElement('div');
      wrapper.setAttribute(this.ctx.CONFIG.ATTRIBUTES.TREE_ID, nodeData.id);
      if (nodeData.children) {
        nodeData.children.forEach(child => {
          const childDom = this.renderNode(child);
          if (childDom) wrapper.appendChild(childDom);
        });
      }
      return wrapper;
    }

    // 2. 通常モジュールの描画
    const def = this.ctx.ELEMENT_DEFS[nodeData.type];
    if (!def) return null;

    let html = def.template.replace(/\$tag/g, def.tag);
    const attrs = nodeData.attrs || {};

    // --- 連想配列 schema に基づき、$変数（$grid, $html等）を一括置換 ---
    if (def.schema) {
      Object.entries(def.schema).forEach(([key, config]) => {
        if (config.isContent) {
          // $html 等のタグ内テキストの置換
          const val = (nodeData.content !== undefined && nodeData.content !== "") 
                      ? nodeData.content : config.default;
          html = html.split(`$${key}`).join(val);
        } else {
          // $src, $href, $grid 等の属性値の置換
          const val = (attrs[key] !== undefined && attrs[key] !== "") 
                      ? attrs[key] : config.default;
          html = html.split(`$${key}`).join(val);
        }
      });
    }

    const finalTemp = document.createElement('div');
    finalTemp.innerHTML = html.trim();
    const el = finalTemp.firstElementChild;

    // --- 【追加】プレビュー用ドラッグハンドルの挿入 ---
    // structure-box（枠）以外にはハンドルを付ける
    if (nodeData.type !== 'structure-box') {
      const handle = document.createElement('div');
      handle.className = 'preview-drag-handle';
      handle.innerHTML = '≡'; // 3本線
      el.appendChild(handle);
      el.classList.add('is-preview-draggable');
    }

    // --- スタイルの復元 ---
    if (nodeData.styles) {
      const pref = nodeData.type?.startsWith('m-') ? "module" : "layout";
      Object.keys(nodeData.styles).forEach(prop => {
        el.style.setProperty(`--${pref}-${prop}`, nodeData.styles[prop]);
      });
    }

    el.setAttribute(this.ctx.CONFIG.ATTRIBUTES.TREE_ID, nodeData.id);
    el.setAttribute(this.ctx.CONFIG.ATTRIBUTES.MODULE, nodeData.type);

    // 3. 入れ子（子要素）の描画
    const dzAttr = this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE;
    const dz = el.hasAttribute(dzAttr) ? el : el.querySelector(`[${dzAttr}]`);
    if (dz) {
      dz.innerHTML = "";
      if (nodeData.children && nodeData.children.length > 0) {
        nodeData.children.forEach(childData => {
          const childDom = this.renderNode(childData, def);
          if (childDom) {
            if (dz === el) { el.appendChild(childDom); } 
            else { dz.parentElement.appendChild(childDom); }
          }
        });
        if (dz !== el) dz.remove();
      }
    }
    return el;
  }
  // ---------------------------------------------------------------



  /**
   * モジュール追加時の初期データ（JSON）を生成する
   */
  createInitialData(defId) {
    const def = this.ctx.ELEMENT_DEFS[defId];
    if (!def) return null;

    // テンプレートから初期ラベルを抽出（data-tree-view があればその初期値を採用）
    const temp = document.createElement('div');
    temp.innerHTML = def.template;
    const treeViewEl = temp.querySelector('[data-tree-view]');
    
    let initialLabel = def.label;
    if (treeViewEl) {
      // $html などの変数を、data-edit の初期値で置換してラベルにする
      const editConf = treeViewEl.getAttribute('data-edit');
      if (editConf && editConf.includes('html:')) {
        const parts = editConf.split(';').find(c => c.trim().startsWith('html:')).split(':');
        initialLabel = parts.slice(2).join(':') || def.label;
      }
    }

    const newNode = {
      id: "id-" + Math.random().toString(36).slice(2, 11),
      type: defId,
      label: initialLabel, // ここで動的なラベルをセット
      children: [],
      isStructure: def.template.includes(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE)
    };

    // 構造体（コンテナ）の場合の処理
    const dzEl = temp.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`);
    if (dzEl) {
      const dzNode = {
        id: "id-" + Math.random().toString(36).slice(2, 11),
        type: 'structure-box',
        label: dzEl.getAttribute(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE) || "枠",
        isStructure: true,
        children: [this.createInitialData('m-text01')] // 初期テキスト
      };
      newNode.children.push(dzNode);
    }

    return newNode;
  }
  // ---------------------------------------------------------------



  /**
   * 指定した場所に新しいモジュールを追加する（データ操作版）
   */
  addNewModule(node, defId) {
    // 1. 再帰的に初期データ（JSON）を作成
    const newNode = this.createInitialData(defId);
    if (!newNode) return;

    if (!node) {
      // ルートに追加
      this.data.push(newNode);
    } else {
      // 特定の親ノードを探して children に追加
      const parentNode = this.logic.findNodeById(this.data, node.id);
      if (parentNode) {
        // 親が children を持てる構造か確認（念のため）
        if (!parentNode.children) parentNode.children = [];
        parentNode.children.push(newNode);
      }
    }

    // 2. データを更新したので再描画
    this.syncView();
  }
  // ---------------------------------------------------------------



  /**
   * JSONデータからノードを削除する
   */
  deleteModule(id) {
    if (!confirm("削除しますか？")) return;

    const removeFromTree = (list, targetId) => {
      const index = list.findIndex(item => item.id === targetId);
      if (index !== -1) {
        list.splice(index, 1);
        return true;
      }
      return list.some(item => item.children && removeFromTree(item.children, targetId));
    };

    if (removeFromTree(this.data, id)) {
      this.syncView();
    }
  }
  // ---------------------------------------------------------------



  /**
   * グリッドなどの枠を1つ増やす（データ操作版）
   */
  fastAddFrame(node) {
    const parentNode = this.logic.findNodeById(this.data, node.id);
    const def = this.ctx.ELEMENT_DEFS[parentNode.type];
    
    // テンプレートからドロップゾーンの情報を再取得
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = def.template;
    const dzEl = tempDiv.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`);

    const newDZNode = {
      id: "id-" + Math.random().toString(36).slice(2, 11),
      type: 'structure-box',
      label: dzEl ? dzEl.getAttribute(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE) : "枠",
      isStructure: true,
      children: []
    };

    // 枠の中にデフォルトモジュールを入れる
    const childModule = this.createInitialData(def.default);
    if (childModule) newDZNode.children.push(childModule);

    parentNode.children.push(newDZNode);
    this.syncView();
  }
  // ---------------------------------------------------------------



  /**
   * 並び替えライブラリ(SortableJS)を初期化する
   * @param {Element} ul - 対象のリックリスト要素
   */
  // ---------------------------------------------------------------
  initSortable(ul) {
    new Sortable(ul, {
      group: {
        name: 'nested',
        put: (to) => {
          // 1. ルート判定の修正（?. を使い、存在しない場合にエラーにならないようにする）
          // もし親要素が data-target="treeDisplay" を持っているならルートとして許可
          const isRoot = to.el.parentElement?.getAttribute('data-target') === 'treeDisplay';
          if (isRoot) return true;

          // 2. ドロップゾーン（枠）判定
          // 自分が入ろうとしているリスト(ul)の親である li を取得
          const parentLi = to.el.closest('.tree-item');
          if (parentLi) {
            const id = parentLi.getAttribute('data-id');
            const node = this.logic.findNodeById(this.data, id);
            
            // そのノードが 'structure-box' (ドロップゾーン) なら許可
            return node && node.type === 'structure-box';
          }

          return false;
        }
      },
      animation: 150,
      handle: '.drag-handle',
      fallbackOnBody: true,
      swapThreshold: 0.65,
      // フィルターでボタン類をドラッグ対象外にする
      filter: '.moduleAddBtn, .editBtn, .deleteBtn, .blockAddBtn',
      preventOnFilter: false,
      onEnd: (evt) => {
        const { item, from, to, newIndex } = evt;
        const targetId = item.getAttribute('data-id');
        const fromId = from.closest('.tree-item')?.getAttribute('data-id') || null;
        const toId = to.closest('.tree-item')?.getAttribute('data-id') || null;

        this.moveDataNode(targetId, fromId, toId, newIndex);
        this.syncView();
      }
    });
  }
  // ---------------------------------------------------------------




  /**
   * プレビューDOM側の並び替えを有効にする
   */
  initPreviewSortable() {
    // ドラッグ無効時は何もしない
    if (!this.previewDragEnabled) return;

    const previewRoot = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    if (!previewRoot) return;

    // ルートと全ドロップゾーンを対象にする
    const containers = [
      previewRoot,
      ...Array.from(document.querySelectorAll(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`))
    ];

    containers.forEach(container => {
      // 既存のインスタンスがあれば一旦破棄してクリーンにする（重複バインド防止）
      if (container._sortableInstance) {
        container._sortableInstance.destroy();
      }

      container._sortableInstance = new Sortable(container, {
        // グループ設定をオブジェクト形式にし、pull/putを明示する
        group: {
          name: 'preview-nested',
          pull: true, // 他のリストへ出せる
          put: true   // 他のリストから受け取れる（これがルート移動に必須）
        },
        animation: 150,
        handle: '.preview-drag-handle',
        fallbackOnBody: true,
        swapThreshold: 0.65,
        invertSwap: true, // 階層間の移動をスムーズにする

        onEnd: (evt) => {
          const { item, from, to, newIndex } = evt;
          const treeIdAttr = this.ctx.CONFIG.ATTRIBUTES.TREE_ID;
          const targetId = item.getAttribute(treeIdAttr);
          
          // --- 親ID判定のロジックを修正 ---
          // to（ドロップ先）が previewRoot そのものならルート（null）
          // それ以外なら、一番近い TREE_ID を持つ要素からIDを取得
          const toId = (to === previewRoot) 
            ? null 
            : to.closest(`[${treeIdAttr}]`)?.getAttribute(treeIdAttr);

          const fromId = (from === previewRoot) 
            ? null 
            : from.closest(`[${treeIdAttr}]`)?.getAttribute(treeIdAttr);

          // データを移動
          this.moveDataNode(targetId, fromId, toId, newIndex);
          // 再描画
          this.syncView();
        }
      });
    });
  }
  // ---------------------------------------------------------------




  /**
   * キーボード操作（Undoなど）を管理する
   * @param {Event} e - キーボードイベント
   */
  // ---------------------------------------------------------------
  handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      if (this.historyStack.length > 1) {
        // 現在の状態を捨てて、一つ前のデータを復元
        this.historyStack.pop();
        const prevData = this.historyStack[this.historyStack.length - 1];
        
        // applyNewOrder を使わず、データから再描画
        this.syncView(prevData);
      }
    }
  }
  // ---------------------------------------------------------------



  /**
   * 編集パネル（スタイル・テキスト）を開き、入力をマウントする
   * @param {Object} node - 対象のツリーノードデータ
   */
  openEditPanel(node) {
    const masterNode = this.logic.findNodeById(this.data, node.id);
    const container = document.querySelector(this.ctx.CONFIG.SELECTORS.STYLE_PANEL_INNER);
    const styleBlock = document.querySelector(this.ctx.CONFIG.SELECTORS.STYLE_BLOCK);
    if (!masterNode || !container || !styleBlock) return;

    styleBlock.classList.remove('is-hidden');
    container.innerHTML = "";
    const panelBase = this.ui.createEditPanelBase(masterNode, this.ctx.STYLE_DEFS);
    container.appendChild(panelBase);

    const def = this.ctx.ELEMENT_DEFS[masterNode.type];
    const specWrap = panelBase.querySelector('#content-specific-editor');
    if (!def || !specWrap) return;

    // --- schema を回して編集フィールドを一括生成 ---
    if (def.schema) {
      Object.entries(def.schema).forEach(([key, config]) => {
        // データの初期化
        if (config.isContent) {
          if (masterNode.content === undefined) masterNode.content = config.default;
        } else {
          if (!masterNode.attrs) masterNode.attrs = {};
          if (masterNode.attrs[key] === undefined) masterNode.attrs[key] = config.default;
        }

        const currentVal = config.isContent ? masterNode.content : masterNode.attrs[key];

        // フィールド生成（text, radio, checkbox 等）
        const field = this.createAdvancedField(
          config.label, 
          key, 
          config.type, 
          currentVal, 
          config.options || [], 
          (newVal) => {
            if (config.isContent) {
              masterNode.content = newVal;
              // ツリー表示用ラベルの更新
              masterNode.label = newVal || def.label;
            } else {
              masterNode.attrs[key] = newVal;
            }
            this.syncView();
          }
        );
        specWrap.appendChild(field);
      });
    }

    // --- C. スタイル編集（既存通り） ---
    const targetDom = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
    if (targetDom) {
      const propsList = panelBase.querySelector('#active-props-list');
      const pref = masterNode.type?.startsWith('m-') ? "module" : "layout";
      this.ctx.STYLE_DEFS.forEach(sDef => {
        const regex = new RegExp(`--${pref}-${sDef.prop}\\s*:\\s*([^;]+)`);
        const m = (targetDom.getAttribute('style') || "").match(regex);
        if (m) this.addPropInput(sDef, propsList, node.id, m[1].trim());
      });
      panelBase.querySelector('#prop-selector').onchange = (e) => {
        if (!e.target.value) return;
        this.addPropInput(JSON.parse(e.target.value), propsList, node.id);
        e.target.value = "";
      };
    }
  }
  // ---------------------------------------------------------------





  /**
   * 各種UIパーツ生成ヘルパー
   */
  createAdvancedField(label, key, type, currentVal, options, onChange) {
    const row = document.createElement('div');
    row.className = 'edit-field-row';
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const wrap = document.createElement('div');
    wrap.className = 'field-input-wrap';

    // 1. ラジオボタン（単一選択）
    if (type === 'radio') {
      const groupName = `radio-${key}-${Math.random().toString(36).slice(2, 7)}`;
      options.forEach(opt => {
        const l = document.createElement('label');
        l.className = 'radio-label';
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = groupName;
        r.value = opt.value;
        r.checked = (String(opt.value) === String(currentVal));
        r.onchange = () => onChange(opt.value);
        l.appendChild(r);
        l.append(opt.label);
        wrap.appendChild(l);
      });
    } 
    // 2. チェックボックス（多項選択：複数チェック可）
    else if (type === 'checkbox') {
      const selectedValues = currentVal ? String(currentVal).split(',') : [];
      options.forEach(opt => {
        const l = document.createElement('label');
        l.className = 'checkbox-label';
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.value = opt.value;
        c.checked = selectedValues.includes(String(opt.value));
        c.onchange = () => {
          const checkedNodes = wrap.querySelectorAll('input[type="checkbox"]:checked');
          const newVals = Array.from(checkedNodes).map(input => input.value);
          onChange(newVals.join(','));
        };
        l.appendChild(c);
        l.append(opt.label);
        wrap.appendChild(l);
      });
    }
    // 3. トグル（単一オンオフ：スイッチ形式）
    else if (type === 'toggle') {
      const onData = options[0] || { label: "ON", value: "true" };
      const offData = options[1] || { label: "OFF", value: "false" };

      const l = document.createElement('label');
      l.className = 'toggle-switch'; // CSSでスイッチ風に装飾することを想定
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = (String(currentVal) === String(onData.value));
      
      const statusLabel = document.createElement('span');
      statusLabel.className = 'toggle-label';
      statusLabel.textContent = c.checked ? onData.label : offData.label;

      c.onchange = (e) => {
        const isChecked = e.target.checked;
        statusLabel.textContent = isChecked ? onData.label : offData.label;
        onChange(isChecked ? onData.value : offData.value);
      };

      l.appendChild(c);
      l.appendChild(statusLabel);
      wrap.appendChild(l);
    }
    // 4. その他（text, textarea等）
    else {
      const i = document.createElement(type === 'textarea' ? 'textarea' : 'input');
      if (type !== 'textarea') i.type = type;
      i.value = currentVal;
      i.oninput = (e) => onChange(e.target.value);
      wrap.appendChild(i);
    }

    row.appendChild(wrap);
    return row;
  }
  // ---------------------------------------------------------------




  /**
   * サイドバーのHTMLを生成・描画し、各種UI部品をマウントする
   * @param {Array} tree - 描画対象のツリーデータ
   */
  renderSidebar(tree) {
    const displayInner = document.querySelector(this.ctx.CONFIG.SELECTORS.TREE_DISPLAY_INNER);
    if (!displayInner) return;

    displayInner.innerHTML = "";
    displayInner.appendChild(this.ui.createAddRow(null)); // ルート用

    const toHtml = (node) => {
      const id = this.ui.escapeHtml(node.id);
      const isStrBox = node.type === 'structure-box';
      const canHaveChildren = node.isStructure || isStrBox;
      
      return `
        <li data-id="${id}" class="tree-item">
          <div class="parent${isStrBox ? " no-drag structure-row" : ""}" data-row-id="${id}">
            ${!isStrBox ? `<span class="drag-handle">≡</span>` : ""}
            <span class="label-text">${isStrBox ? `[${this.ui.escapeHtml(node.label)}]` : this.ui.escapeHtml(node.label)}</span>
            
            <div class="row-controls">
              <div class="manage-controls" data-manage-for="${id}">
                <div class="add-controls" data-add-for="${id}"></div>
              </div>
            </div>
          </div>

          <ul class="sortable-list">
            ${node.children?.map(toHtml).join("") ?? ""}
          </ul>

          ${/* グリッドセット自体などのコンテナ系に「枠追加ボタン」を出すスロット */
            (node.type !== 'structure-box' && this.ctx.ELEMENT_DEFS[node.type]?.template.includes(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE)) 
            ? `<div data-blockadd-for="${id}"></div>` 
            : ""
          }
        </li>`.trim();
    };

    displayInner.insertAdjacentHTML("beforeend", `<ul class="sortable-list">${tree.map(toHtml).join("")}</ul>`);

    // --- ボタンのマウント ---
    displayInner.querySelectorAll('.tree-item').forEach(li => {
      const id = li.getAttribute('data-id');
      const node = this.logic.findNodeById(tree, id);
      if (!node) return;

      const mSlot = li.querySelector(`[data-manage-for="${id}"]`);
      if (mSlot) {
        // 枠（structure-box）には削除ボタンだけ、通常モジュールには編集・削除
        if (! (node.type === 'structure-box')) mSlot.appendChild(this.ui.createEditButton(node));
        mSlot.appendChild(this.ui.createDeleteButton(node));
      }

      // 【修正ポイント】枠（structure-box）にも「＋」ボタンを確実に出す
      const addSlot = li.querySelector(`[data-add-for="${id}"]`);
      if (addSlot && (node.isStructure || node.type === 'structure-box')) {
        addSlot.appendChild(this.ui.createAddRow(node));
      }
    });

    // 「+ 枠を追加」ボタンの描画
    displayInner.querySelectorAll("[data-blockadd-for]").forEach(slot => {
        const id = slot.getAttribute("data-blockadd-for");
        const node = this.logic.findNodeById(tree, id);
        if (node) {
          const def = this.ctx.ELEMENT_DEFS[node.type];
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = def.template;
          const dz = tempDiv.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`);
          const label = dz ? dz.getAttribute(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE) : "枠";

          const btnContainer = this.ui.parseHtml(`
            <div class="tree-block-add-wrap">
              <button type="button" class="blockAddBtn">+ ${label}を追加</button>
            </div>
          `);
          btnContainer.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            this.addStructure(node.id, label);
          };
          slot.replaceWith(btnContainer);
        }
    });

    displayInner.querySelectorAll("ul.sortable-list").forEach(ul => this.initSortable(ul));
    this.bindHoverEvents(displayInner);
  }




  /**
   * スタイル編集用の入力フィールドを生成・管理する
   * @param {Object} item - スタイル定義(STYLE_DEFS)
   * @param {Element} parent - 挿入先のDOMコンテナ
   * @param {string} targetId - 操作対象のモジュールID
   * @param {string} fullVal - 既存の値（あれば）
   */
  // ---------------------------------------------------------------
  addPropInput(item, parent, targetId, fullVal = "") {
    if (parent.querySelector(`[data-p="${item.prop}"]`)) return;
    
    const propItem = this.ui.createPropInputItem(item, fullVal);
    const targetEl = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${targetId}"]`);
    const masterNode = this.logic.findNodeById(this.data, targetId);

    const updateStyles = () => {
      if (!masterNode) return;
      const val = propItem.getValue();
      const pref = masterNode.type?.startsWith('m-') ? "module" : "layout";
      
      // 実DOMに反映
      if (targetEl) {
        targetEl.style.setProperty(`--${pref}-${item.prop}`, val);
      }
      
      // JSONデータ（styles枠）に保存
      if (!masterNode.styles) masterNode.styles = {};
      masterNode.styles[item.prop] = val;
    };

    // 削除時の処理
    propItem.querySelector('.del-p').onclick = () => {
      if (masterNode) {
        const pref = masterNode.type?.startsWith('m-') ? "module" : "layout";
        if (targetEl) targetEl.style.removeProperty(`--${pref}-${item.prop}`);
        if (masterNode.styles) delete masterNode.styles[item.prop];
      }
      propItem.remove();
    };

    propItem.querySelectorAll('input, select').forEach(el => el.oninput = updateStyles);
    parent.appendChild(propItem);
  }
  // ---------------------------------------------------------------



  /**
   * サイドバーと実DOM間のホバーイベントを同期する
   * @param {Element} parent - イベントを監視する親要素
   */
  // ---------------------------------------------------------------
  bindHoverEvents(parent) {
    if (parent._hoverBound) return;
    parent._hoverBound = true;

    parent.addEventListener("mouseover", (e) => {
      const row = e.target.closest("[data-row-id]");
      if (row) this.handleHover(row.getAttribute("data-row-id"), true);
    });

    parent.addEventListener("mouseout", (e) => {
      const row = e.target.closest("[data-row-id]");
      if (row) this.handleHover(row.getAttribute("data-row-id"), false);
    });
  }
  // ---------------------------------------------------------------



  /**
   * 実DOMの要素にホバー属性を付与/削除する
   * @param {string} id - 対象のID
   * @param {boolean} active - ホバー中かどうか
   */
  // ---------------------------------------------------------------
  handleHover(id, active) {
    const el = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${id}"]`);
    if (el) {
      el.setAttribute('data-tree-hover', active ? 'true' : 'false');
    }
  }
  // ---------------------------------------------------------------



  /**
   * JSONツリー内のノードを移動させる（データ操作）
   */
  moveDataNode(targetId, fromId, toId, newIndex) {
    let movedNode = null;

    // 1. 移動元からノードを削除して取得
    const removeNode = (list) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === targetId) {
          movedNode = list.splice(i, 1)[0];
          return true;
        }
        if (list[i].children && removeNode(list[i].children)) return true;
      }
      return false;
    };

    // 2. 移動先（親ノード）のchildren配列に挿入
    const insertNode = (list, parentId) => {
      if (!parentId) { // ルート直下への移動
        list.splice(newIndex, 0, movedNode);
        return true;
      }
      for (let node of list) {
        if (node.id === parentId) {
          if (!node.children) node.children = [];
          node.children.splice(newIndex, 0, movedNode);
          return true;
        }
        if (node.children && insertNode(node.children, parentId)) return true;
      }
      return false;
    };

    removeNode(this.data);
    if (movedNode) {
      insertNode(this.data, toId);
    }
  }
  // ---------------------------------------------------------------



  /**
   * モジュールをデータに追加し、プレビューとサイドバーを更新する
   * @param {string} defId - モジュール定義のID (m-text01等)
   * @param {string|null} parentId - 追加先の親ノードのID。nullの場合はルートへ。
   */
  addModule(defId, parentId = null) {
    // 1. 新しいノードのJSONデータを生成
    const newNode = this.createInitialData(defId);
    if (!newNode) return;

    if (!parentId) {
      // ルート（最上位）に追加
      if (!this.data) this.data = [];
      this.data.push(newNode);
    } else {
      // 特定の親（グリッドの枠など）の中に追加
      const parentNode = this.logic.findNodeById(this.data, parentId);
      if (parentNode) {
        if (!parentNode.children) parentNode.children = [];
        parentNode.children.push(newNode);
      }
    }

    // 2. データが更新されたので、一斉再描画（プレビュー・サイドバー両方）
    this.syncView();
  }
  // ---------------------------------------------------------------



  /**
   * 構造（グリッド枠やリスト項目など）をデータに追加する
   * @param {string} parentId - 親（グリッドセット等）のID
   * @param {string} label - 表示ラベル（"グリッド" または "リスト"）
   */
  addStructure(parentId, label) {
    const parentNode = this.logic.findNodeById(this.data, parentId);
    if (!parentNode) return;

    // 1. 新しい枠を作成
    const newStructure = {
      id: "id-" + Math.random().toString(36).slice(2, 11),
      type: 'structure-box',
      label: label,
      children: [],
      isStructure: true
    };

    // 2. 【修正】初期モジュールを強制的に入れる
    // 本来は定義から取得すべきですが、現状の ELEMENT_DEFS に合わせ、
    // 確実に存在する 'm-text01' を初期モジュールとして生成して挿入します。
    const defaultModuleId = 'm-text01'; 
    const childModule = this.createInitialData(defaultModuleId);
    if (childModule) {
      newStructure.children.push(childModule);
    }

    // 3. 親の children 配列に追加
    if (!parentNode.children) parentNode.children = [];
    parentNode.children.push(newStructure);

    // 4. 再描画
    this.syncView();
  }
  // ---------------------------------------------------------------




  /**
   * 現在のデータをJSONファイルとしてダウンロードする
   */
  exportJSON() {
    const jsonString = JSON.stringify(this.data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `web-module-data-${new Date().getTime()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }
  // ---------------------------------------------------------------




  /**
   * 設定されたスタイルをCSS変数としてエクスポートする
   */
  renderToolbar() {
    const toolbarContainer = document.getElementById('builder-toolbar');
    if (!toolbarContainer) return;

    toolbarContainer.innerHTML = ""; // 一旦クリア
    
    // UIクラスに builder インスタンスを渡して、完成した要素をもらう
    const toolbarEl = this.ui.createToolbar(this);
    toolbarContainer.appendChild(toolbarEl);
  }
  // ---------------------------------------------------------------


  

  /**
   * JSONファイルを選択してデータを復元する
   */
  importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          
          if (confirm('現在の内容が上書きされます。よろしいですか？')) {
            // マスターデータを更新
            this.data = importedData;
            // 履歴（Undo用）に保存
            this.historyStack.push(JSON.parse(JSON.stringify(this.data)));
            // 画面を再描画
            this.syncView();
          }
        } catch (err) {
          alert('JSONの解析に失敗しました。正しい形式のファイルを選択してください。');
        }
      };
      reader.readAsText(file);
    };
    
    input.click();
  }
  // ---------------------------------------------------------------

  


  /**
   * データをブラウザの localStorage に保存する
   */
  saveToLocalStorage() {
    const dataString = JSON.stringify(this.data);
    localStorage.setItem('web_module_builder_data', dataString);
    console.log('データをローカルに保存しました');
  }
  // ---------------------------------------------------------------




  /**
   * localStorage からデータを復元する
   */
  loadFromLocalStorage() {
    const savedData = localStorage.getItem('web_module_builder_data');
    if (savedData) {
      try {
        this.data = JSON.parse(savedData);
        this.syncView();
        return true;
      } catch (e) {
        console.error("データの復元に失敗しました", e);
      }
    }
    return false;
  }
  // ---------------------------------------------------------------




  /**
   * 保存されているデータを削除してリセットする
   */
  clearLocalStorage() {
    if (confirm("保存されているデータをすべて削除して初期化しますか？")) {
      localStorage.removeItem('web_module_builder_data');
      location.reload(); // リロードして初期状態に戻す
    }
  }
  // ---------------------------------------------------------------



  /**
   * プレビューのドラッグ有効・無効を切り替える
   */
  togglePreviewDrag(enabled) {
    this.previewDragEnabled = enabled;
    
    // プレビュー全体にクラスを付与/削除（CSSでの表示切り替え用）
    const container = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    if (container) {
      container.classList.toggle('drag-enabled', enabled);
    }

    // Sortableの有効化・無効化を制御
    this.syncView(); 
  }
  // ---------------------------------------------------------------

}


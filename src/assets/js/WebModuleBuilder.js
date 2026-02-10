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
    
    this.historyStack = [];
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }


  /**
   * ビルダーの初期化
   */
  init() {
    const previewRoot = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    
    // 既存のHTMLを一度だけJSONデータに変換してマスターデータとする
    if (previewRoot && previewRoot.children.length > 0) {
      this.data = this.logic.buildModuleTree(previewRoot);
    }

    this.syncView();
    window.addEventListener('keydown', this.handleKeyDown);
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

    // --- 【新機能】$data:属性名:ラベル:初期値 の置換処理 ---
    const dataRegex = /\$data:([\w-]+):([^:]+):([\w-]+):([^:">]+)(?::\[([^\]]+)\])?/g;
    html = html.replace(dataRegex, (match, key, label, type, defaultVal) => {
      return (attrs[key] !== undefined && attrs[key] !== "") ? attrs[key] : defaultVal;
    });

    // --- data-edit属性に基づく初期値解析 (URLコロン対策済み) ---
    const parser = document.createElement('div');
    parser.innerHTML = html;
    const defaults = {};
    parser.querySelectorAll('[data-edit]').forEach(el => {
      el.getAttribute('data-edit').split(';').forEach(conf => {
        const parts = conf.split(':').map(s => s.trim());
        if (parts.length >= 3) {
          defaults[parts[0]] = parts.slice(2).join(':'); // URLなどのコロンを維持
        }
      });
    });

    // テキスト内容($html)の置換
    const content = (nodeData.content !== undefined && nodeData.content !== "") ? nodeData.content : (defaults['html'] || "");
    html = html.split('$html').join(content);

    // 属性($src, $href, $alt)の置換
    ['src', 'href', 'alt'].forEach(key => {
      const val = (attrs[key] !== undefined && attrs[key] !== "") ? attrs[key] : (defaults[key] || "");
      html = html.split(`$${key}`).join(val);
    });

    const finalTemp = document.createElement('div');
    finalTemp.innerHTML = html.trim();
    const el = finalTemp.firstElementChild;
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

    // --- A. data-edit（html, src等）の解析 ---
    const temp = document.createElement('div');
    temp.innerHTML = def.template;
    temp.querySelectorAll('[data-edit]').forEach(el => {
      el.getAttribute('data-edit').split(';').forEach(conf => {
        const parts = conf.split(':').map(s => s.trim());
        const key = parts[0], label = parts[1];
        const defaultVal = parts.slice(2).join(':');

        if (key === 'html') {
          if (masterNode.content === undefined) masterNode.content = defaultVal;
          specWrap.appendChild(this.ui.createEditFieldRow(label, masterNode.content, (v) => {
            masterNode.content = v;
            if (temp.querySelector('[data-tree-view]')) masterNode.label = v || def.label;
            this.syncView();
          }, 'text'));
        } else {
          if (!masterNode.attrs) masterNode.attrs = {};
          if (masterNode.attrs[key] === undefined) masterNode.attrs[key] = defaultVal;
          specWrap.appendChild(this.ui.createEditFieldRow(label, masterNode.attrs[key], (v) => {
            masterNode.attrs[key] = v;
            this.syncView();
          }, 'input'));
        }
      });
    });

    // --- B. $data 変数の解析（高度な属性編集） ---
    // 形式: $data:key:label:type:default[:options]
    const dataRegex = /\$data:([\w-]+):([^:]+):([\w-]+):([^:">]+)(?::\[([^\]]+)\])?/g;
    let match;
    while ((match = dataRegex.exec(def.template)) !== null) {
      const [_, key, label, type, defaultVal, optionsRaw] = match;
      if (specWrap.querySelector(`[data-attr-key="${key}"]`)) continue;

      if (!masterNode.attrs) masterNode.attrs = {};
      if (masterNode.attrs[key] === undefined) masterNode.attrs[key] = defaultVal;

      // オプション文字列をパースして [{label, value}] の配列にする
      const options = optionsRaw ? optionsRaw.split(',').map(pair => {
        const [l, v] = pair.split(':');
        return { label: l.trim(), value: (v || l).trim() };
      }) : [];

      const field = this.createAdvancedField(label, key, type, masterNode.attrs[key], options, (newVal) => {
        masterNode.attrs[key] = newVal;
        this.syncView();
      });
      field.setAttribute('data-attr-key', key);
      specWrap.appendChild(field);
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

    if (type === 'radio') {
      options.forEach(opt => {
        const l = document.createElement('label');
        l.className = 'radio-label';
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = `radio-${key}-${Math.random().toString(36).slice(2, 7)}`;
        r.value = opt.value;
        r.checked = (String(opt.value) === String(currentVal));
        r.onchange = () => onChange(opt.value);
        l.appendChild(r);
        l.append(opt.label);
        wrap.appendChild(l);
      });
    } else if (type === 'checkbox') {
      // checkboxの場合、options[0]がチェック時、options[1]が未チェック時のラベルと値
      const onData = options[0] || { label: "ON", value: "true" };
      const offData = options[1] || { label: "OFF", value: "false" };

      const l = document.createElement('label');
      l.className = 'checkbox-label';
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = (String(currentVal) === String(onData.value));
      c.onchange = (e) => onChange(e.target.checked ? onData.value : offData.value);
      l.appendChild(c);
      l.append(currentVal === onData.value ? onData.label : offData.label);
      
      // 文字列をクリックでも切り替わるように
      wrap.appendChild(l);
    } else {
      // text, number, textarea (省略)
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
    // 重複チェック
    if (parent.querySelector(`[data-p="${item.prop}"]`)) return;
    
    // 1. UIパーツの生成
    const propItem = this.ui.createPropInputItem(item, fullVal);
    const targetEl = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${targetId}"]`);

    // 接頭辞（module/layout）の判定
    const getPrefix = () => {
      const modAttr = targetEl?.getAttribute(this.ctx.CONFIG.ATTRIBUTES.MODULE) || "";
      return modAttr.startsWith('m-') ? "module" : "layout";
    };

    // 2. 更新イベントの紐付け
    const updateStyles = () => {
      if (!targetEl) return;
      const val = propItem.getValue();
      targetEl.style.setProperty(`--${getPrefix()}-${item.prop}`, val);
    };

    propItem.querySelectorAll('input, select').forEach(el => el.oninput = updateStyles);

    // 3. 削除イベントの紐付け
    propItem.querySelector('.del-p').onclick = () => {
      if (targetEl) {
        targetEl.style.removeProperty(`--${getPrefix()}-${item.prop}`);
      }
      propItem.remove();
    };

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



}


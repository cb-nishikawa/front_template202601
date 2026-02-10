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

    // treeDataがあれば上書き、なければ現在の this.data を使う
    if (treeData) {
      this.data = JSON.parse(JSON.stringify(treeData));
    } else if (!this.data) {
      // データが空なら現在のDOMから一度構築
      this.data = this.logic.buildModuleTree(previewRoot);
    }

    // プレビューDOMの物理的な全消去と再構成
    previewRoot.innerHTML = "";
    this.data.forEach(node => {
      const el = this.renderNode(node);
      if (el) previewRoot.appendChild(el);
    });

    // サイドバーの再構成
    this.renderSidebar(this.data);
  }
  // ---------------------------------------------------------------



  /**
   * JSONデータから実DOM（プレビュー用）を生成する
   * @param {Object} nodeData - 1つ分のノードデータ
   */
  renderNode(nodeData) {
    // --- 【重要】枠（structure-box）の処理を修正 ---
    if (nodeData.type === 'structure-box') {
      // プレビュー側でも、中身を包む「実際の要素」を作成する
      // ここでは、親の data-drop-zone を持っていた要素と同じ役割を果たす div を作る
      const wrapper = document.createElement('div');
      
      // 識別用にIDなどを付与（必要に応じて）
      wrapper.setAttribute(this.ctx.CONFIG.ATTRIBUTES.TREE_ID, nodeData.id);
      
      if (nodeData.children) {
        nodeData.children.forEach(child => {
          const childDom = this.renderNode(child);
          if (childDom) wrapper.appendChild(childDom);
        });
      }
      // Fragmentではなく、wrapper(div)そのものを返すことで構造を維持する
      return wrapper;
    }

    // --- 通常のモジュールの処理 ---
    const def = this.ctx.ELEMENT_DEFS[nodeData.type];
    if (!def) return null;

    let html = def.template.replace(/\$tag/g, def.tag);
    
    const content = nodeData.content || def.defaultContent || "";
    html = html.replace(/\$content/g, content);

    const attrs = nodeData.attrs || {};
    html = html.replace(/\$src/g, attrs.src || "https://via.placeholder.com/150");
    html = html.replace(/\$alt/g, attrs.alt || "");
    html = html.replace(/\$href/g, attrs.href || "#");

    const temp = document.createElement('div');
    temp.innerHTML = html.trim();
    const el = temp.firstElementChild;

    el.setAttribute(this.ctx.CONFIG.ATTRIBUTES.TREE_ID, nodeData.id);
    el.setAttribute(this.ctx.CONFIG.ATTRIBUTES.MODULE, nodeData.type);

    if (nodeData.children && nodeData.children.length > 0) {
      const dzAttr = this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE;
      const dz = el.hasAttribute(dzAttr) ? el : el.querySelector(`[${dzAttr}]`);

      if (dz) {
        nodeData.children.forEach(childData => {
          const childDom = this.renderNode(childData);
          if (childDom) {
            dz.appendChild(childDom);
          }
        });
      }
    }

    return el;
  }
  // ---------------------------------------------------------------



  /**
   * JSONデータから実DOM（プレビュー用）を生成する
   * @param {Object} nodeData - 1つ分のノードデータ
   * @returns {Element|DocumentFragment} 生成されたDOM
   */
  renderNode(nodeData, parentDef = null) {
    // 1. 枠（structure-box）の処理
    if (nodeData.type === 'structure-box') {
      let wrapper;
      
      if (parentDef) {
        // 親のテンプレートからドロップゾーン要素の「ひな形」を抽出
        const temp = document.createElement('div');
        temp.innerHTML = parentDef.template;
        const dzTemplate = temp.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`);
        
        if (dzTemplate) {
          // ひな形を複製して「枠」として使う（クラス名や構造を完全に維持）
          wrapper = dzTemplate.cloneNode(false); // 中身は空で複製
        }
      }

      // もしひな形が見つからない場合のフォールバック
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

    // 2. 通常のモジュールの処理
    const def = this.ctx.ELEMENT_DEFS[nodeData.type];
    if (!def) return null;

    let html = def.template.replace(/\$tag/g, def.tag);
    html = html.replace(/\$content/g, nodeData.content || def.defaultContent || "");
    const attrs = nodeData.attrs || {};
    html = html.replace(/\$src/g, attrs.src || "https://via.placeholder.com/150");
    html = html.replace(/\$alt/g, attrs.alt || "");
    html = html.replace(/\$href/g, attrs.href || "#");

    const temp = document.createElement('div');
    temp.innerHTML = html.trim();
    const el = temp.firstElementChild;

    el.setAttribute(this.ctx.CONFIG.ATTRIBUTES.TREE_ID, nodeData.id);
    el.setAttribute(this.ctx.CONFIG.ATTRIBUTES.MODULE, nodeData.type);

    // 3. 子要素（children）の流し込み
    if (nodeData.children && nodeData.children.length > 0) {
      const dzAttr = this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE;
      const dz = el.hasAttribute(dzAttr) ? el : el.querySelector(`[${dzAttr}]`);

      if (dz) {
        dz.innerHTML = "";
        nodeData.children.forEach(childData => {
          // 子（枠）を描画する際、自身の定義（def）を渡して「枠」の見た目を決めさせる
          const childDom = this.renderNode(childData, def);
          if (childDom) {
            // ここで dz 自体を置き換えるのではなく、dz の親に枠を並べる形にする
            // グリッドセット等の場合、dz要素そのものが「枠」のひな形なので、
            // その親要素に「生成された枠」をどんどん追加していく
            dz.parentElement.appendChild(childDom);
          }
        });
        // 元のひな形用 dz 要素は不要になるので削除
        dz.remove();
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

    const newNode = {
      id: "id-" + Math.random().toString(36).slice(2, 11),
      type: defId,
      label: def.label,
      children: [],
      isStructure: !!def.default || def.template.includes(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE)
    };

    if (def.default) {
      // 1. まずテンプレートから実際の「ドロップゾーン」要素を特定する
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = def.template;
      const dzEl = tempDiv.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`);
      
      if (dzEl) {
        // 2. 「枠（ドロップゾーン）」という階層データを作る
        const dzNode = {
          id: "id-" + Math.random().toString(36).slice(2, 11),
          type: 'structure-box',
          label: dzEl.getAttribute(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE) || "枠",
          isStructure: true,
          children: []
        };
        
        // 3. その枠の中に初期モジュール（テキスト等）を入れる
        const childModule = this.createInitialData(def.default);
        if (childModule) dzNode.children.push(childModule);
        
        newNode.children.push(dzNode);
      }
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
    // マスターデータの参照を確実に取得（編集内容を this.data に残すため）
    const masterNode = this.logic.findNodeById(this.data, node.id);
    if (!masterNode) return;

    const styleBlock = document.querySelector(this.ctx.CONFIG.SELECTORS.STYLE_BLOCK);
    const container = document.querySelector(this.ctx.CONFIG.SELECTORS.STYLE_PANEL_INNER);
    if (!styleBlock || !container) return;

    // パネルを表示し、中身をクリア
    styleBlock.classList.remove('is-hidden');
    container.innerHTML = "";

    // 共通のパネル外枠を生成
    const panelBase = this.ui.createEditPanelBase(masterNode, this.ctx.STYLE_DEFS);
    container.appendChild(panelBase);

    const def = this.ctx.ELEMENT_DEFS[masterNode.type];
    const specWrap = panelBase.querySelector('#content-specific-editor');

    // --- 属性とテキスト編集の統合 (data-edit の解析) ---
    if (def) {
      const temp = document.createElement('div');
      temp.innerHTML = def.template;
      // テンプレート内で data-edit を持つ要素を探す（なければルート）
      const editableEl = temp.querySelector('[data-edit]') || temp.firstElementChild;

      if (editableEl && editableEl.hasAttribute('data-edit')) {
        editableEl.getAttribute('data-edit').split(';').forEach(conf => {
          const parts = conf.split(':').map(s => s.trim());
          if (parts.length < 2) return;
          const [typeKey, label] = parts;
          
          let currentVal = "";
          if (typeKey === 'html') {
            currentVal = masterNode.content || def.defaultContent || "";
          } else {
            currentVal = (masterNode.attrs && masterNode.attrs[typeKey]) || "";
          }

          // UI側の入力行を生成
          const row = this.ui.createEditFieldRow(label, currentVal, (newVal) => {
            // 【重要】DOMではなくJSONデータを更新する
            if (typeKey === 'html') {
              masterNode.content = newVal;
            } else {
              if (!masterNode.attrs) masterNode.attrs = {};
              masterNode.attrs[typeKey] = newVal;
            }
            
            // プレビュー側のみを再描画（サイドバーは更新せず、入力フォーカスを維持）
            const previewRoot = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
            if (previewRoot) {
              previewRoot.innerHTML = "";
              this.data.forEach(n => {
                const el = this.renderNode(n);
                if (el) previewRoot.appendChild(el);
              });
            }
          }, (typeKey === 'src' || typeKey === 'href') ? 'input' : 'text');
          
          specWrap.appendChild(row);
        });
      }
    }

    // --- スタイル編集（既存のCSS変数操作） ---
    const targetDom = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
    if (targetDom) {
      const styleStr = targetDom.getAttribute('style') || "";
      const pref = masterNode.type?.startsWith('m-') ? "module" : "layout";
      const propsList = panelBase.querySelector('#active-props-list');

      this.ctx.STYLE_DEFS.forEach(sDef => {
        const regex = new RegExp(`--${pref}-${sDef.prop}\\s*:\\s*([^;]+)`);
        const match = styleStr.match(regex);
        if (match) this.addPropInput(sDef, propsList, node.id, match[1].trim());
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
   * サイドバーのHTMLを生成・描画し、各種UI部品をマウントする
   * @param {Array} tree - 描画対象のツリーデータ
   */
  renderSidebar(tree) {
    const displayInner = document.querySelector(this.ctx.CONFIG.SELECTORS.TREE_DISPLAY_INNER);
    if (!displayInner) return;

    displayInner.innerHTML = "";
    // ルートへの追加行
    displayInner.appendChild(this.ui.createAddRow(null));

    const toHtml = (node) => {
      const id = this.ui.escapeHtml(node.id);
      const isStr = node.isStructure;
      const isRealModule = node.type !== 'structure-box';
      const showHandle = node.type !== 'structure-box';
      
      return `
        <li data-id="${id}" class="tree-item">
          <div class="parent${isStr ? " no-drag" : ""}" data-row-id="${id}">
            ${showHandle ? `<span class="drag-handle">≡</span>` : ""}
            <span class="label-text">${this.ui.escapeHtml(node.label)}</span>
            
            <div class="row-controls">
              <div class="manage-controls" data-manage-for="${id}">
                <div class="add-controls" data-add-for="${id}"></div>
              </div>
            </div>
          </div>

          <ul class="sortable-list">
            ${node.children?.map(toHtml).join("") ?? ""}
          </ul>

          ${(isRealModule && this.ctx.ELEMENT_DEFS[node.type]?.default) 
            ? `<div data-blockadd-for="${id}"></div>` 
            : ""
          }
        </li>`.trim();
    };

    displayInner.insertAdjacentHTML("beforeend", `<ul class="sortable-list">${tree.map(toHtml).join("")}</ul>`);

    // --- ボタン（編集・削除・枠追加）のマウント ---
    displayInner.querySelectorAll('.tree-item').forEach(li => {
      const id = li.getAttribute('data-id');
      const node = this.logic.findNodeById(tree, id);
      if (!node) return;

      const mSlot = li.querySelector(`[data-manage-for="${id}"]`);
      if (mSlot) {
        mSlot.appendChild(this.ui.createEditButton(node));
        mSlot.appendChild(this.ui.createDeleteButton(node));
      }

      const addSlot = li.querySelector(`[data-add-for="${id}"]`);
      if (addSlot && node.isStructure) {
        addSlot.appendChild(this.ui.createAddRow(node));
      }
    });

    // 「+ 枠を追加」ボタンの特殊処理
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
    // 1. ツリーデータから親ノードを探す
    const parentNode = this.logic.findNodeById(this.data, parentId);
    if (!parentNode) return;

    // 2. 新しい枠（structure-box）のデータを生成
    const newStructure = {
      id: "id-" + Math.random().toString(36).slice(2, 11),
      type: 'structure-box',
      label: label,
      children: [],
      isStructure: true
    };

    // --- 【ここが修正ポイント】初期モジュールの自動挿入 ---
    // 親要素（l-gridContents01など）の定義から、デフォルトで入れるべきモジュールIDを取得
    const parentDef = this.ctx.ELEMENT_DEFS[parentNode.type];
    if (parentDef && parentDef.default) {
      // 親の default (例: 'm-text01') を使って初期データを生成
      const childModule = this.createInitialData(parentDef.default);
      if (childModule) {
        newStructure.children.push(childModule);
      }
    }
    // ------------------------------------------------

    // 3. 親の children 配列に追加
    if (!parentNode.children) parentNode.children = [];
    parentNode.children.push(newStructure);

    // 4. データが更新されたので画面全体を再描画
    this.syncView();
  }
  // ---------------------------------------------------------------



}


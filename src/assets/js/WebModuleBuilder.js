import Sortable from 'sortablejs';
import { WebModuleLogic } from './WebModuleLogic';
import { WebModuleUI } from './WebModuleUI';

export class WebModuleBuilder {
  constructor(options) {
    this.ctx = { ...options, LABELS: options.CONFIG.LABELS };
    this.logic = new WebModuleLogic(this.ctx);
    this.ui = new WebModuleUI(this);
    this.historyStack = [];
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }



  /**
   * ビルダーの初期化を実行し、イベントをバインドする
   */
  // ---------------------------------------------------------------
  init() {
    this.syncView();
    window.addEventListener('keydown', this.handleKeyDown);
  }
  // ---------------------------------------------------------------



  /**
   * 実DOMの状態をサイドバーに同期し、履歴スタックを更新する
   * @param {Array|null} treeData - 指定があればそのデータで描画、なければ実DOMから構築
   */
  // ---------------------------------------------------------------
  syncView(treeData = null) {
    const previewRoot = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    if (!previewRoot) return;

    const currentTree = treeData || this.logic.buildModuleTree(previewRoot);

    if (!treeData) {
      this.historyStack.push(JSON.parse(JSON.stringify(currentTree)));
      if (this.historyStack.length > this.ctx.CONFIG.MAX_HISTORY) this.historyStack.shift();
    }

    this.renderSidebar(currentTree);
  }
  // ---------------------------------------------------------------



  /**
   * サイドバーのHTMLを生成・描画し、各種UI部品をマウントする
   * @param {Array} tree - 描画対象のツリーデータ
   */
  // ---------------------------------------------------------------
  renderSidebar(tree) {
    const displayInner = document.querySelector(this.ctx.CONFIG.SELECTORS.TREE_DISPLAY_INNER);
    if (!displayInner) return;

    displayInner.innerHTML = "";
    displayInner.appendChild(this.ui.createAddRow(null));

    const toHtml = (node) => {
      const id = this.ui.escapeHtml(node.id);
      const isStr = node.isStructure;
      
      return `
        <li data-id="${id}" class="tree-item">
          <div class="parent${isStr ? " no-drag" : ""}" data-row-id="${id}">
            ${isStr ? "" : `<span class="drag-handle">≡</span>`}
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

          ${(!isStr && node.children?.some(c => c.isStructure)) 
            ? `<div data-blockadd-for="${id}"></div>` 
            : ""
          }
        </li>`.trim();
    };

    displayInner.insertAdjacentHTML("beforeend", `<ul class="sortable-list">${tree.map(toHtml).join("")}</ul>`);

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
      const targetDom = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${id}"]`);
      if (addSlot && this.logic.findContentContainer(targetDom)?.hasAttribute(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE)) {
        addSlot.appendChild(this.ui.createAddRow(node));
      }
    });

    displayInner.querySelectorAll("[data-blockadd-for]").forEach(slot => {
      const id = slot.getAttribute("data-blockadd-for");
      const node = this.logic.findNodeById(tree, id);
      if (node) slot.replaceWith(this.ui.createBlockAddBtn(node));
    });

    displayInner.querySelectorAll("ul.sortable-list").forEach(ul => this.initSortable(ul));
    this.bindHoverEvents(displayInner);
  }
  // ---------------------------------------------------------------



  /**
   * 定義(ELEMENT_DEFS)から新しいDOM要素を生成する
   * @param {string} defId - 定義のキー
   * @returns {Element} 生成されたDOM要素
   */
  // ---------------------------------------------------------------
  createFromTemplate(defId) {
    const def = this.ctx.ELEMENT_DEFS[defId];
    if (!def) return null;

    const html = def.template.replace(/\$tag/g, def.tag);
    const temp = document.createElement('div');
    temp.innerHTML = html.trim();
    const newEl = temp.firstElementChild;
    
    this.logic.getOrSetId(newEl);

    // 【修正箇所】attrs がオブジェクトでも配列でもエラーにならないように処理
    if (def.attrs) {
      if (Array.isArray(def.attrs)) {
        // 以前の配列形式の場合
        def.attrs.forEach(attr => newEl.setAttribute(attr, ""));
      } else {
        // 新しいオブジェクト形式の場合（初期値があればセット、なければ空）
        Object.entries(def.attrs).forEach(([attrName, type]) => {
          // テンプレート側で既に属性が書かれていなければセットする
          if (!newEl.hasAttribute(attrName)) {
            newEl.setAttribute(attrName, "");
          }
        });
      }
    }
    
    const dzAttr = this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE;
    if (def.default) {
      const dz = newEl.hasAttribute(dzAttr) ? newEl : newEl.querySelector(`[${dzAttr}]`);
      if (dz) dz.appendChild(this.createFromTemplate(def.default));
    }
    return newEl;
  }
  // ---------------------------------------------------------------



  /**
   * 指定した場所に新しいモジュールを追加する
   * @param {Object|null} node - 親ノード。nullならルートコンテナ
   * @param {string} defId - 追加するモジュールの定義キー
   */
  // ---------------------------------------------------------------
  addNewModule(node, defId) {
    const container = node 
      ? this.logic.findContentContainer(document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`)) 
      : document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    if (container) {
      const newEl = this.createFromTemplate(defId);
      node ? container.insertBefore(newEl, container.firstChild) : container.appendChild(newEl);
      this.syncView();
    }
  }
  // ---------------------------------------------------------------



  /**
   * ID指定でモジュールを実DOMから削除する
   * @param {string} id - 削除対象の data-tree-id
   */
  // ---------------------------------------------------------------
  deleteModule(id) {
    const targetDom = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${id}"]`);
    if (targetDom && confirm("削除しますか？")) {
      targetDom.remove();
      this.syncView();
    }
  }
  // ---------------------------------------------------------------



  /**
   * ノード内のDropZoneに、定義に基づいた子要素を「高速追加」する
   * @param {Object} node - 対象の親ノード
   */
  // ---------------------------------------------------------------
  fastAddFrame(node) {
    const targetDom = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
    if (!targetDom) return;

    const dz = this.logic.findContentContainer(targetDom);
    const modName = targetDom.getAttribute(this.ctx.CONFIG.ATTRIBUTES.MODULE);
    const def = this.ctx.ELEMENT_DEFS[modName];
    
    // 1. 新しい子要素を作成
    const newChild = document.createElement(dz.tagName === 'UL' ? 'li' : 'div');

    // 2. クラス名の継承
    // 既存の DropZone 要素（最初の子要素）からクラスをコピーする
    const firstChild = dz.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`);
    if (firstChild) {
      newChild.className = firstChild.className; // ここで "block contents" などがコピーされる
    }

    // 3. DropZone 属性の継承
    const dzAttr = this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE;
    const originalDZValue = firstChild?.getAttribute(dzAttr) || "";
    newChild.setAttribute(dzAttr, originalDZValue);

    // 4. IDの付与とテンプレートの挿入
    this.logic.getOrSetId(newChild);
    if (def?.default) {
      newChild.appendChild(this.createFromTemplate(def.default));
    }

    // 5. DOMに追加
    dz.appendChild(newChild);
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
      group: 'nested',
      animation: 150,
      handle: '.drag-handle', // ハンドル以外でのドラッグを禁止
      fallbackOnBody: true,
      swapThreshold: 0.65,
      // ここが重要：select をドラッグ対象から除外
      filter: '.moduleAddBtn, .editBtn, .deleteBtn, .blockAddBtn',
      preventOnFilter: false,
      onEnd: () => {
        const displayInner = document.querySelector(this.ctx.CONFIG.SELECTORS.TREE_DISPLAY_INNER);
        const rootUl = displayInner?.querySelector(':scope > ul');
        if (!rootUl) return;

        const getOrder = (currUl) => Array.from(currUl.children).map(li => ({
          id: li.getAttribute('data-id'),
          children: li.querySelector(':scope > ul') ? getOrder(li.querySelector(':scope > ul')) : []
        }));
        
        this.applyNewOrder(getOrder(rootUl), document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER));
        this.syncView();
      }
    });
  }
  // ---------------------------------------------------------------



  /**
   * サイドバーの並び順に従って実DOMの要素を再配置する
   * @param {Array} order - IDとchildrenを持つ並び順データ
   * @param {Element} parentContainer - 配置先の親コンテナ
   */
  // ---------------------------------------------------------------
  applyNewOrder(order, parentContainer) {
    if (!order || !parentContainer) return;
    const root = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    const container = (root && parentContainer === root) ? parentContainer : this.logic.findContentContainer(parentContainer);

    order.forEach(item => {
      const targetEl = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${item.id}"]`);
      if (targetEl && !targetEl.contains(container)) {
        container.appendChild(targetEl);
        if (item.children?.length > 0) this.applyNewOrder(item.children, targetEl);
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
        this.historyStack.pop();
        const prev = this.historyStack[this.historyStack.length - 1];
        this.applyNewOrder(prev, document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER));
        this.syncView(prev);
      }
    }
  }
  // ---------------------------------------------------------------



  /**
   * 編集パネル（スタイル・テキスト）を開き、入力をマウントする
   * @param {Object} node - 対象のツリーノードデータ
   */
  // ---------------------------------------------------------------
  openEditPanel(node) {
    const targetDom = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
    if (!targetDom) return;

    const styleBlock = document.querySelector(this.ctx.CONFIG.SELECTORS.STYLE_BLOCK);
    const container = document.querySelector(this.ctx.CONFIG.SELECTORS.STYLE_PANEL_INNER);
    if (!styleBlock || !container) return;

    styleBlock.classList.remove('is-hidden');
    container.innerHTML = "";

    const panelBase = this.ui.createEditPanelBase(node, this.ctx.STYLE_DEFS);
    container.appendChild(panelBase);

    // モジュール定義の取得
    const modId = targetDom.getAttribute(this.ctx.CONFIG.ATTRIBUTES.MODULE) || 
                  targetDom.getAttribute(this.ctx.CONFIG.ATTRIBUTES.COMPONENT);
    const def = this.ctx.ELEMENT_DEFS[modId];

    // --- スタイル編集（CSS変数） ---
    const styleStr = targetDom.getAttribute('style') || "";
    const pref = modId?.startsWith('m-') ? "module" : "layout";
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

    // --- 属性とテキスト編集の統合 ---
    const specWrap = panelBase.querySelector('#content-specific-editor');

    // 1. 定義された属性(attrs)を input/textarea で出し分け
    if (def && def.attrs) {
      Object.entries(def.attrs).forEach(([attrName, type]) => {
        const currentVal = targetDom.getAttribute(attrName) || "";
        const row = this.ui.createEditFieldRow(attrName, currentVal, (newVal) => {
          targetDom.setAttribute(attrName, newVal);
          this.syncView();
        }, type);
        specWrap.appendChild(row);
      });
    }

    // --- data-edit 属性の編集 ---
    targetDom.querySelectorAll('[data-edit]').forEach(el => {
      el.getAttribute('data-edit').split(';').forEach(conf => {
        const [typeKey, label] = conf.split(':').map(s => s.trim());
        
        let currentVal = "";
        if (typeKey === 'src' || typeKey === 'alt' || typeKey === 'href') {
          // 属性(hrefなど)の場合は、その属性値だけを取得
          currentVal = el.getAttribute(typeKey) || "";
        } else {
          // html/text の場合は、子要素の data-edit 要素を除いた「純粋なテキスト」または「中身」を取得
          // ここではシンプルに innerHTML を取得するが、対象が入れ子なら注意が必要
          currentVal = el.innerHTML;
        }

        const row = this.ui.createEditFieldRow(label, currentVal, (newVal) => {
          if (typeKey === 'src' || typeKey === 'alt' || typeKey === 'href') {
            el.setAttribute(typeKey, newVal);
          } else {
            el.innerHTML = newVal;
          }
          this.syncView(); 
        }, (typeKey === 'href' || typeKey === 'src') ? 'input' : 'text'); // URL系は input、その他は text
        
        specWrap.appendChild(row);
      });
    });
  }
  // ---------------------------------------------------------------


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
}
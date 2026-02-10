import Sortable from 'sortablejs';

export const createWebModuleBuilder = (options) => {
  const { CONFIG, ELEMENT_DEFS, STYLE_DEFS } = options;
  const ctx = { CONFIG, ELEMENT_DEFS, STYLE_DEFS, LABELS: CONFIG.LABELS };

  const state = {
    historyStack: [],
    isUndoing: false
  };

  // ===================================================
  // 1. 内部ユーティリティ (低レイヤー操作)
  // ===================================================

  /**
   * コンテンツを格納すべき実際のDOM要素を特定する
   */
  const findContentContainer = (el) => {
    const dzAttr = ctx.CONFIG.ATTRIBUTES.DROP_ZONE;
    if (!el) return null;

    // 1) 自分が枠(DropZone)なら、それ自身がコンテンツ領域
    if (el.hasAttribute(dzAttr)) return el;

    // 2) 自分の直下に枠があるなら、自分が「枠の親コンテナ」
    if (el.querySelector(`:scope > [${dzAttr}]`)) return el;

    // 3) 子孫を上から探し「直下に枠を持つ最初の要素」を返す
    const queue = Array.from(el.children);
    while (queue.length) {
      const node = queue.shift();
      if (node.querySelector(`:scope > [${dzAttr}]`)) return node;
      queue.push(...node.children);
    }

    // 4) 見つからなければ自分（保険）
    return el;
  };

  /**
   * DOM要素に一意のTreeIDを付与、または取得する
   */
  const getOrSetId = (el) => {
    if (!el.dataset.treeId) el.dataset.treeId = "id-" + Math.random().toString(36).slice(2, 11);
    return el.dataset.treeId;
  };

  // ===================================================
  // 2. システム司令塔 (syncView)
  // ===================================================

  /**
   * プレビュー(実DOM)とツリー(UI)の状態を同期させる
   * @param {Array|null} treeData - 指定があればそのデータで描画、なければ実DOMから解析
   */
  const syncView = (treeData = null) => {
    const previewRoot = document.querySelector(ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    if (!previewRoot) return;

    // A. データの確定 (外部データがなければ現在のDOMを解析)
    const currentTree = treeData || buildModuleTree(previewRoot);

    // B. 履歴の保存 (引数がない＝新規のユーザー操作時のみ保存)
    if (!treeData) {
      state.historyStack.push(JSON.parse(JSON.stringify(currentTree)));
      if (state.historyStack.length > ctx.CONFIG.MAX_HISTORY) state.historyStack.shift();
    }

    // C. ツリーUIの再描画
    const displayInner = document.querySelector(ctx.CONFIG.SELECTORS.TREE_DISPLAY_INNER);
    if (displayInner) {
      displayInner.innerHTML = "";
      // ルート階層用のモジュール追加ボタンを配置
      displayInner.appendChild(createAddRow(null, true, ctx));
      renderTree(currentTree, displayInner, ctx);
    }
  };

  // ===================================================
  // 3. データ解析・描画ロジック
  // ===================================================

  /**
   * 実DOMを再帰的に走査し、ツリー構造(JSON)に変換する
   */
  const buildModuleTree = (root) => {
    if (!root) return [];
    const dzAttr = ctx.CONFIG.ATTRIBUTES.DROP_ZONE;

    return Array.from(root.children)
      .filter(el => !el.closest(ctx.CONFIG.SELECTORS.EXCLUDE_AREAS))
      .map(el => {
        const comp = el.getAttribute(ctx.CONFIG.ATTRIBUTES.COMPONENT);
        const mod = el.getAttribute(ctx.CONFIG.ATTRIBUTES.MODULE);
        const hasDZ = el.hasAttribute(dzAttr);
        const dzVal = el.getAttribute(dzAttr);

        if (comp || mod || hasDZ) {
          let label = "";
          if (comp || mod) {
            const def = ctx.ELEMENT_DEFS[comp || mod];
            label = def ? def.label : (comp || mod);
          } else if (hasDZ) {
            // DropZone属性の値があればそれを、なければデフォルトラベルを使用
            label = dzVal || ctx.LABELS.STRUCTURE;
          }

          return {
            label: label,
            id: getOrSetId(el),
            isStructure: hasDZ,
            children: buildModuleTree(findContentContainer(el))
          };
        }
        return buildModuleTree(el);
      }).flat();
  };

  /**
   * 解析されたデータを元に、サイドバーのツリーUIを構築する
   */
  const escapeHtml = (s = "") =>
    String(s).replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));

  const findNodeById = (tree, id) => {
    for (const n of tree) {
      if (n.id === id) return n;
      if (n.children?.length) {
        const hit = findNodeById(n.children, id);
        if (hit) return hit;
      }
    }
    return null;
  };

  const renderTree = (tree, parent, ctx) => {
    // 1) ツリーをHTML文字列にする（ローカル関数で完結）
    const toHtml = (node) => {
      const id = escapeHtml(node.id);
      return `
        <li data-id="${id}" class="tree-item">
          <${node.isStructure ? "p" : "div"}
            class="parent${node.isStructure ? " no-drag" : ""}"
            data-row-id="${id}"
            ${node.isStructure ? "data-tree-ignore" : ""}
          >
            ${node.isStructure ? "" : `<span class="drag-handle">≡</span>`}
            <span class="label-text">${escapeHtml(node.label)}</span>
            <div class="row-controls">
              <div class="add-controls" data-add-for="${id}"></div>
              <div class="manage-controls" data-manage-for="${id}"></div>
            </div>
          </${node.isStructure ? "p" : "div"}>
          <ul class="sortable-list${node.isStructure ? " is-structure-list" : ""}">
            ${node.children?.map(toHtml).join("") ?? ""}
          </ul>
          ${(!node.isStructure && node.children?.some(c => c.isStructure))
            ? `<div data-fastadd-for="${id}"></div>` // 単なるスロット。クラスは不要。
            : ""
          }
        </li>
      `.trim();
    };

    // 2) ルートのULごと描画
    parent.insertAdjacentHTML(
      "beforeend",
      `<ul class="sortable-list">${tree.map(toHtml).join("")}</ul>`
    );

    // 3) 各スロットに機能を直接マウント
    parent.querySelectorAll('.tree-item').forEach((li) => {
      const id = li.getAttribute('data-id');
      const node = findNodeById(tree, id);
      if (!node) return;

      // 追加スロットの設定 (既存ロジック)
      const addSlot = li.querySelector(`[data-add-for="${id}"]`);
      if (addSlot) {
        addSlot.innerHTML = "";
        const targetDom = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
        const containerEl = findContentContainer(targetDom);
        if (containerEl?.hasAttribute(ctx.CONFIG.ATTRIBUTES.DROP_ZONE)) {
          addSlot.appendChild(createAddRow(node, false, ctx));
        }
      }

      // 管理スロットの設定 (編集と削除を独立して追加)
      const manageSlot = li.querySelector(`[data-manage-for="${id}"]`);
      if (manageSlot) {
        manageSlot.innerHTML = ""; 
        manageSlot.appendChild(createEditButton(node, ctx));
        manageSlot.appendChild(createDeleteButton(node, ctx));
      }
    });

    // 4) 枠追加ボタンも既存関数で埋める
    parent.querySelectorAll("[data-fastadd-for]").forEach((slot) => {
      const id = slot.getAttribute("data-fastadd-for");
      const node = findNodeById(tree, id);
      if (!node) return;

      // 関数内で data-fast-add-container が付与された実DOMを生成
      const fastAddBtnEl = createFastAddFrameBtn(node, ctx);
      
      // スロット(div)を生成したボタン要素で置換
      slot.replaceWith(fastAddBtnEl);
    });

    // 5) hover（イベントデリゲーション）
    if (!parent.__treeHoverBound) {
      parent.__treeHoverBound = true;

      parent.addEventListener("mouseover", (e) => {
        const row = e.target.closest("[data-row-id]");
        if (!row) return;
        handleHover(row.getAttribute("data-row-id"), true);
      });

      parent.addEventListener("mouseout", (e) => {
        const row = e.target.closest("[data-row-id]");
        if (!row) return;
        handleHover(row.getAttribute("data-row-id"), false);
      });
    }

    // 6) Sortable を全リストに適用（renderTree再帰はしない設計）
    parent.querySelectorAll("ul.sortable-list").forEach((ul) => initSortable(ul, ctx));
  };









  
  // ======================================================================================================
  // 4. アクション生成 (ボタン・選択UI)
  // ======================================================================================================

  // 特定のモジュール内に「空の枠」を素早く増やすボタンを生成
  // ----------------------------------------------------
  const createFastAddFrameBtn = (node, ctx) => {
    const targetDZ = node.children.find(c => c.isStructure);
    if (!targetDZ) return document.createDocumentFragment();

    // 1. デザイン用の純粋なHTMLリテラル
    const html = `
      <div class="tree-fast-add-wrap">
        <button type="button" class="tree-fast-add-btn">+ ${targetDZ.label}を追加</button>
      </div>
    `.trim();

    const fragment = document.createRange().createContextualFragment(html);
    const wrap = fragment.firstElementChild;
    const btn = wrap.querySelector('button');

    // 2. ★ここでJS制御用のフラグ（data属性）を付与
    // クラス名に依存せず、この属性がある要素を「高速追加ボタン」として扱えるようになる
    wrap.dataset.fastAddContainer = node.id; 

    btn.onclick = (e) => {
      e.stopPropagation();
      const targetDom = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
      if (targetDom) {
        const currentCount = findContentContainer(targetDom).children.length;
        updateChildrenCount(targetDom, currentCount + 1, ctx);
      }
    };

    return wrap;
  };
  // ----------------------------------------------------


  // モジュール追加ボタン
  // ----------------------------------------------------
  const createAddRow = (node, isRoot, ctx) => {
    const options = Object.entries(ctx.ELEMENT_DEFS)
      .map(([key, def]) => `<option value="${key}">${def.label}</option>`)
      .join('');

    const html = `
      <select class="module-add-select" data-tree-ignore>
        <option value="">＋</option>
        ${options}
      </select>
    `.trim();

    const select = document.createRange().createContextualFragment(html).firstElementChild;

    select.onchange = (e) => {
      const val = e.target.value;
      if (!val) return;

      const container = node 
        ? findContentContainer(document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`)) 
        : document.querySelector(ctx.CONFIG.SELECTORS.CONTAINER_INNER);
      
      if (container) {
        const newEl = createFromTemplate(val, ctx);
        // node指定があればそのコンテナの先頭へ、なければルートの最後へ
        node ? container.insertBefore(newEl, container.firstChild) : container.appendChild(newEl);
        syncView();
      }
      e.target.value = "";
    };

    return select;
  };

  // ----------------------------------------------------


  // 編集ボタン
  // ----------------------------------------------------
  const createEditButton = (node, ctx) => {
    const html = `<button type="button" class="btn-edit" title="編集" data-tree-ignore>⚙</button>`;
    
    const btn = document.createRange().createContextualFragment(html).firstElementChild;

    btn.onclick = (e) => {
      e.stopPropagation();
      openEditPanel(node, ctx);
    };
    return btn;
  };

  // ----------------------------------------------------



  // 削除ボタン
  // ----------------------------------------------------

  const createDeleteButton = (node, ctx) => {
    const html = `<button type="button" class="btn-del" title="削除" data-tree-ignore>×</button>`;

    const btn = document.createRange().createContextualFragment(html).firstElementChild;

    btn.onclick = (e) => {
      e.stopPropagation();
      const targetDom = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
      if (targetDom && confirm("削除しますか？")) {
        targetDom.remove();
        syncView();
      }
    };
    return btn;
  };

  // ----------------------------------------------------

 // ======================================================================================================






  
  // ======================================================================================================
  // 5. DOM操作・テンプレート生成
  // ======================================================================================================

  /**
   * 枠の数を増減させる (グリッドやリスト用)
   */
  const updateChildrenCount = (targetDom, count, ctx) => {
    const dz = findContentContainer(targetDom);
    const diff = count - dz.children.length;
    const dzAttr = ctx.CONFIG.ATTRIBUTES.DROP_ZONE;

    if (diff > 0) {
      const modName = targetDom.getAttribute(ctx.CONFIG.ATTRIBUTES.MODULE);
      const def = ctx.ELEMENT_DEFS[modName];
      for (let i = 0; i < diff; i++) {
        const isList = dz.tagName === 'UL';
        const newChild = document.createElement(isList ? 'li' : 'div');
        // 既存のDropZoneと同じラベル名を引き継ぐ
        const originalDZ = dz.querySelector(`[${dzAttr}]`) || dz.firstElementChild;
        newChild.setAttribute(dzAttr, originalDZ?.getAttribute(dzAttr) || "");
        newChild.setAttribute(ctx.CONFIG.ATTRIBUTES.TREE_ID, "id-" + Math.random().toString(36).slice(2, 11));
        if (def?.default) newChild.appendChild(createFromTemplate(def.default, ctx));
        dz.appendChild(newChild);
      }
    } else {
      for (let i = 0; i < Math.abs(diff); i++) dz.lastElementChild?.remove();
    }
    syncView();
  };

  /**
   * ELEMENT_DEFSの定義に基づき、実DOM要素を新規生成する
   */
  const createFromTemplate = (defId, ctx) => {
    const def = ctx.ELEMENT_DEFS[defId];
    const html = def.template.replace(/\$tag/g, def.tag);
    const temp = document.createElement('div');
    temp.innerHTML = html.trim();
    const newEl = temp.firstElementChild;
    newEl.setAttribute(ctx.CONFIG.ATTRIBUTES.TREE_ID, "id-" + Math.random().toString(36).slice(2, 11));
    if (def.attrs) def.attrs.forEach(attr => newEl.setAttribute(attr, ""));
    const dzAttr = ctx.CONFIG.ATTRIBUTES.DROP_ZONE;
    if (def.default) {
      const dz = newEl.hasAttribute(dzAttr) ? newEl : newEl.querySelector(`[${dzAttr}]`);
      if (dz) dz.appendChild(createFromTemplate(def.default, ctx));
    }
    return newEl;
  };

  // ======================================================================================================







  
  // ===================================================
  // 6. 並び替えと編集パネル
  // ===================================================

  /**
   * ツリーのドラッグ操作結果を、実DOMの並びに適用する
   */
  const applyNewOrder = (order, parentContainer) => {
    if (!order || !parentContainer) return;

    // ★ここがポイント：ルート階層は “そのまま” 並べ替える
    const root = document.querySelector(ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    const container = (root && parentContainer === root)
      ? parentContainer
      : findContentContainer(parentContainer);

    order.forEach(item => {
      const targetEl = document.querySelector(
        `[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${item.id}"]`
      );
      if (targetEl) {
        // ★念のため：自分の子孫に自分をappendしない防御（事故止め）
        if (container && container.contains(targetEl)) {
          // OK（同じ階層に移動）なのでそのまま
        }
        // 逆に、targetEl が container を含むならアウト（循環）
        if (container && targetEl.contains(container)) return;

        container.appendChild(targetEl);
        if (item.children?.length > 0) applyNewOrder(item.children, targetEl);
      }
    });
  };

  /**
   * 各階層のリストにSortableJSを適用し、ドロップ制限を行う
   */
  const initSortable = (ul, ctx) => {
    new Sortable(ul, {
      group: {
        name: 'nested',
        put: (to) => {
          if (!to || !to.el) return false;
          // ルート階層ならドロップ可
          const isRoot = to.el.parentElement && to.el.parentElement.id === "tree-display-inner";
          if (isRoot) return true;
          // ドロップ先の親がDropZone属性を持っていれば許可
          const targetLi = to.el.closest('li');
          if (!targetLi) return false;
          const targetDom = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${targetLi.getAttribute('data-id')}"]`);
          return findContentContainer(targetDom)?.hasAttribute(ctx.CONFIG.ATTRIBUTES.DROP_ZONE);
        }
      },
      animation: 150,
      handle: '.drag-handle',
      fallbackOnBody: true,
      swapThreshold: 0.65,
      filter: '[data-tree-ignore], input, select, button',
      preventOnFilter: false,
      onEnd: () => {
        const displayInner = document.querySelector(ctx.CONFIG.SELECTORS.TREE_DISPLAY_INNER);
        const rootUl = displayInner?.querySelector(':scope > ul');
        if (!rootUl) return;

        const getOrder = (currUl) => Array.from(currUl.children).map(li => ({
          id: li.getAttribute('data-id'),
          children: li.querySelector(':scope > ul') ? getOrder(li.querySelector(':scope > ul')) : []
        }));
        
        applyNewOrder(getOrder(rootUl), document.querySelector(ctx.CONFIG.SELECTORS.CONTAINER_INNER));
        syncView(); 
      }
    });
  };

  /**
   * CSSカスタムプロパティやテキスト内容を編集するパネルを開く
   */
  const openEditPanel = (node, ctx) => {
    const targetDom = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
    if (!targetDom) return;

    const styleBlock = document.querySelector(ctx.CONFIG.SELECTORS.STYLE_BLOCK);
    styleBlock?.classList.remove('is-hidden');

    const container = document.querySelector(ctx.CONFIG.SELECTORS.STYLE_PANEL_INNER);
    if (!container) return;

    // 現在のスタイル解析
    const styleStr = targetDom.getAttribute('style') || "";
    const currentStyles = {};
    ctx.STYLE_DEFS.forEach(s => {
      const regex = new RegExp(`--[a-z]+-${s.prop}\\s*:\\s*([^;]+)`);
      const match = styleStr.match(regex);
      if (match) currentStyles[s.prop] = match[1].trim();
    });

    container.innerHTML = `
      <h3 class="panel-title">${node.label}</h3>
      <div id="content-specific-editor"></div>
      <div class="prop-add-section">
        <select id="prop-selector" class="prop-select">
          <option value="">+ スタイルを追加</option>
          ${ctx.STYLE_DEFS.map(s => `<option value='${JSON.stringify(s)}'>${s.name}</option>`).join('')}
        </select>
      </div>
      <div id="active-props-list" class="props-list"></div>
    `;

    const propsList = document.getElementById('active-props-list');
    Object.entries(currentStyles).forEach(([prop, val]) => {
      const sDef = ctx.STYLE_DEFS.find(s => s.prop === prop);
      if (sDef) addPropInput(sDef, propsList, node.id, val);
    });

    document.getElementById('prop-selector').onchange = (e) => {
      if (!e.target.value) return;
      addPropInput(JSON.parse(e.target.value), propsList, node.id);
      e.target.value = "";
    };

    // data-edit属性に基づく簡易テキスト編集
    const specWrap = document.getElementById('content-specific-editor');
    targetDom.querySelectorAll('[data-edit]').forEach(el => {
      el.getAttribute('data-edit').split(';').forEach(conf => {
        const [type, label] = conf.split(':').map(s => s.trim());
        const row = document.createElement('div');
        row.className = "edit-field-row";
        let val = (type === 'src' || type === 'alt') ? el.getAttribute(type) : el.innerHTML;
        row.innerHTML = `<label>${label}</label><textarea>${val || ''}</textarea>`;
        row.querySelector('textarea').oninput = (e) => {
          if (type === 'src' || type === 'alt') el.setAttribute(type, e.target.value);
          else el.innerHTML = e.target.value;
          syncView(); 
        };
        specWrap.appendChild(row);
      });
    });
  };

  /**
   * 個別のスタイル入力項目(数値/色)を追加
   */
  const addPropInput = (item, parent, targetId, fullVal = "") => {
    if (parent.querySelector(`[data-p="${item.prop}"]`)) return;
    const div = document.createElement("div");
    div.setAttribute('data-p', item.prop);
    div.className = "prop-input-item";

    let numVal = "", unitVal = "px";
    if (fullVal) {
      const match = fullVal.match(/(-?\d+\.?\d*)(.*)/);
      if (match) { numVal = match[1]; unitVal = match[2] || "px"; }
    }

    div.innerHTML = `
      <span class="prop-label">${item.name}</span>
      ${item.type === 'color' ? 
        `<input type="color" value="${fullVal || '#000000'}">` : 
        `<input type="number" class="n-in" value="${numVal}">
         <select class="u-in">${['px','%','rem','vh','vw','auto'].map(u => `<option ${unitVal===u?'selected':''}>${u}</option>`).join('')}</select>`
      }
      <button class="del-p">×</button>
    `;

    const update = () => {
      const el = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${targetId}"]`);
      if (!el) return;
      let val = "";
      if (item.type === 'color') val = div.querySelector('input').value;
      else {
        const n = div.querySelector('.n-in').value;
        const u = div.querySelector('.u-in').value;
        val = (u === 'auto') ? 'auto' : (n !== "" ? n + u : "");
      }
      const modAttr = el.getAttribute(ctx.CONFIG.ATTRIBUTES.MODULE) || "";
      const pref = modAttr.startsWith('m-') ? "module" : "layout";
      el.style.setProperty(`--${pref}-${item.prop}`, val);
      syncView();
    };

    div.querySelectorAll('input, select').forEach(el => el.oninput = update);
    div.querySelector('.del-p').onclick = () => {
      const el = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${targetId}"]`);
      if (el) {
        const modAttr = el.getAttribute(ctx.CONFIG.ATTRIBUTES.MODULE) || "";
        const pref = modAttr.startsWith('m-') ? "module" : "layout";
        el.style.removeProperty(`--${pref}-${item.prop}`);
      }
      div.remove();
      syncView();
    };
    parent.appendChild(div);
  };

  /**
   * ホバー時の強調表示制御
   */
  const handleHover = (id, active) => {
    const el = document.querySelector(
      `[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${id}"]`
    );
    if (!el) return;

    if (active) {
      el.setAttribute('data-tree-hover', 'true');
    } else {
      el.setAttribute('data-tree-hover', 'false');
    }
  };









  // ===================================================
  // 7. 公開API
  // ===================================================

  return {
    init: () => {
      // 初期描画
      syncView();
      // ショートカットキー設定 (Ctrl+Z)
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          if (state.historyStack.length > 1) {
            state.historyStack.pop();
            const prev = state.historyStack[state.historyStack.length - 1];
            applyNewOrder(prev, document.querySelector(ctx.CONFIG.SELECTORS.CONTAINER_INNER));
            syncView(prev);
          }
        }
      });
    }
  };
};
import Sortable from 'sortablejs';

export const createWebModuleBuilder = (options) => {
  const { CONFIG, ELEMENT_DEFS, STYLE_DEFS } = options;
  const ctx = { CONFIG, ELEMENT_DEFS, STYLE_DEFS, LABELS: CONFIG.LABELS };

  const state = {
    historyStack: [],
    isUndoing: false
  };

  /**
   * コンテンツを格納すべき実際のDOM要素を探す
   * (wrapper/inner構造を考慮して、実際に要素が追加される場所を特定する)
   */
  const findContentContainer = (el) => {
    const dropZoneAttr = ctx.CONFIG.ATTRIBUTES.DROP_ZONE;
    if (el.hasAttribute(dropZoneAttr)) return el;
    // セレクタとして使う場合は属性名に [] をつける
    return el.querySelector(`:scope > .wrapper > .inner, :scope > .inner, :scope > [${dropZoneAttr}]`) || el;
  };

  /**
   * 要素に一意のID(treeId)を付与、または既存のIDを取得する
   * (ツリー表示と実DOMを紐付けるための鍵となる)
   */
  const getOrSetId = (el) => {
    if (!el.dataset.treeId) el.dataset.treeId = "id-" + Math.random().toString(36).slice(2, 11);
    return el.dataset.treeId;
  };

  /**
   * 実DOMから「編集用ツリーデータ(JSON)」を再帰的に生成する
   * (現在のプレビュー画面の構造を読み取って、左側のツリー表示用データを作る)
   */
  
  const buildModuleTree = (root) => {
    if (!root) return [];
    // 属性名を変数化（例: 'data-drop-zone'）
    const dropZoneAttr = ctx.CONFIG.ATTRIBUTES.DROP_ZONE; 

    return Array.from(root.children)
      .filter(el => !el.closest(ctx.CONFIG.SELECTORS.EXCLUDE_AREAS))
      .map(el => {
        const comp = el.getAttribute(ctx.CONFIG.ATTRIBUTES.COMPONENT);
        const mod = el.getAttribute(ctx.CONFIG.ATTRIBUTES.MODULE);
        // ハードコードを ctx.CONFIG 参照に変更
        const hasDropZone = el.hasAttribute(dropZoneAttr);

        if (comp || mod || hasDropZone) {
          let label = "";
          if (comp) label = `${ctx.LABELS.COMPONENT}${comp}`;
          else if (mod) label = `${mod.startsWith('l-') ? '【l】' : ctx.LABELS.MODULE}${mod}`;
          else if (hasDropZone) label = ctx.LABELS.STRUCTURE;

          return {
            label: label,
            id: getOrSetId(el),
            children: buildModuleTree(findContentContainer(el))
          };
        }
        return buildModuleTree(el);
      }).flat();
  };

  /**
   * ツリーの並び順変更を、実DOM(プレビュー画面)に反映させる
   * (ドラッグ&ドロップ後の新しい順序に従ってDOM要素を並べ替える)
   */
  const applyNewOrder = (order, parentContainer) => {
    if (!order || !parentContainer) return;
    const container = findContentContainer(parentContainer);
    order.forEach(item => {
      const targetEl = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${item.id}"]`);
      if (targetEl) {
        container.appendChild(targetEl);
        if (item.children?.length > 0) applyNewOrder(item.children, targetEl);
      }
    });
  };

  /**
   * スタイル編集パネルを開く
   * (選択された要素の現在の設定を読み込み、入力UIを生成して表示する)
   */
  const openEditPanel = (node, ctx) => {
    const targetDom = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
    if (!targetDom) return;

    const styleBlock = document.querySelector(ctx.CONFIG.SELECTORS.STYLE_BLOCK);
    styleBlock?.classList.remove('is-hidden');

    const container = document.querySelector(ctx.CONFIG.SELECTORS.STYLE_PANEL_INNER);
    if (!container) return;

    const styleStr = targetDom.getAttribute('style') || "";
    const currentStyles = {};
    ctx.STYLE_DEFS.forEach(s => {
      const regex = new RegExp(`--[a-z]+-${s.prop}\\s*:\\s*([^;]+)`);
      const match = styleStr.match(regex);
      if (match) currentStyles[s.prop] = match[1].trim();
    });

    const modId = targetDom.getAttribute(ctx.CONFIG.ATTRIBUTES.MODULE) || targetDom.getAttribute(ctx.CONFIG.ATTRIBUTES.COMPONENT);
    
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

    const specWrap = document.getElementById('content-specific-editor');
    targetDom.querySelectorAll('[data-edit]').forEach(el => {
      el.getAttribute('data-edit').split(';').forEach(conf => {
        const [type, label] = conf.split(':').map(s => s.trim());
        const row = document.createElement('div');
        row.className = "edit-field-row";
        let val = (type === 'src' || type === 'alt') ? el.getAttribute(type) : el.innerHTML;
        row.innerHTML = `<label>${label}</label><textarea>${val || ''}</textarea>`;
        row.querySelector('textarea').oninput = (e) => {
          const v = e.target.value;
          if (type === 'src' || type === 'alt') el.setAttribute(type, v);
          else el.innerHTML = v;
          saveHistoryAndRefresh();
        };
        specWrap.appendChild(row);
      });
    });
  };

  /**
   * 個別のスタイル入力項目(数値や色)を編集パネル内に追加する
   */
  const addPropInput = (item, parent, targetId, fullVal = "") => {
    if (parent.querySelector(`[data-p="${item.prop}"]`)) return;
    const div = document.createElement("div");
    div.setAttribute('data-p', item.prop);
    div.className = "prop-input-item"; // スタイルはCSSへ

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
      let val = "";
      if (item.type === 'color') val = div.querySelector('input').value;
      else {
        const n = div.querySelector('.n-in').value;
        const u = div.querySelector('.u-in').value;
        val = (u === 'auto') ? 'auto' : (n !== "" ? n + u : "");
      }
      const el = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${targetId}"]`);
      if (el) {
        const pref = el.getAttribute(ctx.CONFIG.ATTRIBUTES.MODULE)?.startsWith('m-') ? "module" : "layout";
        el.style.setProperty(`--${pref}-${item.prop}`, val);
        saveHistoryAndRefresh();
      }
    };

    div.querySelectorAll('input, select').forEach(el => el.oninput = update);
    div.querySelector('.del-p').onclick = () => {
      const el = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${targetId}"]`);
      if (el) {
        const pref = el.getAttribute(ctx.CONFIG.ATTRIBUTES.MODULE)?.startsWith('m-') ? "module" : "layout";
        el.style.removeProperty(`--${pref}-${item.prop}`);
      }
      div.remove();
      saveHistoryAndRefresh();
    };
    parent.appendChild(div);
  };

  /**
   * 左側のツリー表示を最新の状態に更新(全描き直し)する
   */
  const refreshTreeDisplay = (treeData) => {
    const display = document.querySelector(ctx.CONFIG.SELECTORS.TREE_DISPLAY_INNER);
    if (!display) return;
    display.innerHTML = "";
    display.appendChild(createAddRow(null, true, ctx)); // ルート用の追加ボタン
    const tree = treeData || buildModuleTree(document.querySelector(ctx.CONFIG.SELECTORS.CONTAINER_INNER));
    renderTree(tree, display, ctx);
  };

  /**
   * ツリー構造を再帰的にDOM(HTML)として描画する
   */
  const renderTree = (tree, parent, ctx) => {
    const ul = document.createElement("ul");
    ul.className = 'sortable-list';
    
    const parentLabel = parent.querySelector(':scope > .parent .label-text')?.textContent || "";
    const isParentStructure = parentLabel.includes(ctx.LABELS.STRUCTURE) || parent.id === "tree-display-inner";
    
    if (isParentStructure) {
      ul.classList.add('is-structure-list');
    }

    tree.forEach(node => {
      const li = document.createElement("li");
      li.setAttribute('data-id', node.id);
      li.className = 'tree-item';

      const isStructure = node.label.includes(ctx.LABELS.STRUCTURE);
      const row = document.createElement(isStructure ? "p" : "div");
      row.className = "parent" + (isStructure ? " no-drag" : "");
      
      row.innerHTML = `${!isStructure ? '<span class="drag-handle">≡</span>' : ''}<span class="label-text">${node.label}</span>`;
      
      appendActionButtons(row, node, ctx);
      li.appendChild(row);
      renderTree(node.children || [], li, ctx);

      // レイアウト要素またはリスト要素の場合、末尾に「枠追加」ボタンを表示
      const hasStructureChild = node.children && node.children.some(child => 
        child.label.includes(ctx.LABELS.STRUCTURE)
      );

      if (!isStructure && hasStructureChild) {
        li.appendChild(createFastAddFrameBtn(node, ctx));
      }

      row.onmouseenter = () => handleHover(node.id, true);
      row.onmouseleave = () => handleHover(node.id, false);
      ul.appendChild(li);
    });
    
    parent.appendChild(ul);
    initSortable(ul, ctx);
  };

  /**
   * レイアウト等の中身に、新しい「空の枠(structure)」を素早く追加するボタンを作る
   */
  const createFastAddFrameBtn = (node, ctx) => {
    const wrap = document.createElement("div");
    wrap.className = "tree-fast-add-wrap"; 
    
    const btn = document.createElement("button");
    btn.className = "tree-fast-add-btn";
    btn.innerHTML = "+ 枠(s)を追加";
    
    btn.onclick = (e) => {
      e.stopPropagation();
      const targetDom = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
      if (targetDom) {
        updateChildrenCount(targetDom, findContentContainer(targetDom).children.length + 1, ctx);
      }
    };
    
    wrap.appendChild(btn);
    return wrap;
  };

  /**
   * ツリーの各行に「設定(⚙)」や「削除(×)」などの操作ボタンを追加する
   */
  const appendActionButtons = (container, node, ctx) => {
    const wrap = document.createElement("div");
    wrap.className = "action-buttons";

    // 名前ではなく、実DOMの状態を確認
    const targetDom = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
    const containerEl = findContentContainer(targetDom);
    
    // 器が data-drop-zone 属性を持っていれば、追加ボタンを許可
    if (containerEl && containerEl.hasAttribute('data-drop-zone')) {
      wrap.appendChild(createAddRow(node, false, ctx));
    }

    const editBtn = document.createElement("button");
    editBtn.innerHTML = "⚙";
    editBtn.onclick = (e) => { e.stopPropagation(); openEditPanel(node, ctx); };

    const delBtn = document.createElement("button");
    delBtn.innerHTML = "×";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (targetDom && confirm("削除しますか？")) { targetDom.remove(); saveHistoryAndRefresh(); }
    };
    wrap.append(editBtn, delBtn);
    container.appendChild(wrap);
  };

  /**
   * モジュールを選択して新規追加するためのセレクトボックスを作る
   */
  const createAddRow = (node, isRoot, ctx) => {
    const select = document.createElement("select");
    select.className = "module-add-select";
    select.innerHTML = `<option value="">＋</option>` + 
      Object.entries(ctx.ELEMENT_DEFS).map(([key, def]) => `<option value="${key}">${def.label}</option>`).join('');
    select.onchange = (e) => {
      const val = e.target.value;
      if (!val) return;
      const container = node ? findContentContainer(document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`)) : document.querySelector(ctx.CONFIG.SELECTORS.CONTAINER_INNER);
      if (container) {
        const newEl = createFromTemplate(val, ctx);
        node ? container.insertBefore(newEl, container.firstChild) : container.appendChild(newEl);
        saveHistoryAndRefresh();
      }
      e.target.value = "";
    };
    return select;
  };

  /**
   * ELEMENT_DEFSの設定(テンプレート)に基づいて、実際のDOM要素を生成する
   */
  const createFromTemplate = (defId, ctx) => {
    const def = ctx.ELEMENT_DEFS[defId];
    const html = def.template.replace(/\$tag/g, def.tag);
    const temp = document.createElement('div');
    temp.innerHTML = html.trim();
    const newEl = temp.firstElementChild;
    newEl.setAttribute(ctx.CONFIG.ATTRIBUTES.TREE_ID, "id-" + Math.random().toString(36).slice(2, 11));
    if (def.attrs) def.attrs.forEach(attr => newEl.setAttribute(attr, ""));
    if (def.default) {
      const dz = newEl.hasAttribute('data-drop-zone') ? newEl : newEl.querySelector('[data-drop-zone]');
      if (dz) dz.appendChild(createFromTemplate(def.default, ctx));
    }
    return newEl;
  };

  /**
   * 子要素(枠など)の数を、指定した数に合わせて増減させる
   */
  const updateChildrenCount = (targetDom, count, ctx) => {
    const dz = findContentContainer(targetDom);
    const diff = count - dz.children.length;
    if (diff > 0) {
      const def = ctx.ELEMENT_DEFS[targetDom.getAttribute(ctx.CONFIG.ATTRIBUTES.MODULE)];
      for (let i = 0; i < diff; i++) {
        const isList = dz.tagName === 'UL';
        const newChild = document.createElement(isList ? 'li' : 'div');
        newChild.setAttribute('data-drop-zone', '');
        newChild.setAttribute(ctx.CONFIG.ATTRIBUTES.TREE_ID, "id-" + Math.random().toString(36).slice(2, 11));
        if (def?.default) newChild.appendChild(createFromTemplate(def.default, ctx));
        dz.appendChild(newChild);
      }
    } else {
      for (let i = 0; i < Math.abs(diff); i++) dz.lastElementChild?.remove();
    }
    saveHistoryAndRefresh();
  };

  /**
   * SortableJSを初期化し、ドラッグ&ドロップの挙動を制御する
   */
  const initSortable = (ul, ctx) => {
    new Sortable(ul, {
      group: {
        name: 'nested',
        put: (to) => {
          if (!to || !to.el) return false;

          // ルート（一番上の階層）なら常にOK
          const isRootList = to.el.parentElement && to.el.parentElement.id === "tree-display-inner";
          if (isRootList) return true;

          // ネストしようとしている先の親要素(li)を取得
          const targetLi = to.el.closest('li');
          if (!targetLi) return false;

          const targetId = targetLi.getAttribute('data-id');
          const targetDom = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${targetId}"]`);
          if (!targetDom) return false;

          // ★ここがポイント：
          // 「自分自身」または「直下の器(findContentContainer)」が [data-drop-zone] を持っているか？
          // これだけで、階層構造を壊さずにドロップだけを制限できます。
          const container = findContentContainer(targetDom);
          return container && container.hasAttribute('data-drop-zone');
        }
      },
      animation: 150,
      handle: '.drag-handle',
      fallbackOnBody: true,
      swapThreshold: 0.65,
      filter: '.no-drag, input, select, button, .module-add-select', // クラス名を明示的に追加
      preventOnFilter: false, // これを false にすると、フィルター対象へのクリックが通るようになります
      onEnd: () => {
        const displayInner = document.querySelector(ctx.CONFIG.SELECTORS.TREE_DISPLAY_INNER);
        const rootUl = displayInner ? displayInner.querySelector(':scope > ul') : null;
        if (!rootUl) return;

        const getOrder = (currUl) => Array.from(currUl.children)
          .filter(li => li.hasAttribute('data-id'))
          .map(li => ({
            id: li.getAttribute('data-id'),
            children: li.querySelector(':scope > ul') ? getOrder(li.querySelector(':scope > ul')) : []
          }));
          
        applyNewOrder(getOrder(rootUl), document.querySelector(ctx.CONFIG.SELECTORS.CONTAINER_INNER));
        saveHistoryAndRefresh();
      }
    });
  };

  /**
   * 現在の状態を履歴(スタック)に保存し、表示をリフレッシュする
   */
  const saveHistoryAndRefresh = () => {
    const tree = buildModuleTree(document.querySelector(ctx.CONFIG.SELECTORS.CONTAINER_INNER));
    state.historyStack.push(JSON.parse(JSON.stringify(tree)));
    if (state.historyStack.length > ctx.CONFIG.MAX_HISTORY) state.historyStack.shift();
    refreshTreeDisplay(tree);
  };

  /**
   * ツリー上でホバーした要素に対応する実DOMを強調表示(半透明化など)する
   */
  const handleHover = (id, active) => {
    const el = document.querySelector(`[${ctx.CONFIG.ATTRIBUTES.TREE_ID}="${id}"]`);
    if (el) el.style.setProperty('--tree-hover', active ? '0.7' : '1.0');
  };

  /**
   * ビルダーの初期化(イベント登録など)を行い、外部へ公開するメソッドを返す
   */
  return {
    init: () => {
      const root = document.querySelector(ctx.CONFIG.SELECTORS.CONTAINER_INNER);
      if (root) refreshTreeDisplay(buildModuleTree(root));
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.target.tagName !== 'INPUT') {
          if (state.historyStack.length > 1) {
            state.historyStack.pop();
            const prev = state.historyStack[state.historyStack.length - 1];
            applyNewOrder(prev, document.querySelector(ctx.CONFIG.SELECTORS.CONTAINER_INNER));
            refreshTreeDisplay(prev);
          }
        }
      });
    }
  };
};
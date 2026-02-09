import Sortable from 'sortablejs';

/**
 * ウェブサイト制作ツール：モジュールツリー管理システム
 * 【機能完全統合版】
 * - 追加UI：セレクトボックス形式
 * - 編集：ブロック/リスト増減、テキスト、画像、グリッド属性
 * - スタイル：数値スピン入力、単位選択(px/rem/%等)、カラーピッカー
 * - 履歴：Undo(Ctrl+Z)対応
 */
const WebModuleBuilder = () => {
  // ------------------------------------------
  // 1. 設定・定数
  // ------------------------------------------
  const CONFIG = {
    SELECTORS: {
      CONTAINER_INNER: '[data-target="container"] .inner .block.contents',
      TREE_DISPLAY_INNER: '[data-target="treeDisplay"] .inner',
      EXCLUDE_AREAS: '[data-target="treeDisplay"], [data-target="treeSet"]',
      STYLE_BLOCK: '.block.style',
      STYLE_PANEL_INNER: '#style-edit-panel .inner'
    },
    ATTRIBUTES: {
      TREE_ID: 'data-tree-id',
      COMPONENT: 'data-component',
      MODULE: 'data-module'
    },
    LABELS: {
      COMPONENT: '【c】',
      MODULE: '【m】',
      STRUCTURE: '【s】' // block, list, その他ドロップエリアを統一
    },
    MAX_HISTORY: 50
  };

  const ELEMENT_DEFS = {
    'm-text01': {
      label: 'テキスト', tag: 'p', default: '新規テキスト',
      template: `<$tag data-module="m-text01"><span class="wrapper"><span class="inner">$block</span></span></$tag>`.trim()
    },
    'l-gridContents01': {
      label: 'レイアウト', tag: 'div', attrs: ['data-grid', 'data-column-gap'], default: 'm-text01',
      template: `
        <$tag data-module="l-gridContents01">
          <div class="wrapper">
            <div class="inner">
              <div class="block contents" data-drop-zone></div>
            </div>
          </div>
        </$tag>`.trim()
    },
    'm-uList01': {
      label: 'リスト', tag: 'ul', 
      default: 'm-text01', // 初期状態で中に入れたいモジュールIDを指定
      template: `<$tag data-module="m-uList01"><li data-drop-zone></li></$tag>`.trim()
    }
  };

  const STYLE_DEFS = [
    { prop: "width", name: "幅", type: "number" },
    { prop: "height", name: "高さ", type: "number" },
    { prop: "bg-color", name: "背景色", type: "color" },
    { prop: "opacity", name: "不透明度", type: "number", step: "0.1", min: "0", max: "1" },
    { prop: "margin-top", name: "上余白", type: "number" },
    { prop: "margin-bottom", name: "下余白", type: "number" },
    { prop: "padding-top", name: "上内余白", type: "number" },
    { prop: "padding-bottom", name: "下内余白", type: "number" },
    { prop: "font-size", name: "文字サイズ", type: "number" },
    { prop: "color", name: "文字色", type: "color" }
  ];

  const state = {
    historyStack: [],
    isUndoing: false
  };

  // ------------------------------------------
  // 2. 初期化
  // ------------------------------------------
  const init = () => {
    const containerInner = document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER);
    if (containerInner) {
      const tree = buildModuleTree(containerInner);
      state.historyStack = [JSON.parse(JSON.stringify(tree))];
      refreshTreeDisplay(tree);
    }
    setupEventListeners();
  };

  const setupEventListeners = () => {
    window.addEventListener('keydown', (e) => {
      const isUndoKey = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z';
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if (isUndoKey && !isTyping) {
        e.preventDefault();
        undo();
      }
    }, true);
  };

  // ------------------------------------------
  // 3. コアロジック (DOM抽出)
  // ------------------------------------------
  const findContentContainer = (el) => {
    // data-drop-zone を持っているなら、その要素自体がコンテナ
    if (el.hasAttribute('data-drop-zone')) return el;
    
    return el.querySelector(':scope > .wrapper > .inner') || 
           el.querySelector(':scope > .inner') || 
           el;
  };

  const getOrSetId = (el) => {
    if (!el.dataset.treeId) el.dataset.treeId = "id-" + Math.random().toString(36).slice(2, 11);
    return el.dataset.treeId;
  };

  const buildModuleTree = (root) => {
    if (!root) return [];
    return Array.from(root.children)
      .filter(el => !el.closest(CONFIG.SELECTORS.EXCLUDE_AREAS))
      .map(el => {
        const comp = el.getAttribute(CONFIG.ATTRIBUTES.COMPONENT);
        const mod = el.getAttribute(CONFIG.ATTRIBUTES.MODULE);
        const hasDropZone = el.hasAttribute('data-drop-zone');

        if (comp || mod || hasDropZone) {
          let label = "";
          if (comp) {
            label = `${CONFIG.LABELS.COMPONENT}${comp}`;
          } else if (mod) {
            label = `${mod.startsWith('l-') ? '【l】' : CONFIG.LABELS.MODULE}${mod}`;
          } else if (hasDropZone) {
            // 属性がないドロップゾーンは一律で【s】
            label = CONFIG.LABELS.STRUCTURE;
          }

          return {
            label: label,
            id: getOrSetId(el),
            children: buildModuleTree(findContentContainer(el))
          };
        }
        return buildModuleTree(el);
      }).flat();
  };

  const applyNewOrder = (order, parentContainer) => {
    if (!order || !parentContainer) return;
    order.forEach(item => {
      const targetEl = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${item.id}"]`);
      if (targetEl && parentContainer !== targetEl && !targetEl.contains(parentContainer)) {
        parentContainer.appendChild(targetEl);
        if (item.children?.length > 0) {
          applyNewOrder(item.children, findContentContainer(targetEl));
        }
      }
    });
  };

  // ------------------------------------------
  // 4. ツリー表示 & Sortable (修正版)
  // ------------------------------------------
  const refreshTreeDisplay = (treeData) => {
    const display = document.querySelector(CONFIG.SELECTORS.TREE_DISPLAY_INNER);
    if (!display) return;
    display.innerHTML = "";

    // ★ 修正：最上部に独立した追加ボタンを配置
    // 引数に null を渡し、内部でルート用として判定させます
    display.appendChild(createAddRow(null));

    const tree = treeData || buildModuleTree(document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER));
    renderTree(tree, display);
  };

  const renderTree = (tree, parent) => {
    const isParentLi = parent.tagName === 'LI';
    const labelEl = isParentLi ? parent.querySelector(':scope > .parent .label-text') : null;
    const parentLabel = labelEl ? labelEl.textContent : "";
    
    // STRUCTUREラベルが含まれているかどうかで判定
    const isStructure = parentLabel.includes(CONFIG.LABELS.STRUCTURE);

    if (tree.length === 0 && !isStructure && parent.id !== "tree-display-inner") return;

    const ul = document.createElement("ul");
    ul.className = 'sortable-list';
    ul.style.minHeight = "20px";
    ul.style.paddingBottom = "10px";

    tree.forEach(node => {
      const li = document.createElement("li");
      li.setAttribute('data-id', node.id);
      
      // ここも新ラベルで判定
      const isParentType = node.label.includes(CONFIG.LABELS.STRUCTURE);
      const row = document.createElement(isParentType ? "p" : "div");
      row.className = "parent" + (isParentType ? " no-drag" : "");

      const dragHandle = !isParentType ? `<span class="drag-handle">≡</span>` : '';
      row.innerHTML = `${dragHandle}<span class="label-text">${node.label}</span>`;
      
      appendActionButtons(row, node);
      li.appendChild(row);
      
      renderTree(node.children || [], li);

      row.onmouseenter = () => handleHover(node.id, true);
      row.onmouseleave = () => handleHover(node.id, false);
      ul.appendChild(li);
    });
    
    parent.appendChild(ul);
    initSortable(ul);
  };

  const initSortable = (ul) => {
    new Sortable(ul, {
      animation: 150,
      group: {
        name: 'nested',
        put: (to) => {
          // ルートはOK
          if (to.el.parentElement.id === "tree-display-inner") return true;

          // 親の実DOMを取得
          const targetId = to.el.closest('li')?.getAttribute('data-id');
          const targetDom = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${targetId}"]`);
          
          // 実DOMが data-drop-zone を持っていればドロップOK
          return targetDom && targetDom.hasAttribute('data-drop-zone');
        }
      },
      handle: '.drag-handle',
      filter: '.no-drag, .edit-btn, .delete-btn, .tree-add-row, input, textarea, select',
      // ... (以下End時の処理などは変更なし)
      preventOnFilter: false,
      onEnd: () => {
        const rootUl = document.querySelector(`${CONFIG.SELECTORS.TREE_DISPLAY_INNER} > ul`);
        if (!rootUl) return;
        const getOrder = (currUl) => Array.from(currUl.children).map(li => ({
          id: li.getAttribute('data-id'),
          children: li.querySelector(':scope > ul') ? getOrder(li.querySelector(':scope > ul')) : []
        }));
        const newOrder = getOrder(rootUl);
        applyNewOrder(newOrder, document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER));
        saveHistory();
      }
    });
  };

  // ------------------------------------------
  // 5. 新規追加UI (ルート・子要素 両対応版)
  // ------------------------------------------
  const createAddRow = (node, isRoot = false) => {
    const addRow = document.createElement(isRoot ? "div" : "span");
    
    if (isRoot) {
      addRow.className = "tree-add-row-root";
      addRow.style.cssText = "padding: 5px 10px; background: #f8f9fa; border-bottom: 1px solid #eee; display: block;";
    }

    const select = document.createElement("select");
    select.style.cssText = isRoot 
      ? "width:100%; font-size:11px; padding:4px; border-radius:3px; border:1px solid #ccc; cursor:pointer;"
      : "width: 24px; height: 20px; font-size: 12px; font-weight: bold; border: 1px solid #ccc; border-radius: 3px; background: #fff; cursor: pointer; text-align: center; padding: 0;";
    
    // --- 修正ポイント：ELEMENT_DEFS から選択肢を動的に作る ---
    const initialOption = document.createElement("option");
    initialOption.value = "";
    initialOption.textContent = "＋";
    select.appendChild(initialOption);

    Object.entries(ELEMENT_DEFS).forEach(([key, def]) => {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = def.label;
      select.appendChild(o);
    });

    select.onchange = (e) => {
      const val = e.target.value;
      if (!val || !ELEMENT_DEFS[val]) return;
      
      let container;
      if (node) {
        const targetDom = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
        if (!targetDom) return;
        container = findContentContainer(targetDom);
      } else {
        container = document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER);
      }
      
      if (!container) return;

      // ★ 修正：定義から初期値を読み取るだけ（個別設定は不要）
      const initialContent = ELEMENT_DEFS[val].default || "";
      const newEl = createFromTemplate(val, initialContent);

      if (node) {
        container.insertBefore(newEl, container.firstChild);
      } else {
        container.appendChild(newEl);
      }
      
      refreshTreeAndHistory();
      e.target.value = "";
    };

    addRow.appendChild(select);
    return addRow;
  };

  // ------------------------------------------
  // テンプレート生成ユーティリティ
  // ------------------------------------------
  const createFromTemplate = (defId, content = "") => {
    const def = ELEMENT_DEFS[defId];
    if (!def) return null;

    let html = def.template.replace(/\$tag/g, def.tag);
    
    // $block がテンプレートにある場合はテキスト置換
    if (html.includes('$block')) {
      html = html.replace('$block', content);
    }

    const temp = document.createElement('div');
    temp.innerHTML = html.trim();
    const newEl = temp.firstElementChild;
    newEl.setAttribute(CONFIG.ATTRIBUTES.TREE_ID, "id-" + Math.random().toString(36).slice(2, 11));
    
    // --- 子要素の自動生成ロジック ---
    // default が別のモジュールID（ELEMENT_DEFSのキー）だった場合
    if (ELEMENT_DEFS[def.default]) {
      const dropZone = newEl.hasAttribute('data-drop-zone') ? newEl : newEl.querySelector('[data-drop-zone]');
      if (dropZone) {
        const childEl = createFromTemplate(def.default, ELEMENT_DEFS[def.default].default || "");
        if (childEl) dropZone.appendChild(childEl);
      }
    }

    if (def.attrs) {
      def.attrs.forEach(attr => newEl.setAttribute(attr, ""));
    }
    return newEl;
  };

  const updateElementTag = (oldEl, newTag, defId) => {
    const parent = oldEl.parentNode;
    if (!parent) return null; // 親が見つからない場合は中断

    const innerEl = oldEl.querySelector('[data-drop-zone]') || oldEl.querySelector('.inner') || oldEl;
    const innerContent = innerEl.innerHTML;
    
    const def = ELEMENT_DEFS[defId];
    if (!def) return null;

    let html = def.template.replace(/\$tag/g, newTag).replace('$block', innerContent);
    const temp = document.createElement('div');
    temp.innerHTML = html.trim();
    const newEl = temp.firstElementChild;

    // 属性とIDの引き継ぎ
    Array.from(oldEl.attributes).forEach(a => {
      if (a.name !== 'style') newEl.setAttribute(a.name, a.value);
    });
    newEl.setAttribute('style', oldEl.getAttribute('style') || '');
    
    parent.replaceChild(newEl, oldEl);
    refreshTreeAndHistory();
    
    return newEl; // 新しい要素を返す
  };
  
  // ------------------------------------------
  // 6. 編集パネル (ブロック増減 ＋ 数値・単位スピン復元)
  // ------------------------------------------
  const initEditWindow = (editData) => {
    const container = document.querySelector(CONFIG.SELECTORS.STYLE_PANEL_INNER);
    let targetEl = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${editData.id}"]`);
    if (!container || !targetEl) return;

    const defId = targetEl.getAttribute(CONFIG.ATTRIBUTES.MODULE) || targetEl.getAttribute(CONFIG.ATTRIBUTES.COMPONENT);
    const def = ELEMENT_DEFS[defId];

    // --- パネル全体の構造作成 ---
    container.innerHTML = `
      <h3 style="font-size:15px; border-bottom:1px solid #eee; padding-bottom:10px;">${editData.label}</h3>
      <div id="content-specific-editor"></div>
      
      <div style="margin-top:20px; border-top:2px solid #eee; padding-top:10px;">
        <label style="font-size:11px; font-weight:bold; display:block; margin-bottom:5px;">スタイルの追加:</label>
        <select id="prop-selector" style="width:100%; padding:5px; font-size:12px; border:1px solid #ccc;">
          <option value="">-- プロパティを選択 --</option>
          ${STYLE_DEFS.map(s => `<option value='${JSON.stringify(s)}'>${s.name} (${s.prop})</option>`).join('')}
        </select>
      </div>
      <div id="active-props-list" style="margin-top:15px; display:flex; flex-direction:column; gap:8px;"></div>
    `;

    const specWrap = document.getElementById('content-specific-editor');
    const propsList = document.getElementById('active-props-list');
    const propSelector = document.getElementById('prop-selector');

    // 1. 特殊編集（テキスト・タグ・属性・子要素数）の生成ロジック
    if (def) {
      // テキスト内容編集
      if (def.template.includes('$block')) {
        const inner = targetEl.querySelector('.inner') || targetEl;
        const textRow = document.createElement('div');
        textRow.innerHTML = `<label style="font-size:11px; font-weight:bold; display:block; margin-top:10px;">テキスト内容:</label>
          <textarea class="text-edit" style="width:100%; padding:5px; height:60px; font-size:12px; border:1px solid #ccc;">${inner.innerHTML}</textarea>`;
        specWrap.appendChild(textRow);
        textRow.querySelector('.text-edit').oninput = (e) => { inner.innerHTML = e.target.value; saveHistory(); };
      }

      // タグ編集
      const tagRow = document.createElement('div');
      tagRow.innerHTML = `<label style="font-size:11px; font-weight:bold; display:block; margin-top:10px;">タグ名:</label>
        <input type="text" class="tag-input" value="${targetEl.tagName.toLowerCase()}" style="width:100%; padding:5px; border:1px solid #ccc;">`;
      specWrap.appendChild(tagRow);
      tagRow.querySelector('.tag-input').onchange = (e) => {
        const newEl = updateElementTag(targetEl, e.target.value.toLowerCase().trim(), defId);
        if (newEl) targetEl = newEl; 
      };

      // 動的属性
      if (def.attrs) {
        def.attrs.forEach(attr => {
          const row = document.createElement('div');
          row.innerHTML = `<label style="font-size:11px; display:block;">${attr}:</label>
            <input type="text" class="attr-input" value="${targetEl.getAttribute(attr) || ''}" style="width:100%; padding:5px; border:1px solid #ccc;">`;
          specWrap.appendChild(row);
          row.querySelector('.attr-input').oninput = (e) => { targetEl.setAttribute(attr, e.target.value); saveHistory(); };
        });
      }
    }

    // 子要素増減の表示判定
    const dz = targetEl.querySelector('[data-drop-zone]') || (targetEl.hasAttribute('data-drop-zone') ? targetEl : null);
    if (dz) {
      const countRow = document.createElement('div');
      countRow.innerHTML = `<label style="font-size:11px; font-weight:bold; display:block; margin-top:10px;">子要素数:</label>
        <input type="number" class="count-input" value="${dz.children.length}" style="width:100%; padding:5px; border:1px solid #ccc;">`;
      specWrap.appendChild(countRow);
      countRow.querySelector('.count-input').onchange = (e) => updateChildrenCount(targetEl, parseInt(e.target.value));
    }

    // 2. 既存スタイルの復元 (現在適用されているカスタム変数を探して表示)
    if (editData.initialStyles) {
      Object.entries(editData.initialStyles).forEach(([p, v]) => {
        const sDef = STYLE_DEFS.find(s => s.prop === p) || { prop: p, name: p, type: p.includes('color') ? 'color' : 'number' };
        addPropInput(sDef, propsList, editData.id, v);
      });
    }

    // 3. スタイル追加イベント
    propSelector.onchange = (e) => {
      if (!e.target.value) return;
      addPropInput(JSON.parse(e.target.value), propsList, editData.id);
      e.target.value = "";
    };
  };

  // ------------------------------------------
  // 7. ユーティリティ (数値・単位入力ロジック)
  // ------------------------------------------

 

  const addPropInput = (item, parent, targetId, fullVal = "") => {
    if (!parent || parent.querySelector(`[data-p="${item.prop}"]`)) return;
    
    const div = document.createElement("div");
    div.setAttribute('data-p', item.prop);
    div.style.cssText = "display:flex; align-items:center; gap:5px; background:#f9f9f9; padding:5px; border:1px solid #ddd; border-radius:3px;";

    // 値と単位を分離 (例: "10px" -> num:"10", unit:"px")
    let numVal = "", unitVal = "px";
    if (fullVal) {
      const match = fullVal.match(/(-?\d+\.?\d*)(.*)/);
      if (match) {
        numVal = match[1];
        unitVal = match[2] || "px";
      } else {
        numVal = fullVal;
      }
    }

    let inputArea = "";
    if (item.type === 'color') {
      inputArea = `<input type="color" value="${fullVal || '#000000'}" style="width:40px; height:24px; border:1px solid #ccc; cursor:pointer;">`;
    } else {
      inputArea = `
        <input type="number" class="num-input" value="${numVal}" step="${item.step || '1'}" min="${item.min || ''}" max="${item.max || ''}" style="width:55px; font-size:10px; padding:2px; border:1px solid #ccc;">
        <select class="unit-select" style="font-size:9px; padding:2px; border:1px solid #ccc;">
          ${['px', '%', 'rem', 'vh', 'vw', 'auto'].map(u => `<option value="${u}" ${unitVal === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>`;
    }

    div.innerHTML = `
      <span style="font-size:10px; flex:1; white-space:nowrap; overflow:hidden; font-weight:bold;">${item.name}</span>
      ${inputArea}
      <button class="del-p" style="color:#ff4d4d; border:none; background:none; cursor:pointer; font-weight:bold; font-size:14px; padding:0 5px;">×</button>
    `;
    
    const updateStyle = () => {
      let finalVal = "";
      if (item.type === 'color') {
        finalVal = div.querySelector('input').value;
      } else {
        const n = div.querySelector('.num-input').value;
        const u = div.querySelector('.unit-select').value;
        finalVal = (u === 'auto') ? 'auto' : (n !== "" ? n + u : "");
      }
      applyStyleToDOM(targetId, item.prop, finalVal);
    };

    div.querySelectorAll('input, select').forEach(el => el.oninput = updateStyle);
    div.querySelector('.del-p').onclick = () => { 
      applyStyleToDOM(targetId, item.prop, ""); 
      div.remove(); 
    };
    parent.appendChild(div);
  };

  const applyStyleToDOM = (id, prop, val) => {
    const el = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${id}"]`);
    if (!el) return;
    
    // 属性から接頭辞を決定
    const mod = el.getAttribute(CONFIG.ATTRIBUTES.MODULE) || el.getAttribute(CONFIG.ATTRIBUTES.COMPONENT) || "";
    let pref = mod.startsWith('m-') ? "module" : mod.startsWith('c-') ? "component" : "layout";
    
    const vName = `--${pref}-${prop}`;
    if (val) {
      el.style.setProperty(vName, val);
    } else {
      el.style.removeProperty(vName);
    }
    saveHistory();
  };

  
  const appendActionButtons = (container, node) => {
    const wrap = document.createElement("div");
    wrap.style.display = "inline-flex"; 
    wrap.style.gap = "4px";
    wrap.style.alignItems = "center";

    // --- 修正：ラベルに STRUCTURE (【s】) が含まれる場合に追加ボタンを表示 ---
    const isStructure = node.label.includes(CONFIG.LABELS.STRUCTURE);
    if (isStructure) {
      // 設定ボタンの「左」に追加したいので、先に append します
      wrap.appendChild(createAddRow(node, false));
    }

    // 1. 【＋】ボタン (親要素タイプの場合のみ)
    const isParentType = node.label.includes(CONFIG.LABELS.BLOCK) || node.label.includes(CONFIG.LABELS.LIST);
    if (isParentType) {
      wrap.appendChild(createAddRow(node, false));
    }

    // 2. 【⚙】ボタン (edit-btn)
    const editBtn = document.createElement("button");
    editBtn.innerHTML = "⚙"; 
    editBtn.className = "edit-btn";
    editBtn.onclick = (e) => {
      e.stopPropagation();
      const targetDom = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
      if (!targetDom) return;
      const styleStr = targetDom.getAttribute('style') || "";
      const currentStyles = {};
      ['width', 'height', 'bg-color', 'opacity', 'margin-top', 'margin-bottom'].forEach(p => {
        const match = styleStr.match(new RegExp(`--[a-z]+-${p}\\s*:\\s*([^;]+)`));
        if (match) currentStyles[p] = match[1].trim();
      });
      document.querySelector(CONFIG.SELECTORS.STYLE_BLOCK)?.classList.remove('is-hidden');
      initEditWindow({ id: node.id, label: node.label.replace(/【.*?】/g, ''), initialStyles: currentStyles });
    };

    // 3. 【×】ボタン (delete-btn)
    const delBtn = document.createElement("button");
    delBtn.innerHTML = "×"; 
    delBtn.className = "delete-btn";
    delBtn.onclick = (e) => { 
      e.stopPropagation(); 
      const t = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`); 
      if (t && confirm(`削除？`)) { t.remove(); refreshTreeAndHistory(); } 
    };

    wrap.appendChild(editBtn); 
    wrap.appendChild(delBtn);
    container.appendChild(wrap);
  };

  const handleHover = (id, active) => {
    const t = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${id}"]`);
    if (t) t.style.setProperty('--tree-hover', active ? '0.7' : '1.0');
  };

  const saveHistory = () => {
    if (state.isUndoing) return;
    const tree = buildModuleTree(document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER));
    if (state.historyStack.length > 0 && JSON.stringify(state.historyStack[state.historyStack.length - 1]) === JSON.stringify(tree)) return;
    state.historyStack.push(tree);
    if (state.historyStack.length > CONFIG.MAX_HISTORY) state.historyStack.shift();
  };

  const undo = () => {
    if (state.historyStack.length <= 1) return;
    state.isUndoing = true;
    state.historyStack.pop();
    const prev = state.historyStack[state.historyStack.length - 1];
    applyNewOrder(prev, document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER));
    refreshTreeDisplay(prev);
    setTimeout(() => state.isUndoing = false, 100);
  };

  const refreshTreeAndHistory = () => { saveHistory(); refreshTreeDisplay(); };
  window.closeStyleWindow = () => document.querySelector(CONFIG.SELECTORS.STYLE_BLOCK)?.classList.add('is-hidden');

  init();
};

document.addEventListener('DOMContentLoaded', WebModuleBuilder);
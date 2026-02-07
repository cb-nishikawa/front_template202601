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
      BLOCK: '【block】',
      LIST: '【list】'
    },
    MAX_HISTORY: 50
  };

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
        const isBlock = el.classList.contains('block');
        const isLi = el.tagName === 'LI';

        if (comp || mod || isBlock || isLi) {
          let label = isBlock ? CONFIG.LABELS.BLOCK : isLi ? CONFIG.LABELS.LIST : comp ? `${CONFIG.LABELS.COMPONENT}${comp}` : `${CONFIG.LABELS.MODULE}${mod}`;
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
    // ★ 修正：treeが空でも、親がブロック/リストなら ul を作成する
    const isParentLi = parent.tagName === 'LI';
    const parentLabel = isParentLi ? parent.querySelector('.label-text')?.textContent || "" : "";
    const isStructure = parentLabel.includes(CONFIG.LABELS.BLOCK) || parentLabel.includes(CONFIG.LABELS.LIST);

    // ルート（親がdisplay）か、構造要素（block/list）の場合は ul を作る
    if (tree.length === 0 && !isStructure && parent.id !== "tree-display-inner") return;

    const ul = document.createElement("ul");
    ul.className = 'sortable-list';
    
    // ★ 追加：空の ul に最低限のドロップ領域を確保するためのスタイル（JSで直接制御）
    ul.style.minHeight = "20px";
    ul.style.paddingBottom = "10px";

    tree.forEach(node => {
      const li = document.createElement("li");
      li.setAttribute('data-id', node.id);
      
      const isParentType = node.label.includes(CONFIG.LABELS.BLOCK) || node.label.includes(CONFIG.LABELS.LIST);
      const row = document.createElement(isParentType ? "p" : "div");
      row.className = "parent" + (isParentType ? " no-drag" : "");

      const dragHandle = !isParentType ? `<span class="drag-handle">≡</span>` : '';
      row.innerHTML = `${dragHandle}<span class="label-text">${node.label}</span>`;
      
      appendActionButtons(row, node);
      li.appendChild(row);
      
      // 子要素があれば再帰、なければ空の状態を renderTree に渡して ul だけ作らせる
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
        // ★ 修正：ドロップを受け入れるかどうかの判定
        put: (to) => {
          // ドロップ先の親要素（li）を取得
          const parentLi = to.el.closest('li');
          if (!parentLi) return true; // ルートへのドロップは許可

          const labelText = parentLi.querySelector('.label-text')?.textContent || "";
          // ★ 親が【block】か【list】を含んでいる場合のみドロップを許可
          return labelText.includes(CONFIG.LABELS.BLOCK) || labelText.includes(CONFIG.LABELS.LIST);
        }
      },
      handle: '.drag-handle',
      filter: '.no-drag, .edit-btn, .delete-btn, .tree-add-row, input, textarea, select',
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
    if (isRoot) {
      select.style.cssText = "width:100%; font-size:11px; padding:4px; border-radius:3px; border:1px solid #ccc; cursor:pointer;";
    } else {
      // ⚙ボタンと高さを揃えた＋ボタン型
      select.style.cssText = "width: 24px; height: 20px; font-size: 12px; font-weight: bold; border: 1px solid #ccc; border-radius: 3px; background: #fff; cursor: pointer; text-align: center; padding: 0;";
    }
    
    const options = [
      { label: "＋", val: "" },
      { label: "テキスト", type: "module", val: "m-text01" },
      { label: "見出し", type: "module", val: "m-title01" },
      { label: "画像", type: "module", val: "m-image01" },
      { label: "ボタン", type: "module", val: "m-btn01" },
      { label: "リスト", type: "module", val: "m-uList01" },
      { label: "レイアウト", type: "module", val: "l-gridContents01" },
      { label: "コンポーネント", type: "component", val: "c-component01" }
    ];

    options.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.val; 
      o.textContent = opt.label;
      if (opt.type) o.setAttribute('data-type', opt.type);
      select.appendChild(o);
    });

    select.onchange = (e) => {
      const val = e.target.value;
      if (!val) return;
      const opt = e.target.selectedOptions[0];
      const type = opt.getAttribute('data-type');
      
      let container;
      if (node) {
        const targetDom = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
        if (!targetDom) return;
        container = findContentContainer(targetDom);
      } else {
        container = document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER);
      }
      
      if (!container) return;

      const isModule = val.startsWith('m-');
      const newEl = document.createElement(isModule ? 'p' : 'div');
      const newId = "id-" + Math.random().toString(36).slice(2, 11);
      newEl.setAttribute(CONFIG.ATTRIBUTES.TREE_ID, newId);
      newEl.setAttribute(type === 'component' ? CONFIG.ATTRIBUTES.COMPONENT : CONFIG.ATTRIBUTES.MODULE, val);

      if (val === 'm-uList01') {
        newEl.innerHTML = `<span class="wrapper"><span class="inner"><ul><li data-id="li-${newId}"><p data-module="m-text01" data-tree-id="child-${newId}"><span class="wrapper"><span class="inner">項目</span></span></p></li></ul></span></span>`;
      } else if (val === 'm-image01') {
        newEl.innerHTML = `<span class="wrapper"><span class="inner"><img src="https://placehold.jp/150x150.png" alt=""></span></span>`;
      } else if (isModule) {
        newEl.innerHTML = `<span class="wrapper"><span class="inner">新規内容</span></span>`;
      } else {
        newEl.innerHTML = `<div class="wrapper"><div class="inner"><div class="block contents" data-tree-id="blk-${newId}"></div></div></div>`;
      }

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
  // 6. 編集パネル (ブロック増減 ＋ 数値・単位スピン復元)
  // ------------------------------------------
  const initEditWindow = (editData) => {
    const container = document.querySelector(CONFIG.SELECTORS.STYLE_PANEL_INNER);
    if (!container) return;

    const targetEl = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${editData.id}"]`);
    if (!targetEl) return;

    const modVal = targetEl.getAttribute(CONFIG.ATTRIBUTES.MODULE) || "";
    const compVal = targetEl.getAttribute(CONFIG.ATTRIBUTES.COMPONENT) || "";
    const innerEl = targetEl.querySelector('.inner');

    container.innerHTML = `
      <div class="edit-header" style="padding-bottom:15px; border-bottom:1px solid #eee; margin-bottom:15px;">
        <h3 style="margin:0; font-size:15px;">${editData.label}</h3>
      </div>
      <div id="content-specific-editor" style="margin-bottom:15px;"></div>
      <div class="style-adder" style="margin-bottom:10px;">
        <select id="prop-selector" style="width:100%; padding:8px; border:1px solid #ccc;">
          <option value="">+ スタイルを追加...</option>
          <option value='{"name":"幅","prop":"width","type":"number"}'>幅</option>
          <option value='{"name":"高さ","prop":"height","type":"number"}'>高さ</option>
          <option value='{"name":"背景色","prop":"bg-color","type":"color"}'>背景色</option>
          <option value='{"name":"余白(上)","prop":"margin-top","type":"number"}'>余白(上)</option>
          <option value='{"name":"余白(下)","prop":"margin-bottom","type":"number"}'>余白(下)</option>
          <option value='{"name":"不透明度","prop":"opacity","type":"number","step":"0.1","min":"0","max":"1"}'>不透明度</option>
        </select>
      </div>
      <div id="active-props-list" style="display:flex; flex-direction:column; gap:8px;"></div>
    `;

    const specWrap = document.getElementById('content-specific-editor');

    if (modVal.startsWith('l-') || compVal) {
      const parent = innerEl || targetEl;
      const count = parent.querySelectorAll(':scope > .block').length;
      specWrap.innerHTML = `
        <div style="background:#e2f3f5; padding:10px; border-radius:4px; border:1px solid #bee5eb; margin-bottom:10px;">
          <label style="font-size:11px; font-weight:bold; color:#0c5460;">ブロック数:</label>
          <input type="number" id="block-count-input" value="${count}" min="1" max="12" style="width:100%; padding:5px; margin-top:5px;">
          ${modVal === 'l-gridContents01' ? `
            <label style="font-size:11px; color:#0c5460; display:block; margin-top:8px;">グリッド(data-grid):</label>
            <input type="text" id="grid-attr-input" value="${targetEl.getAttribute('data-grid')||''}" style="width:100%; padding:5px;">
          ` : ''}
        </div>`;
      document.getElementById('block-count-input').onchange = (e) => updateChildrenCount(targetEl, parseInt(e.target.value), 'block');
      const gIn = document.getElementById('grid-attr-input');
      if(gIn) gIn.oninput = (e) => { targetEl.setAttribute('data-grid', e.target.value); saveHistory(); };
    } 
    else if (modVal === 'm-uList01') {
      specWrap.innerHTML = `<label style="font-size:11px;">リスト項目数:</label><input type="number" id="list-count-input" value="${targetEl.querySelectorAll('li').length}" style="width:100%; padding:5px;">`;
      document.getElementById('list-count-input').onchange = (e) => updateChildrenCount(targetEl, parseInt(e.target.value), 'list');
    } 
    else if (modVal === 'm-image01') {
      const img = targetEl.querySelector('img');
      specWrap.innerHTML = `<input type="text" id="img-src" value="${img?.src||''}" placeholder="src" style="width:100%; padding:5px; margin-bottom:5px;"><input type="text" id="img-alt" value="${img?.alt||''}" placeholder="alt" style="width:100%; padding:5px;">`;
      const up = () => { const i = targetEl.querySelector('img'); if(i){ i.src=document.getElementById('img-src').value; i.alt=document.getElementById('img-alt').value; saveHistory(); } };
      document.getElementById('img-src').oninput = up; document.getElementById('img-alt').oninput = up;
    } 
    else if (innerEl) {
      specWrap.innerHTML = `<label style="font-size:11px;">テキスト内容:</label><textarea id="text-in" style="width:100%; height:80px;">${innerEl.innerHTML.trim()}</textarea>`;
      document.getElementById('text-in').oninput = (e) => { innerEl.innerHTML = e.target.value; saveHistory(); };
    }

    const propsList = document.getElementById('active-props-list');
    if (editData.initialStyles) {
      Object.entries(editData.initialStyles).forEach(([p, v]) => {
        const type = p.includes('color') ? 'color' : 'number';
        addPropInput({ prop: p, name: p, type }, propsList, editData.id, v);
      });
    }
    document.getElementById('prop-selector').onchange = (e) => {
      if (!e.target.value) return;
      addPropInput(JSON.parse(e.target.value), propsList, editData.id);
      e.target.value = "";
    };
  };

  // ------------------------------------------
  // 7. ユーティリティ (数値・単位入力ロジックを統合)
  // ------------------------------------------
  const addPropInput = (item, parent, targetId, fullVal = "") => {
    if (parent.querySelector(`[data-p="${item.prop}"]`)) return;
    const div = document.createElement("div");
    div.setAttribute('data-p', item.prop);
    div.style.cssText = "display:flex; align-items:center; gap:5px; background:#fff; padding:5px; border:1px solid #eee; border-radius:3px;";

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
      inputArea = `<input type="color" value="${fullVal || '#000000'}" style="width:40px; height:24px; border:1px solid #ccc;">`;
    } else {
      inputArea = `
        <input type="number" class="num-input" value="${numVal}" step="${item.step || '1'}" min="${item.min || ''}" max="${item.max || ''}" style="width:55px; font-size:10px; padding:2px;">
        <select class="unit-select" style="font-size:9px; padding:2px;">
          ${['px', '%', 'rem', 'vh', 'vw', 'auto'].map(u => `<option value="${u}" ${unitVal === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>`;
    }

    div.innerHTML = `
      <span style="font-size:10px; flex:1; white-space:nowrap; overflow:hidden;">${item.name}</span>
      ${inputArea}
      <button class="del-p" style="color:red; border:none; background:none; cursor:pointer; font-weight:bold;">×</button>
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
    const mod = el.getAttribute(CONFIG.ATTRIBUTES.MODULE) || el.getAttribute(CONFIG.ATTRIBUTES.COMPONENT) || "";
    let pref = mod.startsWith('m-') ? "module" : mod.startsWith('c-') ? "component" : "layout";
    const vName = `--${pref}-${prop}`;
    val ? el.style.setProperty(vName, val) : el.style.removeProperty(vName);
    saveHistory();
  };

  const updateChildrenCount = (targetDom, count, type) => {
    const parent = type === 'list' ? (targetDom.querySelector('ul') || targetDom) : (targetDom.querySelector('.inner') || targetDom);
    if (!parent) return;
    const selector = type === 'list' ? ':scope > li' : ':scope > .block';
    const items = parent.querySelectorAll(selector);
    const diff = count - items.length;

    if (diff > 0) {
      for (let i = 0; i < diff; i++) {
        const el = document.createElement(type === 'list' ? 'li' : 'div');
        const nid = "id-" + Math.random().toString(36).slice(2, 11);
        el.setAttribute(CONFIG.ATTRIBUTES.TREE_ID, nid);
        if (type === 'list') {
          el.innerHTML = `<p data-module="m-text01" data-tree-id="p-${nid}"><span class="wrapper"><span class="inner">新規項目</span></span></p>`;
        } else {
          el.className = 'block contents';
        }
        parent.appendChild(el);
      }
    } else {
      for (let i = 0; i < Math.abs(diff); i++) { if (parent.lastElementChild) parent.removeChild(parent.lastElementChild); }
    }
    refreshTreeAndHistory();
  };

  const appendActionButtons = (container, node) => {
    const wrap = document.createElement("div");
    wrap.style.display = "inline-flex"; 
    wrap.style.gap = "4px";
    wrap.style.alignItems = "center";

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
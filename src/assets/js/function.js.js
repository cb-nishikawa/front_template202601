import Sortable from 'sortablejs';

/**
 * ウェブサイト制作ツール：モジュールツリー管理システム
 */
const WebModuleBuilder = () => {
  // ------------------------------------------
  // 1. 設定・定数（UPPER_SNAKE_CASE）
  // ------------------------------------------
  const CONFIG = {
    SELECTORS: {
      CONTAINER_INNER: '[data-target="container"] .inner .block.contents',
      TREE_DISPLAY_INNER: '[data-target="treeDisplay"] .inner',
      EXCLUDE_AREAS: '[data-target="treeDisplay"], [data-target="treeSet"]',
      SUB_WINDOW_CONTAINER: '#tree-container',
      INNER_CLASS: '.inner'
    },
    ATTRIBUTES: {
      TREE_ID: 'data-tree-id',
      COMPONENT: 'data-component',
      MODULE: 'data-module',
      LI_ID: 'data-id'
    },
    LABELS: {
      COMPONENT: '【component】',
      MODULE: '【module】',
      BLOCK: '【block】'
    },
    STORAGE_KEYS: {
      TREE_DATA: 'moduleTreeData',
      HOVER_EVENT: 'treeHoverEvent',
      SORT_EVENT: 'treeSortEvent',
      UNDO_EVENT: 'treeUndoEvent',
      STYLE_EVENT: 'treeStyleEvent', // スタイル変更通知用
      CURRENT_EDIT: 'currentEditModule' // 編集対象モジュール共有用
    },
    MAX_HISTORY: 50,
    IS_SUB_WINDOW: window.location.pathname.includes('tree.html'),
    IS_EDIT_WINDOW: window.location.pathname.includes('edit.html')
  };

  const state = {
    historyStack: [],
    isUndoing: false
  };

  // ------------------------------------------
  // 2. 初期化
  // ------------------------------------------
  const init = () => {
    // 編集ウィンドウの場合は専用の初期化
    if (CONFIG.IS_EDIT_WINDOW) {
      initEditWindow();
      return;
    }

    const containerInner = document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER);
    const treeDisplayInner = document.querySelector(CONFIG.SELECTORS.TREE_DISPLAY_INNER);

    const isTreeMin = localStorage.getItem('tree-minimized');

    if (CONFIG.IS_SUB_WINDOW) {
      const container = document.querySelector(CONFIG.SELECTORS.SUB_WINDOW_CONTAINER);
      const dataStr = localStorage.getItem(CONFIG.STORAGE_KEYS.TREE_DATA);
      if (dataStr && container) {
        const parsed = JSON.parse(dataStr);
        renderTree(parsed.tree ? parsed.tree : parsed, container);
      }
    } else {
      if (containerInner) {
        const tree = buildModuleTree(containerInner);
        localStorage.setItem(CONFIG.STORAGE_KEYS.TREE_DATA, JSON.stringify(tree));
        if (treeDisplayInner) {
          treeDisplayInner.innerHTML = "";
          renderTree(tree, treeDisplayInner);
        }
        state.historyStack = [tree];
      }
    }
    
    if (isTreeMin === 'true') {
      const treeSet = document.querySelector('[data-target="treeSet"]');
      if (treeSet) {
        treeSet.classList.add('is-minimum');
      }
    }
    
    setupEventListeners();
  };

  // ------------------------------------------
  // 3. イベント監視
  // ------------------------------------------
  const setupEventListeners = () => {
    window.addEventListener('keydown', (e) => {
      const isZ = e.key.toLowerCase() === 'z';
      const isUndoKey = (e.ctrlKey || e.metaKey) && isZ;
      const isTyping = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);

      if (isUndoKey && !isTyping) {
        e.preventDefault();
        undo();
      }
    }, true);

    window.addEventListener('storage', (e) => {
      if (!e.newValue) return;

      // ツリー窓からの編集リクエストを受信
      if (e.key === 'EDIT_REQUEST_EVENT') {
        const { id, label } = JSON.parse(e.newValue);
        const targetEl = document.querySelector(`[data-tree-id="${id}"]`);
        const currentStyles = {};

        if (targetEl) {
          const nameAttr = targetEl.getAttribute('data-module') || targetEl.getAttribute('data-component') || "";
          const prefix = nameAttr.startsWith('m-') ? "module" : (nameAttr.startsWith('c-') ? "component" : "layout");
          const varPrefix = `--${prefix}-`;
          const rawStyle = targetEl.getAttribute('style') || "";

          // スタイル抽出（ここは今のロジックを流用）
          const checkProps = ['width', 'height', 'bg-color', 'opacity', 'margin-top', 'margin-bottom']; // 必要分
          checkProps.forEach(p => {
            const regex = new RegExp(`${varPrefix}${p}\\s*:\\s*([^;]+)`);
            const match = rawStyle.replace(/\u00a0/g, ' ').match(regex);
            if (match && match[1]) currentStyles[p] = match[1].trim();
          });

          // 【重要】抽出したデータを localStorage に書き込む
          // これにより、すでに開いている edit.html が storage イベントを検知して表示される
          localStorage.setItem(CONFIG.STORAGE_KEYS.CURRENT_EDIT, JSON.stringify({
            id, label, initialStyles: currentStyles, ts: Date.now()
          }));
        }
      }

      // 編集ウィンドウの場合は自分に関係する更新だけ見る
      if (CONFIG.IS_EDIT_WINDOW) {
        if (e.key === CONFIG.STORAGE_KEYS.CURRENT_EDIT) initEditWindow();
        return;
      }

      if (CONFIG.IS_SUB_WINDOW) {
        if (e.key === CONFIG.STORAGE_KEYS.TREE_DATA) {
          const container = document.querySelector(CONFIG.SELECTORS.SUB_WINDOW_CONTAINER);
          if (!container) return;
          const parsed = JSON.parse(e.newValue);
          container.innerHTML = "";
          renderTree(parsed.tree ? parsed.tree : parsed, container);
        }
      } else {
        // メイン窓側の処理
        const containerInner = document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER);
        
        // スタイル変更命令を受信
        if (e.key === CONFIG.STORAGE_KEYS.STYLE_EVENT) {
          const { id, cssVar, value } = JSON.parse(e.newValue);
          // cssVar が undefined になっていないか applyStyleToDOM に渡す
          applyStyleToDOM(id, cssVar, value); 
          return;
        }

        if (e.key === CONFIG.STORAGE_KEYS.UNDO_EVENT) undo();
        
        if (e.key === CONFIG.STORAGE_KEYS.SORT_EVENT) {
          const { order } = JSON.parse(e.newValue);
          if (containerInner) {
            applyNewOrder(order, containerInner);
            saveHistory();
          }
        }
        
        if (e.key === CONFIG.STORAGE_KEYS.HOVER_EVENT) {
          const { id, action } = JSON.parse(e.newValue);
          handleHover(id, action);
        }
      }
    });
  };

  // ------------------------------------------
  // 4. アクション
  // ------------------------------------------
  const undo = () => {
    if (CONFIG.IS_SUB_WINDOW) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.UNDO_EVENT, Date.now().toString());
      return;
    }
    if (state.historyStack.length <= 1) return;

    state.isUndoing = true;
    state.historyStack.pop();
    const previousTree = state.historyStack[state.historyStack.length - 1];

    const containerInner = document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER);
    const treeDisplayInner = document.querySelector(CONFIG.SELECTORS.TREE_DISPLAY_INNER);

    if (previousTree && containerInner) {
      applyNewOrder(previousTree, containerInner);
      const updatePayload = { tree: previousTree, updatedAt: Date.now() };
      localStorage.setItem(CONFIG.STORAGE_KEYS.TREE_DATA, JSON.stringify(updatePayload));

      if (treeDisplayInner) {
        treeDisplayInner.innerHTML = "";
        renderTree(previousTree, treeDisplayInner);
      }
    }
    setTimeout(() => { state.isUndoing = false; }, 100);
  };

  const handleHover = (id, action) => {
    if (CONFIG.IS_SUB_WINDOW) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.HOVER_EVENT, JSON.stringify({ id, action, ts: Date.now() }));
    } else {
      const target = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${id}"]`);
      if (target) target.style.setProperty('--tree-hover', action === 'enter' ? '0.7' : '1.0');
    }
  };

  /**
   * メイン窓のDOM要素にスタイル（CSS変数）を適用する
   */
  /**
   * ルールに基づいたプレフィックス付きCSS変数を適用する
   * m- -> --module-
   * l- -> --layout-
   * c- -> --component-
   */
  const applyStyleToDOM = (id, prop, value) => {
    const targetEl = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${id}"]`);
    if (!targetEl) return;

    const moduleAttr = targetEl.getAttribute(CONFIG.ATTRIBUTES.MODULE) || "";
    const componentAttr = targetEl.getAttribute(CONFIG.ATTRIBUTES.COMPONENT) || "";
    const name = moduleAttr || componentAttr;

    // SCSSのプレフィックス決定
    let prefix = "layout";
    if (name.startsWith('m-')) prefix = "module";
    else if (name.startsWith('c-')) prefix = "component";
    else if (name.startsWith('l-')) prefix = "layout";

    // 最終的な変数名例: --module-inner-padding-top
    const fullVarName = `--${prefix}-${prop}`;

    if (value === "" || value === null) {
      targetEl.style.removeProperty(fullVarName);
    } else {
      targetEl.style.setProperty(fullVarName, value);
    }
  };



  
  // ------------------------------------------
  // edit.html 専用の表示ロジック
  // ------------------------------------------
  const initEditWindow = () => {
    // 編集窓（edit.html）とメイン窓の両方に対応
    const container = document.querySelector('#style-edit-panel .inner');
    if (!container) return;

    let editData;
    const params = new URLSearchParams(window.location.search);
    const dataParam = params.get('editData');
    
    // URLにあればURL優先、なければlocalStorageから最新を取る
    if (dataParam) {
      editData = JSON.parse(decodeURIComponent(dataParam));
    } else {
      const localData = localStorage.getItem(CONFIG.STORAGE_KEYS.CURRENT_EDIT);
      if (localData) editData = JSON.parse(localData);
    }

    if (!editData) return;
    const { id, label, initialStyles } = editData;

    // --- 【追加】現在の実際のstyle属性文字列を再現（ここがご要望の箇所です） ---
    // initialStyles（抽出済みデータ）から文字列を組み立て直します
    let styleString = "";
    const nameAttr = label || "";
    let prefix = nameAttr.startsWith('m-') ? "module" : (nameAttr.startsWith('c-') ? "component" : "layout");
    
    Object.keys(initialStyles).forEach(key => {
      styleString += `--${prefix}-${key}: ${initialStyles[key]}; `;
    });

    // 2. UIのベースを作成 (デバッグ用の文字列表示エリアを追加)
    container.innerHTML = `
      <div class="edit-header" style="padding-bottom:15px; border-bottom:1px solid #eee; margin-bottom:15px;">
        <h3 style="margin:0 0 10px 0; font-size:16px;">${label}</h3>
        
        <div style="margin-bottom:10px;">
          <label style="font-size:10px; color:#999;">現在の適用スタイル:</label>
          <textarea readonly style="width:100%; height:40px; font-size:10px; background:#f4f4f4; border:1px solid #ddd; padding:4px; box-sizing:border-box; color:#666;">${styleString || '適用スタイルなし'}</textarea>
        </div>

        <select id="prop-selector" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc;">
          <option value="">+ スタイルを追加...</option>
          <optgroup label="本体 (Base)">
            <option value='{"name":"幅","prop":"width"}'>幅</option>
            <option value='{"name":"高さ","prop":"height"}'>高さ</option>
            <option value='{"name":"背景色","prop":"bg-color","type":"color"}'>背景色</option>
            <option value='{"name":"不透明度","prop":"opacity"}'>不透明度</option>
            <option value='{"name":"余白(上)","prop":"margin-top"}'>余白(上)</option>
            <option value='{"name":"余白(下)","prop":"margin-bottom"}'>余白(下)</option>
          </optgroup>
          </select>
      </div>
      <div id="active-props-list"></div>
    `;

    const propsList = document.getElementById('active-props-list');

    // 3. 初期値の復元（既存のロジック）
    const ALL_ITEMS = [
      { name: "幅", prop: "width" }, { name: "高さ", prop: "height" }, 
      { name: "背景色", prop: "bg-color", type: "color" }, { name: "不透明度", prop: "opacity" },
      { name: "余白(上)", prop: "margin-top" }, { name: "余白(下)", prop: "margin-bottom" },
      { name: "Wrapper 幅", prop: "wrapper-width" }, { name: "Wrapper 上余白", prop: "wrapper-padding-top" },
      { name: "Wrapper 下余白", prop: "wrapper-padding-bottom" }, { name: "Wrapper 背景色", prop: "wrapper-bg-color", type: "color" },
      { name: "Inner 幅", prop: "inner-width" }, { name: "Inner 上余白", prop: "inner-padding-top" },
      { name: "Inner 下余白", prop: "inner-padding-bottom" }, { name: "Inner 背景色", prop: "inner-bg-color", type: "color" }
    ];

    if (initialStyles && Object.keys(initialStyles).length > 0) {
      Object.keys(initialStyles).forEach(propKey => {
        const foundItem = ALL_ITEMS.find(i => i.prop === propKey);
        if (foundItem) {
          addPropInput(foundItem, propsList, id, initialStyles[propKey]);
        }
      });
    }

    document.getElementById('prop-selector').onchange = (e) => {
      if (!e.target.value) return;
      const item = JSON.parse(e.target.value);
      if (propsList.querySelector(`[data-prop-name="${item.prop}"]`)) return;
      addPropInput(item, propsList, id);
      e.target.value = "";
    };
  };

  /**
   * 入力フィールドを生成してリストに追加（初期値復元対応）
   */
  const addPropInput = (item, parent, targetId, initialValue = "") => {
    const div = document.createElement('div');
    div.className = "edit-field active";
    div.setAttribute('data-prop-name', item.prop);
    div.style.cssText = "display:flex; align-items:flex-end; gap:8px; margin-bottom:12px; background:#f9f9f9; padding:10px; border:1px solid #eee; border-radius:4px;";

    const isColor = item.type === 'color';
    const units = ['px', '%', 'rem', 'em', 'vh', 'vw', 'auto', 'none'];

    div.innerHTML = `
      <div style="flex:1">
        <label style="display:block; font-size:11px; color:#666; margin-bottom:4px;">${item.name}</label>
        <div style="display:flex; gap:4px; align-items: stretch;">
          <div style="position:relative; flex:1; display:flex;">
            <input type="${item.type || 'text'}" 
                   class="style-value" 
                   placeholder="数値"
                   style="width:100%; padding:6px 24px 6px 6px; border:1px solid #ccc; border-radius:3px; box-sizing:border-box;">
            
            ${!isColor ? `
              <div class="spin-buttons" style="position:absolute; right:1px; top:1px; bottom:1px; display:flex; flex-direction:column; width:18px; border-left:1px solid #eee;">
                <button class="spin-up" style="flex:1; padding:0; border:none; background:#fff; cursor:pointer; font-size:8px; border-bottom:1px solid #eee;">▲</button>
                <button class="spin-down" style="flex:1; padding:0; border:none; background:#fff; cursor:pointer; font-size:8px;">▼</button>
              </div>
            ` : ''}
          </div>

          ${!isColor ? `
            <select class="style-unit" style="padding:6px; border:1px solid #ccc; border-radius:3px; background:#fff; cursor:pointer;">
              ${units.map(u => `<option value="${u === 'auto' || u === 'none' ? '' : u}">${u}</option>`).join('')}
            </select>
          ` : ''}
        </div>
      </div>
      <button class="remove-prop" style="border:none; background:none; cursor:pointer; font-size:20px; color:#ccc; margin-bottom:4px;">&times;</button>
    `;

    const valInput = div.querySelector('.style-value');
    const unitSelect = div.querySelector('.style-unit');

    // --- 【追加】初期値の分離ロジック (例: "50%" -> value:50, unit:%) ---
    if (initialValue) {
      if (isColor) {
        valInput.value = initialValue;
      } else {
        const num = parseFloat(initialValue);
        const unit = initialValue.replace(num, '').trim();
        valInput.value = isNaN(num) ? initialValue : num; // 数値でなければそのまま（autoなど）
        if (unitSelect && !isNaN(num)) {
          unitSelect.value = unit;
        }
      }
    }

    // 送信処理
    const sendUpdate = () => {
      let val = valInput.value;
      if (!isColor && val !== "" && !isNaN(val) && unitSelect) {
        val += unitSelect.value;
      }

      const payload = { id: targetId, cssVar: item.prop, value: val, ts: Date.now() };

      // 1. 保存
      localStorage.setItem(CONFIG.STORAGE_KEYS.STYLE_EVENT, JSON.stringify(payload));

      // 2. メイン窓なら即時反映 (IS_EDIT_WINDOW でない = メイン窓内)
      if (!CONFIG.IS_EDIT_WINDOW) {
        applyStyleToDOM(targetId, item.prop, val);
      }
    };

    // 数値変更の共通ロジック
    const changeValue = (direction, isShift) => {
      let num = parseFloat(valInput.value) || 0;
      let step = isShift ? 10 : 1;
      valInput.value = direction === 'up' ? num + step : num - step;
      sendUpdate();
    };

    // 1. キーボードイベント
    valInput.addEventListener('keydown', (e) => {
      if (isColor) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); changeValue('up', e.shiftKey); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); changeValue('down', e.shiftKey); }
      else if (e.key === 'Enter') { e.preventDefault(); sendUpdate(); valInput.blur(); }
    });

    // 2. 矢印ボタンクリックイベント
    if (!isColor) {
      div.querySelector('.spin-up').addEventListener('click', (e) => changeValue('up', e.shiftKey));
      div.querySelector('.spin-down').addEventListener('click', (e) => changeValue('down', e.shiftKey));
    }

    valInput.addEventListener('input', sendUpdate);
    if (unitSelect) unitSelect.addEventListener('change', sendUpdate);

    // 削除処理
    div.querySelector('.remove-prop').addEventListener('click', () => {
      const payload = {
        id: targetId, cssVar: item.prop, value: "", ts: Date.now()
      };
      
      localStorage.setItem(CONFIG.STORAGE_KEYS.STYLE_EVENT, JSON.stringify(payload));
      
      if (!CONFIG.IS_EDIT_WINDOW) {
        applyStyleToDOM(targetId, item.prop, "");
      }
      div.remove();
    });

    parent.appendChild(div);
  };





  // ------------------------------------------
  // 5. コアロジック
  // ------------------------------------------
  const buildModuleTree = (root) => {
    if (!root) return [];
    const children = Array.from(root.children);
    let nodes = [];

    children.forEach((el) => {
      if (el.closest(CONFIG.SELECTORS.EXCLUDE_AREAS)) return;
      
      const isComp = el.hasAttribute(CONFIG.ATTRIBUTES.COMPONENT);
      const isMod = el.hasAttribute(CONFIG.ATTRIBUTES.MODULE);
      const isBlock = el.classList.contains('block');

      if (isComp || isMod || isBlock) {
        let label = "";
        if (isComp) label = `${CONFIG.LABELS.COMPONENT}${el.getAttribute(CONFIG.ATTRIBUTES.COMPONENT)}`;
        else if (isMod) label = `${CONFIG.LABELS.MODULE}${el.getAttribute(CONFIG.ATTRIBUTES.MODULE)}`;
        else if (isBlock) label = CONFIG.LABELS.BLOCK;

        nodes.push({
          label: label,
          id: getPersistentId(el),
          children: buildModuleTree(el) 
        });
      } else {
        nodes = nodes.concat(buildModuleTree(el));
      }
    });
    return nodes;
  };

  const applyNewOrder = (order, parentContainer) => {
    if (!order || !parentContainer) return;

    order.forEach(item => {
      const targetEl = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${item.id}"]`);
      if (targetEl) {
        if (parentContainer !== targetEl && !targetEl.contains(parentContainer)) {
          parentContainer.appendChild(targetEl);
        }

        if (item.children && item.children.length > 0) {
          let nextParent = targetEl.classList.contains('block') ? targetEl : (
                             targetEl.querySelector(':scope > .inner') || 
                             targetEl.querySelector(':scope > .wrapper > .inner') ||
                             targetEl.querySelector(':scope > .wrapper') ||
                             targetEl.querySelector('li') ||
                             targetEl
          );
          applyNewOrder(item.children, nextParent);
        }
      }
    });
  };

  const saveHistory = () => {
    if (CONFIG.IS_SUB_WINDOW || CONFIG.IS_EDIT_WINDOW || state.isUndoing) return;
    const containerInner = document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER);
    if (!containerInner) return;
    const currentTree = buildModuleTree(containerInner);
    if (state.historyStack.length > 0) {
      if (JSON.stringify(state.historyStack[state.historyStack.length - 1]) === JSON.stringify(currentTree)) return;
    }
    state.historyStack.push(currentTree);
    if (state.historyStack.length > CONFIG.MAX_HISTORY) state.historyStack.shift();
  };

  const saveNewOrder = () => {
    const rootUl = CONFIG.IS_SUB_WINDOW
      ? document.querySelector(`${CONFIG.SELECTORS.SUB_WINDOW_CONTAINER} > ul`)
      : document.querySelector(`${CONFIG.SELECTORS.TREE_DISPLAY_INNER} > ul`);
    if (!rootUl) return;

    const getOrder = (currUl) => Array.from(currUl.children).map(li => ({
      id: li.getAttribute(CONFIG.ATTRIBUTES.LI_ID),
      children: li.querySelector('ul') ? getOrder(li.querySelector('ul')) : []
    }));
    localStorage.setItem(CONFIG.STORAGE_KEYS.SORT_EVENT, JSON.stringify({ order: getOrder(rootUl), ts: Date.now() }));
  };

  // ------------------------------------------
  // 6. UIレンダリング
  // ------------------------------------------
  const renderTree = (tree, parent) => {
    if (!tree || tree.length === 0) return;
    const ul = document.createElement("ul");
    ul.classList.add('sortable-list');

    tree.forEach(node => {
      const li = document.createElement("li");
      li.setAttribute(CONFIG.ATTRIBUTES.LI_ID, node.id);
      
      const hasChildren = node.children && node.children.length > 0;
      const targetEl = hasChildren ? document.createElement("p") : li;

      const labelSpan = document.createElement("span");
      labelSpan.textContent = node.label;
      labelSpan.classList.add("label-text");

      const settingBtn = document.createElement("button");
      settingBtn.innerHTML = "⚙";
      settingBtn.className = "edit-btn";
      settingBtn.type = "button";

      settingBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const labelText = node.label.replace(/【.*?】/g, '');
        
        if (CONFIG.IS_SUB_WINDOW) {
          // ...別窓処理は変更なし...
          const requestPayload = { id: node.id, label: labelText, action: 'REQUEST_EDIT_DATA', ts: Date.now() };
          localStorage.setItem('EDIT_REQUEST_EVENT', JSON.stringify(requestPayload));
          window.open('edit.html', 'ModuleEditWindow', 'width=400,height=600');
        } else {
          // --- メイン窓の場合 ---
          const targetEl = document.querySelector(`[data-tree-id="${node.id}"]`);
          if (targetEl) {
            // 1. スタイル抽出 (既存ロジック)
            const nameAttr = targetEl.getAttribute('data-module') || targetEl.getAttribute('data-component') || "";
            const prefix = nameAttr.startsWith('m-') ? "module" : (nameAttr.startsWith('c-') ? "component" : "layout");
            const varPrefix = `--${prefix}-`;
            const rawStyle = targetEl.getAttribute('style') || "";
            const currentStyles = {};
            const checkProps = ['width', 'height', 'bg-color', 'opacity', 'margin-top', 'margin-bottom', 'wrapper-width', 'wrapper-padding-top', 'wrapper-padding-bottom', 'wrapper-bg-color', 'inner-width', 'inner-padding-top', 'inner-padding-bottom', 'inner-bg-color'];
            
            checkProps.forEach(p => {
              const regex = new RegExp(`${varPrefix}${p}\\s*:\\s*([^;]+)`);
              const match = rawStyle.replace(/\u00a0/g, ' ').match(regex);
              if (match && match[1]) currentStyles[p] = match[1].trim();
            });

            // 2. データの保存
            localStorage.setItem(CONFIG.STORAGE_KEYS.CURRENT_EDIT, JSON.stringify({ id: node.id, label: labelText, initialStyles: currentStyles, ts: Date.now() }));

            // 3. 表示の制御
            const styleBlock = document.querySelector('.block.style');
            if (styleBlock) {
              styleBlock.classList.remove('is-hidden'); // 表示する
            }
            initEditWindow(); 
          }
        }
      });

      if (hasChildren) {
        targetEl.classList.add("parent");
        targetEl.appendChild(labelSpan);
        targetEl.appendChild(settingBtn);
        li.appendChild(targetEl);
        renderTree(node.children, li);
      } else {
        li.classList.add("content");
        li.appendChild(labelSpan);
        li.appendChild(settingBtn);
      }

      targetEl.addEventListener("mouseenter", () => handleHover(node.id, 'enter'));
      targetEl.addEventListener("mouseleave", () => handleHover(node.id, 'leave'));
      
      ul.appendChild(li);
    });
    
    parent.appendChild(ul);

    new Sortable(ul, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      group: 'nested',
      filter: '.edit-btn',
      preventOnFilter: false,
      onEnd: () => {
        saveNewOrder();
        if (!CONFIG.IS_SUB_WINDOW) {
          const orderEvent = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SORT_EVENT));
          const containerInner = document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER);
          if (orderEvent && containerInner) {
            applyNewOrder(orderEvent.order, containerInner);
            saveHistory();
          }
        }
      }
    });
  };

  const getPersistentId = (el) => {
    if (el.dataset.treeId) return el.dataset.treeId;
    const newId = 'id-' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    el.dataset.treeId = newId;
    return newId;
  };

  // ------------------------------------------
  // 7. 公開API
  // ------------------------------------------
  window.openTreeWindow = () => {
    const containerInner = document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER);
    if (!containerInner) return;
    const tree = buildModuleTree(containerInner);
    localStorage.setItem(CONFIG.STORAGE_KEYS.TREE_DATA, JSON.stringify(tree));
    window.open('tree.html', 'ModuleTreeWindow', 'width=500,height=800');
  };

  /**
  * ツリーエリアを最小化（クラスの付け外し）する
  */
  window.closeTreeWindow = () => {
    const treeSet = document.querySelector('[data-target="treeSet"]');
    if (treeSet) {
      // is-minimumクラスを付け外し
      treeSet.classList.toggle('is-minimum');
      
      // 任意：状態を保存したい場合は以下を有効にしてください
      const isMin = treeSet.classList.contains('is-minimum');
      localStorage.setItem('tree-minimized', isMin);
    }
  };

  /**
  * スタイル編集パネルを閉じる
  */
  window.closeStyleWindow = () => {
    const styleBlock = document.querySelector('.block.style');
    if (styleBlock) {
      styleBlock.classList.add('is-hidden');
    }
    // 編集中のデータもクリアしておくと安全
    localStorage.removeItem(CONFIG.STORAGE_KEYS.CURRENT_EDIT);
  };

  init();
};

document.addEventListener('DOMContentLoaded', () => {
  WebModuleBuilder();
});


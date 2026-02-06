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
    const container = document.querySelector('#style-edit-panel .inner');
    if (!container) return;

    let editData;
    const params = new URLSearchParams(window.location.search);
    const dataParam = params.get('editData');
    
    if (dataParam) {
      editData = JSON.parse(decodeURIComponent(dataParam));
    } else {
      const localData = localStorage.getItem(CONFIG.STORAGE_KEYS.CURRENT_EDIT);
      if (localData) editData = JSON.parse(localData);
    }

    if (!editData) return;
    const { id, label, initialStyles } = editData;
    const targetElDom = document.querySelector(`[data-tree-id="${id}"]`);
    if (!targetElDom) return;

    const currentVal = targetElDom.getAttribute('data-module') || "";
    const isModule = currentVal.startsWith('m-');
    const isLayout = currentVal.startsWith('l-');

    // 内部要素の取得
    const innerEl = targetElDom.querySelector('.inner');
    const imgEl = targetElDom.querySelector('img');

    let contentEditorHtml = "";

    // --- A. コンテンツ編集UIの生成 ---
    if (currentVal === 'm-image01') {
      const imgSrc = imgEl ? imgEl.getAttribute('src') : "";
      const imgAlt = imgEl ? imgEl.getAttribute('alt') : "";
      contentEditorHtml = `
        <div class="content-edit-group" style="background:#f0f7ff; padding:10px; border-radius:4px; margin-bottom:15px; border:1px solid #cce5ff;">
          <label style="font-size:11px; font-weight:bold; color:#004085; display:block; margin-bottom:5px;">画像設定:</label>
          <input type="text" id="img-src-input" value="${imgSrc}" placeholder="画像パス" style="width:100%; padding:5px; margin-bottom:8px; border:1px solid #ccc; font-size:12px;">
          <input type="text" id="img-alt-input" value="${imgAlt}" placeholder="alt（説明）" style="width:100%; padding:5px; border:1px solid #ccc; font-size:12px;">
        </div>
      `;
    } else if (isModule && innerEl) {
      // テキスト系：HTMLタグを除去してプレーンテキストのみにする場合は .innerText、HTMLを許容するなら .innerHTML
      contentEditorHtml = `
        <div class="content-edit-group" style="background:#f9f9f9; padding:10px; border-radius:4px; margin-bottom:15px; border:1px solid #ddd;">
          <label style="font-size:11px; font-weight:bold; color:#333; display:block; margin-bottom:5px;">テキスト編集:</label>
          <textarea id="text-content-input" style="width:100%; height:80px; padding:5px; font-size:12px; border:1px solid #ccc; resize:vertical;">${innerEl.innerHTML.trim()}</textarea>
        </div>
      `;
    }

    // UI描画
    const moduleOptions = [
      { value: "m-text01", text: "テキスト" }, { value: "m-title01", text: "見出し" },
      { value: "m-btn01", text: "ボタン" }, { value: "m-image01", text: "画像" }, { value: "m-uList01", text: "リスト" }
    ];
    const layoutOptions = [
      { value: "l-gridContents01", text: "グリッド" }, { value: "l-sideByContents01", text: "サイドバイサイド" }, { value: "l-bgContents01", text: "背景付き" }
    ];
    const activeOptions = isModule ? moduleOptions : (isLayout ? layoutOptions : []);

    container.innerHTML = `
      <div class="edit-header" style="padding-bottom:15px; border-bottom:1px solid #eee; margin-bottom:15px;">
        <h3 style="margin:0 0 10px 0; font-size:16px;">${label}</h3>
        ${activeOptions.length > 0 ? `
          <div style="margin-bottom:15px;">
            <label style="font-size:11px; color:#666; display:block; margin-bottom:5px;">種類の変更:</label>
            <select id="module-type-changer" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc; background:#fff;">
              ${activeOptions.map(opt => `<option value="${opt.value}" ${currentVal === opt.value ? 'selected' : ''}>${opt.text}</option>`).join('')}
            </select>
          </div>
        ` : ''}
        ${contentEditorHtml}
        <select id="prop-selector" style="width:100%; padding:8px; border:1px solid #ccc;">
          <option value="">+ スタイルを追加...</option>
          <optgroup label="本体 (Base)">
            <option value='{"name":"幅","prop":"width"}'>幅</option>
            <option value='{"name":"高さ","prop":"height"}'>高さ</option>
            <option value='{"name":"背景色","prop":"bg-color","type":"color"}'>背景色</option>
            <option value='{"name":"余白(上)","prop":"margin-top"}'>余白(上)</option>
            <option value='{"name":"余白(下)","prop":"margin-bottom"}'>余白(下)</option>
          </optgroup>
        </select>
      </div>
      <div id="active-props-list"></div>
    `;

    // --- イベント設定 ---

    // 1. テキスト変更
    const textInput = document.getElementById('text-content-input');
    if (textInput && innerEl) {
      textInput.oninput = () => { innerEl.innerHTML = textInput.value; saveHistory(); };
    }

    // 2. 画像変更
    const srcInput = document.getElementById('img-src-input');
    const altInput = document.getElementById('img-alt-input');
    if (srcInput || altInput) {
      const updateImg = () => {
        let currentImg = targetElDom.querySelector('img');
        if (!currentImg && innerEl) {
          innerEl.innerHTML = '<img src="" alt="">';
          currentImg = innerEl.querySelector('img');
        }
        if (currentImg) {
          currentImg.src = srcInput.value;
          currentImg.alt = altInput.value;
          saveHistory();
        }
      };
      if (srcInput) srcInput.oninput = updateImg;
      if (altInput) altInput.oninput = updateImg;
    }

    // 3. モジュールタイプ変更（クリーンアップ処理追加）
    const changer = document.getElementById('module-type-changer');
    if (changer) {
      changer.onchange = (e) => {
        const nextVal = e.target.value;
        const prevVal = targetElDom.getAttribute('data-module');
        targetElDom.setAttribute('data-module', nextVal);
        
        // --- コンテンツのクリーンアップ ---
        if (nextVal === 'm-image01') {
          // 画像に切り替えた場合：中身をimgタグにする
          if (innerEl) innerEl.innerHTML = '<img src="https://placehold.jp/150x150.png" alt="">';
        } else if (prevVal === 'm-image01') {
          // 画像から「それ以外」に切り替えた場合：imgタグを消してテキストにする
          if (innerEl) innerEl.innerHTML = '新規テキスト';
        }

        saveHistory();
        const newTree = buildModuleTree(document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER));
        localStorage.setItem(CONFIG.STORAGE_KEYS.TREE_DATA, JSON.stringify(newTree));
        const treeDisplay = document.querySelector(CONFIG.SELECTORS.TREE_DISPLAY_INNER);
        if (treeDisplay) { treeDisplay.innerHTML = ""; renderTree(newTree, treeDisplay); }
        
        localStorage.setItem(CONFIG.STORAGE_KEYS.CURRENT_EDIT, JSON.stringify({ ...editData, label: `【module】${nextVal}` }));
        initEditWindow();
      };
    }

    // スタイル追加・復元ロジック（以下略）
    const propsList = document.getElementById('active-props-list');
    const ALL_ITEMS = [
      { name: "幅", prop: "width" }, { name: "高さ", prop: "height" }, 
      { name: "背景色", prop: "bg-color", type: "color" }, { name: "不透明度", prop: "opacity" },
      { name: "余白(上)", prop: "margin-top" }, { name: "余白(下)", prop: "margin-bottom" }
    ];
    if (initialStyles) {
      Object.keys(initialStyles).forEach(propKey => {
        const foundItem = ALL_ITEMS.find(i => i.prop === propKey);
        if (foundItem) addPropInput(foundItem, propsList, id, initialStyles[propKey]);
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
      
      // 【判定】「block」という文字が含まれているか
      const isBlockType = node.label.includes("【block】");
      const hasChildren = node.children && node.children.length > 0;
      
      // レイアウト(親)なら pタグ、中身(子)なら li自体をターゲットに
      // ※hasChildren だけでなく isBlockType の要素も p を使うように調整
      const isParentStyle = hasChildren || isBlockType;
      const targetEl = isParentStyle ? document.createElement("p") : li;

      // 1. 三本線ハンドル（子要素＝isBlockTypeでない場合のみ）
      if (!isBlockType) {
        const dragHandle = document.createElement("span");
        dragHandle.classList.add("drag-handle");
        dragHandle.textContent = "≡"; 
        targetEl.appendChild(dragHandle);
      }

      // 2. ラベル
      const labelSpan = document.createElement("span");
      labelSpan.textContent = node.label;
      labelSpan.classList.add("label-text");
      targetEl.appendChild(labelSpan);

      // 3. 設定ボタン
      const settingBtn = document.createElement("button");
      settingBtn.innerHTML = "⚙";
      settingBtn.className = "edit-btn";
      settingBtn.type = "button";
      settingBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const labelText = node.label.replace(/【.*?】/g, '');
        const targetElDom = document.querySelector(`[data-tree-id="${node.id}"]`);
        if (targetElDom) {
          const nameAttr = targetElDom.getAttribute('data-module') || targetElDom.getAttribute('data-component') || "";
          const prefix = nameAttr.startsWith('m-') ? "module" : (nameAttr.startsWith('c-') ? "component" : "layout");
          const varPrefix = `--${prefix}-`;
          const rawStyle = targetElDom.getAttribute('style') || "";
          const currentStyles = {};
          const checkProps = ['width', 'height', 'bg-color', 'opacity', 'margin-top', 'margin-bottom', 'wrapper-width', 'wrapper-padding-top', 'wrapper-padding-bottom', 'wrapper-bg-color', 'inner-width', 'inner-padding-top', 'inner-padding-bottom', 'inner-bg-color'];
          checkProps.forEach(p => {
            const regex = new RegExp(`${varPrefix}${p}\\s*:\\s*([^;]+)`);
            const match = rawStyle.replace(/\u00a0/g, ' ').match(regex);
            if (match && match[1]) currentStyles[p] = match[1].trim();
          });
          localStorage.setItem(CONFIG.STORAGE_KEYS.CURRENT_EDIT, JSON.stringify({ id: node.id, label: labelText, initialStyles: currentStyles, ts: Date.now() }));
          const styleBlock = document.querySelector('.block.style');
          if (styleBlock) styleBlock.classList.remove('is-hidden');
          initEditWindow(); 
        }
      });
      targetEl.appendChild(settingBtn);

      // 4. 削除ボタン
      const deleteBtn = document.createElement("button");
      deleteBtn.innerHTML = "×";
      deleteBtn.className = "delete-btn";
      deleteBtn.type = "button";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetElDom = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
        if (confirm(`${node.label} を削除してもよろしいですか？`)) {
          if (targetElDom) targetElDom.remove();
          saveHistory();
          const containerInner = document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER);
          if (containerInner) {
            const newTree = buildModuleTree(containerInner);
            localStorage.setItem(CONFIG.STORAGE_KEYS.TREE_DATA, JSON.stringify({ tree: newTree, updatedAt: Date.now() }));
            const treeDisplayInner = document.querySelector(CONFIG.SELECTORS.TREE_DISPLAY_INNER);
            if (treeDisplayInner) { treeDisplayInner.innerHTML = ""; renderTree(newTree, treeDisplayInner); }
          }
        }
      });
      targetEl.appendChild(deleteBtn);

      // --- 構造の組み立て ---
      if (isParentStyle) {
        targetEl.classList.add("parent");
        li.appendChild(targetEl); 

        // 【重要】 block の場合のみ「先頭に追加」ボタン行を作成
        if (isBlockType) {
          const addRow = document.createElement("div");
          addRow.className = "tree-add-row";
          addRow.innerHTML = `<button class="tree-inner-add-btn" type="button">＋ 先頭に追加</button>`;
          
          // このボタンをクリックした時の処理をシンプルに
          addRow.querySelector('button').onclick = (e) => {
              e.stopPropagation();

              const newId = "id-" + Math.random().toString(36).slice(2);
              const parentLi = addRow.closest('li');
              let targetUl = parentLi.querySelector('ul.sortable-list');

              // ツリー用の新しいliを作成
              const newTreeLi = document.createElement('li');
              newTreeLi.setAttribute(CONFIG.ATTRIBUTES.LI_ID, newId);
              newTreeLi.className = "content";
              
              // 1. HTML構造を作る
              newTreeLi.innerHTML = `
                  <span class="drag-handle">≡</span>
                  <span class="label-text">【module】m-text01</span>
                  <button class="edit-btn" type="button">⚙</button>
                  <button class="delete-btn" type="button">×</button>
              `;

              // 2. 【重要】追加したボタンに「命令」を直接覚えさせる
              // 設定ボタン
              newTreeLi.querySelector('.edit-btn').onclick = (btnE) => {
                  btnE.stopPropagation();
                  
                  // 1. メイン画面側の実体を取得
                  const targetElDom = document.querySelector(`[data-tree-id="${newId}"]`);
                  if (!targetElDom) {
                      console.error("実体が見つかりません:", newId);
                      return;
                  }

                  // 2. 編集ウィンドウ（edit.html等）に必要な情報を localStorage に叩き込む
                  // これをしないと、隣のウィンドウやパネルは何を表示していいか判断できません
                  const editPayload = { 
                      id: newId, 
                      label: "m-text01", 
                      initialStyles: {}, // 新規なのでスタイルは空
                      ts: Date.now() 
                  };
                  localStorage.setItem(CONFIG.STORAGE_KEYS.CURRENT_EDIT, JSON.stringify(editPayload));

                  // 3. パネルを表示状態にする
                  const styleBlock = document.querySelector('.block.style');
                  if (styleBlock) styleBlock.classList.remove('is-hidden');

                  // 4. すでに読み込まれている初期化関数を実行
                  if (typeof initEditWindow === 'function') {
                      initEditWindow();
                  }
              };

              // 削除ボタン
              newTreeLi.querySelector('.delete-btn').onclick = (btnE) => {
                  btnE.stopPropagation();
                  if (confirm('この要素を削除しますか？')) {
                      newTreeLi.remove(); // ツリーから削除
                      document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${newId}"]`)?.remove(); // 実体から削除
                      saveHistory();
                  }
              };

              // ツリーに挿入
              targetUl.insertBefore(newTreeLi, targetUl.firstChild);

              // 3. 実体（メイン画面）への反映
              const mainTarget = document.querySelector(`[${CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]`);
              const inner = mainTarget?.querySelector('.inner') || mainTarget;
              if (inner) {
                  const newM = document.createElement('div');
                  newM.setAttribute('data-module', 'm-text01');
                  newM.setAttribute(CONFIG.ATTRIBUTES.TREE_ID, newId);
                  newM.innerHTML = '<span class="wrapper"><span class="inner">新規テキスト</span></span>';
                  inner.insertBefore(newM, inner.firstChild);
                  saveHistory();
                  saveNewOrder();

                  const orderData = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SORT_EVENT));
                  const containerInner = document.querySelector(CONFIG.SELECTORS.CONTAINER_INNER);
                  if (orderData && containerInner) {
                      applyNewOrder(orderData.order, containerInner);
                  }

                  // 追加が完全に終わってDOMが落ち着いたタイミングで、編集パネルを起動
                  setTimeout(() => {
                      const editPayload = { 
                          id: newId, 
                          label: "m-text01", 
                          initialStyles: {}, 
                          ts: Date.now() 
                      };
                      localStorage.setItem(CONFIG.STORAGE_KEYS.CURRENT_EDIT, JSON.stringify(editPayload));
                      
                      // パネルを表示（もし非表示なら）
                      const styleBlock = document.querySelector('.block.style');
                      if (styleBlock) styleBlock.classList.remove('is-hidden');

                      // 編集ウィンドウを初期化
                      if (typeof initEditWindow === 'function') {
                          initEditWindow();
                      }
                  }, 0);
              }
          };
          li.appendChild(addRow);
        }

        // 子要素の再帰描画（これで ul がボタンの下に来る）
        if (node.children) {
          renderTree(node.children, li);
        }
      } else {
        li.classList.add("content");
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
      handle: '.drag-handle',
      filter: '.edit-btn, .parent, .tree-add-row, .delete-btn', 
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


import Sortable from 'sortablejs';
import { WebModuleLogic } from './WebModuleLogic';
import { WebModuleUI } from './WebModuleUI';

export class WebModuleBuilder {

  constructor(options) {
    this.ctx = { ...options, LABELS: options.CONFIG.LABELS };
    this.logic = new WebModuleLogic(this.ctx);
    this.ui = new WebModuleUI(this);

    // 既存：project（いったん残す）
    const pageId = "page-" + Math.random().toString(36).slice(2, 9);
    this.state = {
      project: {
        version: 2,
        activePageId: pageId,
        pages: [{ id: pageId, title: "ページ1", tree: [] }]
      },
      ui: {
        previewDragEnabled: false,
        selectedModules: [],
        selectedModuleCounts: {},
        sheetAllowDuplicates: false
      },
      history: []
    };

    // 既存（いったん残す）
    this.previewDragEnabled = false;
    this.historyStack = [];
    this.selectedModules = [];

    this.handleKeyDown = this.handleKeyDown.bind(this);
  }


  get projectState() {
    return this.state.project;
  }

  get project() {
    return this.state.project;
  }

  set project(next) {
    this.state.project = next;
  }

  get uiState() {
    return this.state.ui;
  }

  get tree() {
    const page = this._getActivePage();
    if (!Array.isArray(page.tree)) page.tree = [];
    return page.tree;
  }

  set tree(next) {
    this._getActivePage().tree = Array.isArray(next) ? next : [];
  }

  isPreviewDragEnabled() {
    return !!this.uiState.previewDragEnabled;
  }

  get selectedModuleCounts() {
    return this.uiState.selectedModuleCounts;
  }

  set selectedModuleCounts(next) {
    this.uiState.selectedModuleCounts = next || {};
  }

  get sheetAllowDuplicates() {
    return !!this.uiState.sheetAllowDuplicates;
  }

  set sheetAllowDuplicates(next) {
    this.uiState.sheetAllowDuplicates = !!next;
  }

  get history() {
    return this.state.history;
  }

  isPreviewDragEnabled() {
    return !!this.uiState.previewDragEnabled;
  }

  pushHistory(snapshot) {
    this.state.history.push(snapshot);
  }




  /**
   * ビルダーの初期化
   */
  init() {
    const previewRoot = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);

    // ✅ 先に復元（project/pages が確定する）
    const hasSaved = this.loadFromLocalStorage();

    // ✅ toolbar は project 復元後に描画（ページ一覧が反映される）
    this.renderToolbar();

    // 保存が無いときだけHTMLから初期ページを作る
    if (!hasSaved && previewRoot && previewRoot.children.length > 0) {
      this._getActivePage().tree = this.logic.buildModuleTree(previewRoot);
    }

    this.syncView();
    window.addEventListener('keydown', this.handleKeyDown);
  }
  // ---------------------------------------------------------------


  _getActivePage() {
    const proj = this.project;
    const p = proj.pages.find(x => x.id === proj.activePageId);
    return p || proj.pages[0];
  }



  /**
   * JSONデータを元に、プレビューDOMとサイドバーを一斉更新し、保存を行う
   * @param {Object[]|null} [treeData=null] - 外部から提供される新しいツリーデータ
   */
  syncView(treeData = null) {
    const previewRoot = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    if (!previewRoot) return;

    this._refreshInternalData(treeData, previewRoot);
    this._renderPreview(previewRoot);
    this.renderSidebar(this.tree);

    this.saveToLocalStorage();
    this.initPreviewSortable();
  }
  // ---------------------------------------------------------------



      /**
       * 引数の有無や現在の状態に応じて、JSONデータ を最新状態に同期する
       * @param {Object[]|null} treeData - 新しく提供されたツリーデータ
       * @param {HTMLElement} previewRoot - 現在のプレビューDOM
       * @private
       */
      _refreshInternalData(treeData, previewRoot) {
        // ✅ 外部から tree が渡された場合だけ更新
        if (treeData) {
          this._getActivePage().tree = JSON.parse(JSON.stringify(treeData));
          return;
        }

        // ✅ ページ構造では「DOMからの自動復元をしない」
        // 空ページは空のまま維持
      }
      // ---------------------------------------------------------------


      /**
       * JSONデータ に基づき、プレビューエリアのDOMをゼロから構築する
       * @param {HTMLElement} previewRoot - 描画先のコンテナ
       * @private
       */
      _renderPreview(previewRoot) {
        previewRoot.innerHTML = "";

        this.tree.forEach(node => {
          const el = this.renderNode(node);
          if (el) {
            previewRoot.appendChild(el);
          }
        });
      }
      // ---------------------------------------------------------------


  // ---------------------------------------------------------------



  /**
   * JSONデータ（ツリー構造）から実際のDOM要素を再帰的に生成するメインメソッド
   * @param {Object} nodeData - レンダリング対象のノードデータ
   * @param {Object|null} [parentDef=null] - 親要素の定義（structure-boxの枠生成用）
   * @returns {HTMLElement|null} 生成されたDOM要素
   */
  renderNode(nodeData, parentDef = null) {
    // 1. 特殊な枠組み (structure-box) のレンダリング
    if (nodeData.type === 'structure-box') {
      return this._renderStructureBox(nodeData, parentDef);
    }

    // 2. モジュール定義の取得
    const def = this.ctx.ELEMENT_DEFS[nodeData.type];
    if (!def) return null;

    // 3. ベースとなる要素の生成と変数置換
    const el = this._createBaseElement(nodeData, def);

    // 4. スタイルの適用（個別プロパティ ＆ 自由入力CSS）
    this._applyNodeStyles(el, nodeData);

    // 5. プレビュー用UI（ドラッグハンドル等）の挿入
    this._insertPreviewUI(el, nodeData);

    // 6. 子要素（入れ子）の再帰レンダリング
    this._renderChildren(el, nodeData, def);

    return el;
  }
  // ---------------------------------------------------------------


      /**
       * モジュール定義のテンプレートからベースDOMを生成し、変数を置換する
       * @param {Object} nodeData - ノードデータ
       * @param {Object} def - ELEMENT_DEFS内の定義
       * @returns {HTMLElement} 生成されたDOM要素
       * @private
       */
      _createBaseElement(nodeData, def) {
        let html = def.template.replace(/\$tag/g, def.tag);
        const attrs = nodeData.attrs || {};

        // schemaに基づき $html や $src などを置換
        if (def.schema) {
          Object.entries(def.schema).forEach(([key, config]) => {
            const val = (config.isContent)
              ? (nodeData.content !== undefined && nodeData.content !== "" ? nodeData.content : config.default)
              : (attrs[key] !== undefined && attrs[key] !== "" ? attrs[key] : config.default);
            html = html.split(`$${key}`).join(val);
          });
        }

        const finalTemp = document.createElement('div');
        finalTemp.innerHTML = html.trim();
        const el = finalTemp.firstElementChild;
        
        el.setAttribute(this.ctx.CONFIG.ATTRIBUTES.TREE_ID, nodeData.id);
        el.setAttribute(this.ctx.CONFIG.ATTRIBUTES.MODULE, nodeData.type);
        
        return el;
      }
      // ---------------------------------------------------------------



      /**
       * ノードの属性データに基づき、個別プロパティと自由CSSをDOMに適用する
       * @param {HTMLElement} el - 対象のDOM要素
       * @param {Object} nodeData - ノードデータ
       * @private
       */
      _applyNodeStyles(el, nodeData) {
        if (!nodeData.attrs) return;

        // ✅ カスタムプロパティ名として安全なトークンにする
        const toSafeToken = (s = "") =>
          String(s)
            .trim()
            .replace(/[^a-zA-Z0-9_-]/g, "-") // 危険文字を全部 "-"" に
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");

        // ターゲット(selector)ごとにスタイルを分類
        const targetMap = {};
        Object.keys(nodeData.attrs).forEach((key) => {
          if (!key.includes(":")) return;
          const [selector, prop] = key.split(":");
          if (!targetMap[selector]) targetMap[selector] = { individuals: [], custom: "" };

          if (prop === "custom-css") {
            targetMap[selector].custom = nodeData.attrs[key];
          } else {
            targetMap[selector].individuals.push({ prop, val: nodeData.attrs[key] });
          }
        });

        // 各ターゲットに対してスタイルを適用
        Object.keys(targetMap).forEach((selector) => {
          const targetEl = selector === "" ? el : el.querySelector(selector);
          if (!targetEl) return;

          // 1) 個別設定を適用（CSS変数経由）
          targetMap[selector].individuals.forEach((item) => {
            const safeSel = selector ? `-${toSafeToken(selector)}` : "";
            const safeProp = toSafeToken(item.prop);

            const uniqueVar = `--id-${nodeData.id}${safeSel}-${safeProp}`;

            targetEl.style.setProperty(uniqueVar, item.val);
            targetEl.style.setProperty(item.prop, `var(${uniqueVar})`);
          });

          // 2) 自由CSS（最後に適用）
          if (targetMap[selector].custom) {
            targetEl.style.cssText += "; " + targetMap[selector].custom;
            targetEl.dataset.lastCustomCss = targetMap[selector].custom;
          }
        });

        // 旧来のstylesプロパティがある場合の互換性維持（ここはそのままでOK）
        if (nodeData.styles) {
          const pref = nodeData.type?.startsWith("m-") ? "module" : "layout";
          Object.keys(nodeData.styles).forEach((prop) => {
            el.style.setProperty(`--${pref}-${prop}`, nodeData.styles[prop]);
          });
        }
      }
      // ---------------------------------------------------------------



      /**
       * 編集画面用のドラッグハンドル等のUI要素を挿入する
       * @param {HTMLElement} el - 対象のDOM要素
       * @param {Object} nodeData - ノードデータ
       * @private
       */
      _insertPreviewUI(el, nodeData) {
        // 構造枠（structure-box）にはハンドルを表示しない
        if (nodeData.type === 'structure-box') return;

        // ハンドルの生成
        const handleWrapper = document.createElement('div');
        handleWrapper.className = 'preview-handle-wrapper';
        handleWrapper.innerHTML = '<div class="preview-drag-handle">≡ 移動する</div>';
        
        el.appendChild(handleWrapper); 
        
        // 💡 クラスではなく data 属性を付与
        el.setAttribute('data-preview-draggable', 'true');
      }
      // ---------------------------------------------------------------




      /**
       * 子要素（DropZone）を探し、再帰的にrenderNodeを呼び出して子ノードを描画する
       * @param {HTMLElement} el - 親となるDOM要素
       * @param {Object} nodeData - ノードデータ
       * @param {Object} def - 要素の定義
       * @private
       */
      _renderChildren(el, nodeData, def) {
        const dzAttr = this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE;
        const dz = el.hasAttribute(dzAttr) ? el : el.querySelector(`[${dzAttr}]`);
        
        if (dz) {
          dz.innerHTML = "";
          if (nodeData.children && nodeData.children.length > 0) {
            nodeData.children.forEach(childData => {
              const childDom = this.renderNode(childData, def);
              if (childDom) {
                if (dz === el) { 
                  el.appendChild(childDom); 
                } else { 
                  dz.parentElement.appendChild(childDom); 
                }
              }
            });
            // テンプレート用のダミーDropZone属性がある場合は削除
            if (dz !== el) dz.remove();
          }
        }
      }
      // ---------------------------------------------------------------




      /**
       * structure-box（グリッドシステム等の枠組み）をレンダリングする
       * @param {Object} nodeData - ノードデータ
       * @param {Object|null} parentDef - 親の定義
       * @returns {HTMLElement} 生成された枠組み要素
       * @private
       */
      _renderStructureBox(nodeData, parentDef) {
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

      // ---------------------------------------------------------------






  addPage(title = null) {
    const id = "page-" + Math.random().toString(36).slice(2, 9);
    const t = (title && title.trim()) ? title.trim() : `ページ${this.project.pages.length + 1}`;

    this.project.pages.push({ id, title: t, tree: [] });
    this.project.activePageId = id;

    // UI更新（selectの中身を更新したいので）
    this.renderToolbar();
    this.syncView();
  }
  // ---------------------------------------------------------------


  deletePage(pageId) {
    const pages = this.project.pages;
    if (!Array.isArray(pages) || pages.length <= 1) {
      alert("最後の1ページは削除できません。");
      return;
    }

    const idx = pages.findIndex(p => p.id === pageId);
    if (idx === -1) return;

    const pageTitle = pages[idx].title || "ページ";
    const ok = confirm(`「${pageTitle}」を削除します。よろしいですか？`);
    if (!ok) return;

    const deletingActive = (this.project.activePageId === pageId);

    // 削除
    pages.splice(idx, 1);

    // アクティブを調整（削除したのがactiveなら近いページへ）
    if (deletingActive) {
      const next = pages[idx] || pages[idx - 1] || pages[0];
      this.project.activePageId = next.id;
    }

    // UI更新
    this.renderToolbar();
    this.syncView();
    this.saveToLocalStorage();
  }
  // ---------------------------------------------------------------





  setActivePage(pageId) {
    if (!this.project.pages.some(p => p.id === pageId)) return;

    this.project.activePageId = pageId;

    // UI更新（select表示更新）
    this.renderToolbar();
    this.syncView();
  }
  // ---------------------------------------------------------------


      
  // ---------------------------------------------------------------



  /**
   * 指定されたモジュールIDに基づき、初期状態のJSONデータ（ノード）を生成する
   * @param {string} defId - ELEMENT_DEFS に定義されているモジュールID (例: 'm-btn01')
   * @returns {Object|null} 生成された初期ノードデータ、または定義がない場合は null
   */
  createInitialData(defId) {
    const def = this.ctx.ELEMENT_DEFS[defId];
    if (!def) return null;

    // 1. 動的な初期ラベルの決定
    const initialLabel = this._extractInitialLabel(def);

    // 2. ベースとなるノードの構築
    const newNode = {
      id: this._generateUniqueId(),
      type: defId,
      label: initialLabel,
      children: [],
      isStructure: def.template.includes(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE)
    };

    // 3. コンテナ（DROP_ZONE）を持つ場合の構造体生成
    this._attachInitialStructure(newNode, def);

    return newNode;
  }
  // ---------------------------------------------------------------


      /**
       * テンプレートから最適な初期ラベルを抽出する
       * @param {Object} def - モジュール定義
       * @returns {string} 抽出されたラベル文字列
       * @private
       */
      _extractInitialLabel(def) {
        const temp = document.createElement('div');
        temp.innerHTML = def.template;
        const treeViewEl = temp.querySelector('[data-tree-view]');
        
        if (treeViewEl) {
          const editConf = treeViewEl.getAttribute('data-edit');
          // data-edit="html:propName:初期テキスト" の形式からテキスト部分を抽出
          if (editConf && editConf.includes('html:')) {
            const configPart = editConf.split(';').find(c => c.trim().startsWith('html:'));
            if (configPart) {
              const parts = configPart.split(':');
              // parts[2] 以降が初期テキスト
              return parts.slice(2).join(':') || def.label;
            }
          }
        }
        return def.label;
      }
      // ---------------------------------------------------------------



      /**
       * モジュールがコンテナ（DropZone）を持つ場合、内部に structure-box を自動生成する
       * @param {Object} newNode - 生成中のノードデータ
       * @param {Object} def - モジュール定義
       * @private
       */
      _attachInitialStructure(newNode, def) {
        const temp = document.createElement('div');
        temp.innerHTML = def.template;
        const dzEl = temp.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`);
        
        if (dzEl) {
          const dzNode = {
            id: this._generateUniqueId(),
            type: 'structure-box',
            label: dzEl.getAttribute(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE) || "枠",
            isStructure: true,
            // 必要に応じて初期状態で中に配置するモジュールを設定
            children: [this.createInitialData('m-text01')] 
          };
          newNode.children.push(dzNode);
        }
      }
      // ---------------------------------------------------------------



      /**
       * ランダムなユニークIDを生成する
       * @returns {string} id-xxxxxx 形式の文字列
       * @private
       */
      _generateUniqueId() {
        return "id-" + Math.random().toString(36).slice(2, 11);
      }
      // ---------------------------------------------------------------


  // ---------------------------------------------------------------



  /**
   * 指定したノードまたはルートに新しいモジュールを追加する
   * @param {Object|null} parentNodeData - 追加先の親ノードデータ。ルートに追加する場合は null
   * @param {string} defId - 追加するモジュールの定義ID (例: 'm-btn01')
   */
  addNewModule(parentNodeData, defId) {
    // 1. 追加するノードの初期データを生成
    const newNode = this.createInitialData(defId);
    if (!newNode) return;

    // 2. 既存のデータツリーへ新しいノードを統合
    this._integrateNodeToTree(newNode, parentNodeData);

    // 3. 視覚的・データの同期
    this.syncView();
  }
  // ---------------------------------------------------------------


      /**
       * 新しいノードをデータツリーの適切な位置（ルートまたは親の直下）に挿入する
       * @param {Object} newNode - 挿入する新しいノード
       * @param {Object|null} parentNodeData - 親となるノードデータ
       * @private
       */
      _integrateNodeToTree(newNode, parentNodeData) {
        if (!parentNodeData) {
          // 親の指定がない場合はルート（最上位）に追加
          this.tree.push(newNode);
          return;
        }

        // IDを元に、現在のツリーデータ内から最新の親ノード参照を探す
        const actualParent = this.logic.findNodeById(this.tree, parentNodeData.id);
        if (!actualParent) return;

        // 親が children を持っているか確認し、配列にプッシュ
        if (!Array.isArray(actualParent.children)) {
          actualParent.children = [];
        }
        actualParent.children.push(newNode);
      }
      // ---------------------------------------------------------------


  // ---------------------------------------------------------------



  /**
   * 指定したIDのモジュールをデータツリーから削除する
   * @param {string} id - 削除対象のノードID
   */
  deleteModule(id) {
    // 1. ユーザーへの確認（UIの責務）
    if (!this._confirmDeletion()) return;

    // 2. データツリーからの実削除（データの責務）
    const isDeleted = this._performDeleteFromTree(this.tree, id);

    // 3. 削除成功時のみ画面を同期
    if (isDeleted) {
      this.syncView();
    }
  }
  // ---------------------------------------------------------------


      /**
       * 削除の確認ダイアログを表示する
       * @returns {boolean} ユーザーが同意した場合は true
       * @private
       */
      _confirmDeletion() {
        return confirm("このモジュールを削除しますか？内部の子要素もすべて削除されます。");
      }
      // ---------------------------------------------------------------


      /**
       * ツリー構造（配列）から指定したIDを持つ要素を再帰的に探し出し、削除する
       * @param {Object[]} list - 探索対象のノード配列
       * @param {string} targetId - 削除したいID
       * @returns {boolean} 削除が成功した場合は true
       * @private
       */
      _performDeleteFromTree(list, targetId) {
        // 直近の階層から検索
        const index = list.findIndex(item => item.id === targetId);
        
        if (index !== -1) {
          // 対象が見つかったらその場で切り取る
          list.splice(index, 1);
          return true;
        }

        // 見つからなければ子要素（children）を再帰的に探索
        return list.some(item => {
          if (item.children && item.children.length > 0) {
            return this._performDeleteFromTree(item.children, targetId);
          }
          return false;
        });
      }
      // ---------------------------------------------------------------


  // ---------------------------------------------------------------



  /**
   * グリッドなどの親要素内に、新しい枠（structure-box）を1つ追加する
   * @param {Object} node - 枠を追加する対象の親ノード
   */
  fastAddFrame(node) {
    // 1. 最新の親ノード参照をツリーから取得
    const parentNode = this.logic.findNodeById(this.tree, node.id);
    if (!parentNode) return;

    // 2. 親の定義に基づき、新しい枠（structure-box）データを生成
    const newFrameNode = this._createNewFrameData(parentNode);

    // 3. 親の children 配列に追加
    if (!Array.isArray(parentNode.children)) parentNode.children = [];
    parentNode.children.push(newFrameNode);

    // 4. 全体を同期して反映
    this.syncView();
  }

      /**
       * 親ノードの定義からドロップゾーンの情報を抽出し、新しい枠の初期データを生成する
       * @param {Object} parentNode - 親ノードデータ
       * @returns {Object} 生成された structure-box ノード
       * @private
       */
      _createNewFrameData(parentNode) {
        const def = this.ctx.ELEMENT_DEFS[parentNode.type];
        
        // テンプレートからドロップゾーン（DZ）の設定を解析
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = def?.template || "";
        const dzEl = tempDiv.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`);

        const newFrame = {
          id: this._generateUniqueId(),
          type: 'structure-box',
          label: dzEl ? dzEl.getAttribute(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE) : "枠",
          isStructure: true,
          children: []
        };

        // 親の定義に default モジュールが指定されていれば、初期要素として中に入れる
        if (def && def.default) {
          const childModule = this.createInitialData(def.default);
          if (childModule) {
            newFrame.children.push(childModule);
          }
        }

        return newFrame;
      }
      // ---------------------------------------------------------------



  // ---------------------------------------------------------------



  /**
   * サイドバーのツリー表示用 Sortable を初期化する
   * @param {HTMLElement} ul - 対象のリスト要素
   */
  initSortable(ul) {
    new Sortable(ul, {
      ...this._getCommonSortableOptions('.drag-handle'),
      group: {
        name: 'nested',
        pull: true,
        put: (to) => this._canPutInTree(to)
      },
      filter: '.moduleAddBtn, .editBtn, .deleteBtn, .blockAddBtn',
      onEnd: (evt) => this._onDragEnd(evt, 'sidebar')
    });
  }
  // ---------------------------------------------------------------


  /**
   * プレビューDOM側の Sortable を有効にする
   */
  initPreviewSortable() {
    if (!this.isPreviewDragEnabled()) return;

    const previewRoot = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    if (!previewRoot) return;

    const containers = [previewRoot, ...Array.from(document.querySelectorAll(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`))];

    containers.forEach(container => {
      // 重複バインド防止
      if (container._sortableInstance) container._sortableInstance.destroy();

      container._sortableInstance = new Sortable(container, {
        ...this._getCommonSortableOptions('.preview-drag-handle'),
        group: { name: 'preview-nested', pull: true, put: true },
        invertSwap: true,
        onEnd: (evt) => this._onDragEnd(evt, 'preview')
      });
    });
  }
  // ---------------------------------------------------------------


      /**
       * SortableJS の共通オプションを取得する
       * @param {string} handleSelector - ドラッグハンドルのセレクタ
       * @private
       */
      _getCommonSortableOptions(handleSelector) {
        return {
          animation: 150,
          handle: handleSelector,
          fallbackOnBody: true,
          swapThreshold: 0.65,
          preventOnFilter: false
        };
      }
      // ---------------------------------------------------------------



      /**
       * サイドバー側でのドロップ許可判定
       * @private
       */
      _canPutInTree(to) {
        // ルートリストならOK
        if (to.el.classList.contains('root-sortable-list')) return true;

        // 子要素（枠）なら structure-box の場合のみOK
        const parentLi = to.el.closest('.tree-item');
        if (parentLi) {
          const id = parentLi.getAttribute('data-id');
          const node = this.logic.findNodeById(this.tree, id);
          return !!(node && node.type === 'structure-box');
        }

        return false;
      }
      // ---------------------------------------------------------------



      /**
       * ドラッグ終了時の共通処理
       * @param {Object} evt - SortableJS のイベントオブジェクト
       * @param {'sidebar'|'preview'} mode - どちらのエリアでの操作か
       * @private
       */
      _onDragEnd(evt, mode) {
        const { item, from, to, newIndex } = evt;
        const isPreview = mode === 'preview';
        
        // ID取得用の属性名
        const idAttr = isPreview ? this.ctx.CONFIG.ATTRIBUTES.TREE_ID : 'data-id';
        const previewRoot = isPreview ? document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER) : null;

        // ターゲットIDの取得
        const targetId = item.getAttribute(idAttr);

        // 親IDの判定ロジック（プレビューとツリーで共通化）
        const getParentId = (container) => {
          if (isPreview) {
            return (container === previewRoot) ? null : container.closest(`[${idAttr}]`)?.getAttribute(idAttr);
          } else {
            return container.classList.contains('root-sortable-list') ? null : container.closest('.tree-item')?.getAttribute('data-id');
          }
        };

        const toId = getParentId(to);
        const fromId = getParentId(from);

        // データの移動と同期
        this.moveTreeNode(targetId, fromId, toId, newIndex);
        this.syncView();
      }
      // ---------------------------------------------------------------

      
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
   * 編集パネルを開き、対象ノードのコンテンツ編集およびスタイル編集UIを構築する
   * @param {Object} node - 編集対象のノードデータ
   */
  openEditPanel(node) {
    const masterNode = this.logic.findNodeById(this.tree, node.id);
    const container = document.querySelector(this.ctx.CONFIG.SELECTORS.STYLE_PANEL_INNER);
    const styleBlock = document.querySelector(this.ctx.CONFIG.SELECTORS.STYLE_BLOCK);

    if (!masterNode || !container || !styleBlock) return;

    // 1. パネルの初期化とベースUIの生成
    styleBlock.classList.remove('is-hidden');
    container.innerHTML = "";
    const panelBase = this.ui.createEditPanelBase(masterNode, this.ctx.STYLE_DEFS);
    container.appendChild(panelBase);

    const def = this.ctx.ELEMENT_DEFS[masterNode.type];
    if (!def) return;

    // 2. A領域：コンテンツ編集 (schema / $data) の構築
    this._renderContentFields(panelBase.querySelector('#content-specific-editor'), masterNode, def);

    // 3. B領域：ターゲット別スタイル編集の構築
    this._renderStyleSections(panelBase.querySelector('#active-props-list'), masterNode);

    // UIクラス側で生成されている .close-edit-panel を探す
    const closeBtn = panelBase.querySelector('.close-edit-panel');
    if (closeBtn) {
      closeBtn.onclick = () => {
        styleBlock.classList.add('is-hidden');
        styleBlock.classList.remove('is-active');
      };
    }
  }
  // ---------------------------------------------------------------



      /**
       * モジュールの定義（schema）に基づき、テキストやリンクなどの編集フィールドを生成する
       * @private
       */
      _renderContentFields(container, masterNode, def) {
        if (!container || !def.schema) return;

        Object.entries(def.schema).forEach(([key, config]) => {
          // データの正規化
          if (config.isContent) {
            if (masterNode.content === undefined) masterNode.content = config.default;
          } else {
            if (!masterNode.attrs) masterNode.attrs = {};
            if (masterNode.attrs[key] === undefined) masterNode.attrs[key] = config.default;
          }

          const currentVal = config.isContent ? masterNode.content : masterNode.attrs[key];

          // フィールド生成と変更時イベント
          const field = this.createAdvancedField(config.label, key, config.type, currentVal, config.options || [], (newVal) => {
            if (config.isContent) {
              masterNode.content = newVal;
              masterNode.label = newVal || def.label; // ラベルをコンテンツに同期
            } else {
              masterNode.attrs[key] = newVal;
            }
            this.syncView();
          });
          container.appendChild(field);
        });
      }
      // ---------------------------------------------------------------



      /**
       * プレビューDOMをスキャンし、スタイル変更可能なターゲットごとにセクションを生成する
       * @private
       */
      _renderStyleSections(container, masterNode) {
        if (!container) return;
        const targetRoot = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${masterNode.id}"]`);
        if (!targetRoot) return;

        // 編集可能なターゲット（ルートと主要な子要素）を取得
        const targets = this._scanStyleTargets(targetRoot);

        targets.forEach(target => {
          const section = this._createStyleSectionUI(target, masterNode);
          container.appendChild(section);
        });
      }
      // ---------------------------------------------------------------



      /**
       * 指定された要素内の編集可能なクラス要素をスキャンしてリスト化する
       * @private
       */
      _scanStyleTargets(targetRoot) {
        const targets = [{ name: 'モジュールルート', selector: '', el: targetRoot }];
        
        targetRoot.querySelectorAll('[class]').forEach(el => {
          // 他のモジュールに属する要素は除外
          if (el.closest(`[${this.ctx.CONFIG.ATTRIBUTES.MODULE}]`) !== targetRoot) return;
          
          const className = Array.from(el.classList).find(c => !c.startsWith('is-') && !c.startsWith('preview-'));
          if (className) {
            const sel = `.${className}`;
            if (!targets.some(t => t.selector === sel)) {
              targets.push({ name: sel, selector: sel, el: el });
            }
          }
        });
        return targets;
      }
      // ---------------------------------------------------------------



      /**
       * 各ターゲット（.wrapper等）ごとのスタイル追加UIおよび既存プロパティを構築する
       * @private
       */
      _createStyleSectionUI(target, masterNode) {
        const section = document.createElement('div');
        section.className = 'style-section';
        section.innerHTML = `<h4 class="style-sectionTitle">--- ${target.name} ---</h4>`;

        // プロパティ追加用セレクトボックス
        const select = document.createElement('select');
        select.className = 'prop-add-select';
        select.style.width = '100%';
        select.innerHTML = `<option value="">+ スタイルを追加</option>` + 
                          this.ctx.STYLE_DEFS.map(s => `<option value='${JSON.stringify(s)}'>${s.name}</option>`).join('');
        
        const listContainer = document.createElement('div');
        listContainer.className = 'props-list-inner';

        select.onchange = (e) => {
          if (!e.target.value) return;
          this.addPropInput(JSON.parse(e.target.value), listContainer, masterNode.id, "", target.selector);
          e.target.value = "";
        };

        section.appendChild(select);
        section.appendChild(listContainer);

        // 既存の保存済みスタイルを復元
        this.ctx.STYLE_DEFS.forEach(sDef => {
          const storageKey = `${target.selector}:${sDef.prop}`;
          if (masterNode.attrs && masterNode.attrs[storageKey] !== undefined) {
            this.addPropInput(sDef, listContainer, masterNode.id, masterNode.attrs[storageKey], target.selector);
          }
        });

        return section;
      }
      // ---------------------------------------------------------------

  // ---------------------------------------------------------------





  /**
   * 指定されたタイプに応じて、ラベル付きの編集フィールド行を生成する
   * @param {string} label - フィールドのラベル
   * @param {string} key - データのキー名
   * @param {string} type - 入力タイプ (text, textarea, radio, checkbox, toggle 等)
   * @param {any} currentVal - 現在の値
   * @param {Array} options - 選択肢データ (radio, checkbox 等で使用)
   * @param {Function} onChange - 値変更時のコールバック関数
   * @returns {HTMLElement} 生成されたフィールド行要素
   */
  createAdvancedField(label, key, type, currentVal, options, onChange) {
    const row = document.createElement('div');
    row.className = 'edit-field-row';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const wrap = document.createElement('div');
    wrap.className = 'field-input-wrap';

    // タイプに応じたビルダーを呼び出す
    let fieldNode;
    switch (type) {
      case 'radio':
        fieldNode = this._buildRadioField(key, options, currentVal, onChange);
        break;
      case 'checkbox':
        fieldNode = this._buildCheckboxField(options, currentVal, onChange);
        break;
      case 'toggle':
        fieldNode = this._buildToggleField(options, currentVal, onChange);
        break;
      default:
        fieldNode = this._buildDefaultField(type, currentVal, onChange);
    }

    wrap.appendChild(fieldNode);
    row.appendChild(wrap);
    return row;
  }
  // ---------------------------------------------------------------


      /** @private */
      _buildRadioField(key, options, currentVal, onChange) {
        const container = document.createDocumentFragment();
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
          l.append(r, opt.label);
          container.appendChild(l);
        });
        return container;
      }
      // ---------------------------------------------------------------


      /** @private */
      _buildCheckboxField(options, currentVal, onChange) {
        const container = document.createDocumentFragment();
        const selectedValues = currentVal ? String(currentVal).split(',') : [];
        
        options.forEach(opt => {
          const l = document.createElement('label');
          l.className = 'checkbox-label';
          const c = document.createElement('input');
          c.type = 'checkbox';
          c.value = opt.value;
          c.checked = selectedValues.includes(String(opt.value));
          c.onchange = (e) => {
            // 親要素(fragmentはDOMに追加されると消えるので、イベント発生源から辿る)から全チェックを取得
            const wrap = e.target.closest('.field-input-wrap');
            const checkedNodes = wrap.querySelectorAll('input[type="checkbox"]:checked');
            onChange(Array.from(checkedNodes).map(input => input.value).join(','));
          };
          l.append(c, opt.label);
          container.appendChild(l);
        });
        return container;
      }
      // ---------------------------------------------------------------


      /** @private */
      _buildToggleField(options, currentVal, onChange) {
        const onData = options[0] || { label: "ON", value: "true" };
        const offData = options[1] || { label: "OFF", value: "false" };

        const l = document.createElement('label');
        l.className = 'toggle-switch';
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

        l.append(c, statusLabel);
        return l;
      }
      // ---------------------------------------------------------------


      /** @private */
      _buildDefaultField(type, currentVal, onChange) {
        const isTextarea = type === 'textarea';
        const input = document.createElement(isTextarea ? 'textarea' : 'input');
        if (!isTextarea) input.type = type;
        input.value = currentVal;
        input.oninput = (e) => onChange(e.target.value);
        return input;
      }
      // ---------------------------------------------------------------


  // ---------------------------------------------------------------




  /**
   * サイドバーのツリー構造を生成・描画し、各種ボタンやSortableを初期化する
   * @param {Object[]} tree - 表示対象のツリーデータ
   */
  renderSidebar(tree) {
    const displayInner = document.querySelector(this.ctx.CONFIG.SELECTORS.TREE_DISPLAY_INNER);
    if (!displayInner) return;

    // 1. 基本構造の描画
    displayInner.innerHTML = "";
    
    displayInner.appendChild(this.ui.createAddControls(this, null));

    const treeHtml = `<ul class="sortable-list root-sortable-list">${this._buildTreeHtml(tree)}</ul>`;
    displayInner.insertAdjacentHTML("beforeend", treeHtml);

    // 2. 各ノードへの動的部品（ボタン等）のマウント
    this._mountTreeControls(displayInner, tree);

    // 3. インタラクション（並び替え・ホバー）の初期化
    displayInner.querySelectorAll("ul.sortable-list").forEach(ul => this.initSortable(ul));
    this.bindHoverEvents(displayInner);
  }
  // ---------------------------------------------------------------


      /**
       * ツリーデータから再帰的にHTML文字列を生成する
       * @private
       */
      _buildTreeHtml(nodes) {
        return nodes.map(node => {
          const id = this.ui.escapeHtml(node.id);
          const isStrBox = node.type === 'structure-box';
          const def = this.ctx.ELEMENT_DEFS[node.type];
          
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
                ${node.children ? this._buildTreeHtml(node.children) : ""}
              </ul>
              ${/* 特殊コンテナへの枠追加用スロット */
                (!isStrBox && def?.template.includes(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE)) 
                ? `<div data-blockadd-for="${id}"></div>` : ""
              }
            </li>`.trim();
        }).join("");
      }
      // ---------------------------------------------------------------


      /**
       * 生成されたHTML要素に対して、JSで生成したボタン類を流し込む
       * @private
       */
      _mountTreeControls(container, tree) {
        // 編集・削除・追加ボタンのマウント
        container.querySelectorAll('.tree-item').forEach(li => {
          const id = li.getAttribute('data-id');
          const node = this.logic.findNodeById(tree, id);
          if (!node) return;

          const mSlot = li.querySelector(`[data-manage-for="${id}"]`);
          if (mSlot) {
            if (node.type !== 'structure-box') mSlot.prepend(this.ui.createEditButton(node));
            mSlot.appendChild(this.ui.createDeleteButton(node));
          }

          const addSlot = li.querySelector(`[data-add-for="${id}"]`);
          if (!addSlot) return;

          // ✅ data-drop-zoneに当たる「箱（structure-box）」にだけ📦を出す
          if (node.type === 'structure-box') {
            addSlot.appendChild(this.ui.createAddControls(this, node.id));
          } else {
            addSlot.innerHTML = ""; // 親（グリッドセット等）では何も出さない
          }
        });

        // 「+ 枠を追加」ボタンの特殊処理
        container.querySelectorAll("[data-blockadd-for]").forEach(slot => {
          this._setupBlockAddButton(slot, tree);
        });
      }
      // ---------------------------------------------------------------


      /**
       * 構造体（グリッド等）専用の「枠を追加」ボタンをセットアップする
       * @private
       */
      _setupBlockAddButton(slot, tree) {
        const id = slot.getAttribute("data-blockadd-for");
        const node = this.logic.findNodeById(tree, id);
        if (!node) return;

        const def = this.ctx.ELEMENT_DEFS[node.type];
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = def.template;
        const dz = tempDiv.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`);
        const label = dz ? dz.getAttribute(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE) : "枠";

        const btnWrapper = this.ui.parseHtml(`
          <div class="tree-block-add-wrap">
            <button type="button" class="blockAddBtn">+ ${label}を追加</button>
          </div>
        `);

        btnWrapper.querySelector('button').onclick = (e) => {
          e.stopPropagation();
          this.fastAddFrame(node); // さきほど整理した fastAddFrame を呼び出し
        };
        slot.replaceWith(btnWrapper);
      }
      // ---------------------------------------------------------------

  // ---------------------------------------------------------------




  /**
   * スタイル編集用の入力フィールドを生成・追加し、リアルタイム反映のイベントを登録する
   * @param {Object} item - スタイル定義 (STYLE_DEFS)
   * @param {HTMLElement} parent - 入力要素を挿入するコンテナ
   * @param {string} targetId - 操作対象のモジュールID
   * @param {string} fullVal - 初期値
   * @param {string} [selector=""] - 対象要素内のセレクタ（ルートなら空文字）
   */
  addPropInput(item, parent, targetId, fullVal = "", selector = "") {
    const storageKey = `${selector}:${item.prop}`;
    const escapedKey = storageKey.replace(/:/g, '\\:').replace(/\./g, '\\.');
    
    if (parent.querySelector(`[data-storage-key="${escapedKey}"]`)) return;

    const propItem = this.ui.createPropInputItem(item, fullVal);
    propItem.setAttribute('data-storage-key', storageKey);

    this._bindPropEvents(propItem, item, targetId, selector, storageKey);
    this._bindDeleteEvent(propItem, item, targetId, selector, storageKey);
    this._insertSortedPropItem(parent, propItem, item.prop);

    // 💡 修正：setTimeout と Event 発火をやめ、メソッドを直接実行
    if (fullVal !== "") {
      this._updatePropValue(propItem, item, targetId, selector, storageKey);
    }
  }

      /**
       * 入力フィールドの変更イベントを監視し、スタイルを更新するロジックをバインド
       * @private
       */
      _bindPropEvents(propItem, item, targetId, selector, storageKey) {
        const update = () => this._updatePropValue(propItem, item, targetId, selector, storageKey);

        propItem.querySelectorAll('input, select, textarea').forEach(input => {
          input.addEventListener('input', update);
        });
      }
      // ---------------------------------------------------------------


      /**
       * プロパティの値をプレビューとデータモデルの両方に反映する
       * @private
       */
      _updatePropValue(propItem, item, targetId, selector, storageKey) {
        const masterNode = this.logic.findNodeById(this.tree, targetId)
        const targetRoot = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${targetId}"]`);
        
        // getValue は WebModuleUI が生成した要素に生やしているメソッド
        const val = propItem.getValue();
        const el = selector === "" ? targetRoot : targetRoot?.querySelector(selector);

        // プレビュー(DOM)への反映
        if (el) {
          if (item.prop === 'custom-css') {
            this._applyCustomCssWithPriority(el, val);
          } else {
            this._applyIndividualStyle(el, item.prop, val, targetId, selector);
          }
        }

        // データモデルへの反映と保存
        if (masterNode) {
          if (!masterNode.attrs) masterNode.attrs = {};
          masterNode.attrs[storageKey] = val;
          this.saveToLocalStorage();
        }
      }
      // ---------------------------------------------------------------


      /**
       * 自由入力CSSを適用する。個別設定がある場合はそれを壊さず、自由入力を末尾（最強）に配置する
       * @private
       */
      _applyCustomCssWithPriority(el, cssText) {
        // 個別設定（--id- 変数）のみを抽出
        const individuals = el.style.cssText.split(';').filter(s => {
          const t = s.trim();
          return t && (t.startsWith('--id') || t.includes('var(--id'));
        }).join('; ');

        // 自由入力を最後にして結合（最強の優先順位）
        el.style.cssText = `${individuals}; ${cssText}`;
        el.dataset.lastCustomCss = cssText;
      }
      // ---------------------------------------------------------------


      /**
       * 個別スタイル（margin等）を適用する。自由入力CSSが既にある場合は、優先順位を維持するため最後に再結合する
       * @private
       */
      _applyIndividualStyle(el, prop, val, targetId, selector) {
        const safeSelector = selector.replace(/\./g, '-');
        const uniqueVar = `--id-${targetId}${safeSelector}-${prop}`;

        el.style.setProperty(uniqueVar, val);
        el.style.setProperty(prop, `var(${uniqueVar})`);

        // 自由入力がある場合、末尾に再結合して優先順位を守る
        const customCss = el.dataset.lastCustomCss;
        if (customCss) {
          el.style.cssText = el.style.cssText.split(';').filter(s => s.trim() && !s.includes(customCss)).join(';') + "; " + customCss;
        }
      }
      // ---------------------------------------------------------------


      /**
       * 削除ボタンのクリックイベントをバインド
       * @private
       */
      _bindDeleteEvent(propItem, item, targetId, selector, storageKey) {
        propItem.querySelector('.del-p').onclick = () => {
          const targetRoot = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${targetId}"]`);
          const el = selector === "" ? targetRoot : targetRoot?.querySelector(selector);
          const masterNode = this.logic.findNodeById(this.tree, targetId)

          if (el) {
            if (item.prop === 'custom-css') {
              const lastCss = el.dataset.lastCustomCss || "";
              el.style.cssText = el.style.cssText.replace(lastCss, "").trim();
              delete el.dataset.lastCustomCss;
            } else {
              const safeSelector = selector.replace(/\./g, '-');
              el.style.removeProperty(`--id-${targetId}${safeSelector}-${item.prop}`);
              el.style.removeProperty(item.prop);
              
              // 個別プロパティ削除後、自由CSSを再評価
              const customVal = masterNode?.attrs[`${selector}:custom-css`];
              if (customVal) this._applyCustomCssWithPriority(el, customVal);
            }
          }

          if (masterNode?.attrs) delete masterNode.attrs[storageKey];
          propItem.remove();
          this.saveToLocalStorage();
        };
      }
      // ---------------------------------------------------------------


      /**
       * 指定された親要素に対し、STYLE_DEFS の定義順に基づいて子要素を挿入する
       * @private
       */
      _insertSortedPropItem(parent, newItem, currentProp) {
        const currentIndex = this.ctx.STYLE_DEFS.findIndex(s => s.prop === currentProp);
        const existingItems = Array.from(parent.querySelectorAll('.prop-input-item'));
        
        const nextItem = existingItems.find(el => {
          const prop = el.getAttribute('data-p');
          const index = this.ctx.STYLE_DEFS.findIndex(s => s.prop === prop);
          return index > currentIndex;
        });

        if (nextItem) {
          parent.insertBefore(newItem, nextItem);
        } else {
          parent.appendChild(newItem);
        }
      }
      // ---------------------------------------------------------------


  // ---------------------------------------------------------------



  /**
   * サイドバーの各行とプレビューDOM間のホバー（強調表示）イベントをバインドする
   * @param {HTMLElement} parent - イベントを監視するサイドバーの親コンテナ
   */
  bindHoverEvents(parent) {
    if (parent._hoverBound) return;
    parent._hoverBound = true;

    const getRowId = (e) => e.target.closest("[data-row-id]")?.getAttribute("data-row-id");

    parent.addEventListener("mouseover", (e) => {
      const id = getRowId(e);
      if (id) this._toggleHighlight(id, true);
    });

    parent.addEventListener("mouseout", (e) => {
      const id = getRowId(e);
      if (id) this._toggleHighlight(id, false);
    });
  }

  /**
   * 指定したIDの要素（プレビュー側とサイドバー側両方）のホバー状態を同期する
   * @param {string} id - 対象のノードID
   * @param {boolean} isActive - ホバー中かどうか
   * @private
   */
  _toggleHighlight(id, isActive) {
    const attr = "data-tree-hover";

    // 1. プレビュー側の要素を操作
    const previewEl = document.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${id}"]`);
    if (previewEl) {
      // クラスは使わず、属性だけで状態を管理
      previewEl.setAttribute(attr, isActive ? 'true' : 'false');
    }

    // 2. サイドバー側の行（ツリーアイテム）を操作
    const sidebarRow = document.querySelector(`[data-row-id="${id}"]`);
    if (sidebarRow) {
      // サイドバー側も属性で管理するように変更
      sidebarRow.setAttribute(attr, isActive ? 'true' : 'false');
    }
  }
  // ---------------------------------------------------------------





  moveTreeNode(targetId, fromId, toId, newIndex) {
    // 1. 移動対象をツリーから探し出し、一旦取り出す
    const movedNode = this._extractNodeById(this.tree, targetId);

    if (!movedNode) {
      console.warn(`Node not found: ${targetId}`);
      return;
    }

    // 2. 指定された移動先の親ノード（またはルート）に挿入する
    this._insertNodeAt(this.tree, toId, newIndex, movedNode);
  }

  // ---------------------------------------------------------------


      /**
       * ツリー内を再帰的に探索し、対象ノードを削除してそのデータを返す
       * @param {Object[]} list - 探索対象の配列
       * @param {string} targetId - 取り出したいノードのID
       * @returns {Object|null} 取り出したノードデータ、見つからない場合はnull
       * @private
       */
      _extractNodeById(list, targetId) {
        for (let i = 0; i < list.length; i++) {
          if (list[i].id === targetId) {
            // 対象が見つかったので配列から削除して返す
            return list.splice(i, 1)[0];
          }
          if (list[i].children && list[i].children.length > 0) {
            const found = this._extractNodeById(list[i].children, targetId);
            if (found) return found;
          }
        }
        return null;
      }
      // ---------------------------------------------------------------

      

      /**
       * 指定した親ノードの children 配列、またはルート配列にノードを挿入する
       * @param {Object[]} list - 探索対象の配列
       * @param {string|null} parentId - 挿入先の親ID（ルートならnull）
       * @param {number} index - 挿入するインデックス
       * @param {Object} nodeToInsert - 挿入するノードデータ
       * @returns {boolean} 挿入に成功したか
       * @private
       */
      _insertNodeAt(list, parentId, index, nodeToInsert) {
        // ルートへの挿入
        if (!parentId) {
          list.splice(index, 0, nodeToInsert);
          return true;
        }

        // 特定の親ノードを再帰的に探す
        for (let node of list) {
          if (node.id === parentId) {
            if (!Array.isArray(node.children)) node.children = [];
            node.children.splice(index, 0, nodeToInsert);
            return true;
          }
          if (node.children && node.children.length > 0) {
            if (this._insertNodeAt(node.children, parentId, index, nodeToInsert)) {
              return true;
            }
          }
        }
        return false;
      }
      // ---------------------------------------------------------------

  // ---------------------------------------------------------------





  /**
   * ボトムシートの初期化とイベント登録
   */
  initBottomSheet() {
    let sheet = document.getElementById('module-bottom-sheet');
    if (!sheet) {
      sheet = this.ui.createModuleBottomSheet();
      document.body.appendChild(sheet);
      
      // イベントバインド
      sheet.querySelector('.close-sheet').onclick = () => this.closeModuleSheet();
      sheet.querySelector('.sheet-overlay').onclick = () => this.closeModuleSheet();
      sheet.querySelector('#bulk-add-confirm-btn').onclick = () => this.executeBulkAdd();
    }
  }
  // ---------------------------------------------------------------





  /**
   * 新しいモジュールを生成し、指定した親ID（またはルート）の末尾に追加する
   * @param {string} defId - モジュール定義のID (例: 'm-text01')
   * @param {string|null} [parentId=null] - 追加先の親ノードID。nullの場合はルートへ。
   */
  addModule(defId, parentId = null) {
    // 1. ノードの初期データを生成（既存の整理済みメソッドを使用）
    const newNode = this.createInitialData(defId);
    if (!newNode) return;

    // 2. 指定された場所にデータを挿入（内部ロジックを分離）
    this._attachNodeToTarget(newNode, parentId);

    // 3. 同期と保存
    this.syncView();
  }
  // ---------------------------------------------------------------


      /**
       * 生成されたノードを、IDを元にツリー内の適切な場所に接続する
       * @param {Object} newNode - 追加するノードデータ
       * @param {string|null} parentId - ターゲットとなる親のID
       * @private
       */
      _attachNodeToTarget(newNode, parentId) {
        if (!parentId) {
          // 親IDがない場合はルート配列に追加
          this.tree.push(newNode);
          return;
        }

        // 親IDがある場合はツリー内を検索して追加
        const parentNode = this.logic.findNodeById(this.tree, parentId);
        if (parentNode) {
          if (!Array.isArray(parentNode.children)) parentNode.children = [];
          parentNode.children.push(newNode);
        } else {
          console.warn(`Target parent node not found: ${parentId}`);
        }
      }
      // ---------------------------------------------------------------


  // ---------------------------------------------------------------



  /**
   * 構造（グリッド枠やリスト項目など）をデータに追加する
   * @param {string} parentId - 親（グリッドセット等）のID
   * @param {string} label - 表示ラベル（"グリッド" または "リスト"）
   */
  addStructure(parentId, label) {
    const parentNode = this.logic.findNodeById(this.tree, parentId);
    if (!parentNode) return;

    // 1. 新しい枠を作成
    const newStructure = {
      id: "id-" + Math.random().toString(36).slice(2, 11),
      type: 'structure-box',
      label: label,
      children: [],
      isStructure: true
    };

    // 2. 初期モジュールを入れる（現状の確実な定義）
    const defaultModuleId = 'm-text01';
    const childModule = this.createInitialData(defaultModuleId);
    if (childModule) {
      newStructure.children.push(childModule);
    }

    // 3. 親の children 配列に追加
    if (!Array.isArray(parentNode.children)) parentNode.children = [];
    parentNode.children.push(newStructure);

    // 4. 再描画
    this.syncView();
  }
  // ---------------------------------------------------------------




 /**
   * 現在のデータツリーをJSONファイルとしてシリアライズし、ブラウザからダウンロードする
   */
  exportJSON() {
    // ✅ ページを含む全体を書き出す
    const jsonString = JSON.stringify(this.project, null, 2);

    const fileName = this._generateExportFileName('json');
    this._downloadFile(jsonString, fileName, 'application/json');
  }
  // ---------------------------------------------------------------


      /**
       * タイムスタンプを含むエクスポート用ファイル名を生成する
       * @param {string} extension - 拡張子 (例: 'json', 'html')
       * @returns {string} ファイル名
       * @private
       */
      _generateExportFileName(extension) {
        const timestamp = new Date().getTime();
        return `web-module-data-${timestamp}.${extension}`;
      }
      // ---------------------------------------------------------------


      /**
       * 文字列データをファイルとしてブラウザにダウンロードさせる
       * @param {string} content - 書き出す内容
       * @param {string} fileName - 保存するファイル名
       * @param {string} contentType - MIMEタイプ
       * @private
       */
      _downloadFile(content, fileName, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        
        // DOMに追加せずに発火させてクリーンに保つ
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // メモリ解放
        URL.revokeObjectURL(url);
      }
      // ---------------------------------------------------------------
      
  // ---------------------------------------------------------------


  /**
   * 全ノードのスタイル（個別設定 ＆ 自由入力CSS）を解析し、CSSファイルとしてエクスポートする
   */
  exportCSS() {
    let cssContent = "/* Generated by WebModuleBuilder */\n\n";

    // 1. ツリーを走査してCSS文字列を構築（✅ this.tree）
    cssContent += this._buildFullCssString(this.tree);

    // 2. ファイル名の生成
    const fileName = this._generateExportFileName('css');

    // 3. 共通メソッドを使用してダウンロード
    this._downloadFile(cssContent, fileName, 'text/css');
  }
  // ---------------------------------------------------------------


      /**
       * ノードリストを再帰的に解析し、各要素のCSSルールを生成する
       * @param {Object[]} nodes - ノード配列
       * @returns {string} 構築されたCSS文字列
       * @private
       */
      _buildFullCssString(nodes) {
        let str = "";

        nodes.forEach(node => {
          if (node.attrs) {
            // ターゲット(selector)ごとにスタイルを集計
            const targetStyles = this._collectStylesBySelector(node);

            Object.entries(targetStyles).forEach(([selector, styles]) => {
              const cssSelector = `[${this.ctx.CONFIG.ATTRIBUTES.TREE_ID}="${node.id}"]${selector}`;
              str += `${cssSelector} {\n${styles.join('\n')}\n}\n\n`;
            });
          }

          // 子要素も再帰的に処理
          if (node.children && node.children.length > 0) {
            str += this._buildFullCssString(node.children);
          }
        });

        return str;
      }
      // ---------------------------------------------------------------


      /**
       * ノードのattrsからセレクタごとのスタイル定義を整理する
       * @private
       */
      _collectStylesBySelector(node) {
        const map = {};

        Object.entries(node.attrs).forEach(([key, val]) => {
          if (!key.includes(':')) return;
          const [selector, prop] = key.split(':');
          if (!map[selector]) map[selector] = [];

          if (prop === 'custom-css') {
            // 自由入力CSSをそのまま追加
            map[selector].push(`  ${val}`);
          } else {
            // 個別プロパティを追加
            map[selector].push(`  ${prop}: ${val};`);
          }
        });

        return map;
      }
      // ---------------------------------------------------------------


  // ---------------------------------------------------------------




  /**
   * ツールバーを生成し、DOMにマウントする
   * UIの具体的な構築ロジックは this.ui.createToolbar に委譲する
   */
  renderToolbar() {
    const selector = this.ctx.CONFIG.SELECTORS.TOOLBAR || '#builder-toolbar';
    const container = document.querySelector(selector);
    
    if (!container) {
      console.warn(`Toolbar container not found: ${selector}`);
      return;
    }

    // コンテナをクリア
    container.innerHTML = "";
    
    // UIクラスに生成を丸投げ
    const toolbarEl = this.ui.createToolbar(this);
    
    if (toolbarEl) {
      container.appendChild(toolbarEl);
    }
  }
  // ---------------------------------------------------------------



  /**
   * ボトムシートを開く
   */
  openModuleSheet() {
    let sheet = document.getElementById('module-bottom-sheet');
    if (!sheet) {
      sheet = this.ui.createModuleBottomSheet();
      document.body.appendChild(sheet);
      this._bindSheetEvents(sheet);
    }

    // ✅ 単一選択なので、常にここでクリア
    this.selectedModuleCounts = {};

    this._renderSheetGrid();

    sheet.classList.remove('is-hidden');
    setTimeout(() => sheet.classList.add('is-active'), 10);
  }
  // ---------------------------------------------------------------

      /**
       * シート内のグリッドを描画する（WebModuleUIのパーツを使用）
       */
      _renderSheetGrid() {
        const grid = document.getElementById('sheet-module-grid');
        if (!grid) return;
        grid.innerHTML = "";

        Object.entries(this.ctx.ELEMENT_DEFS).forEach(([key, def]) => {
          const itemEl = this.ui.createSheetItem(key, def);

          itemEl.onclick = () => {
            const k = itemEl.dataset.key;
            const isAlreadySelected = (this.selectedModuleCounts[k] === 1);

            // ✅ まず全部解除（単一選択）
            grid.querySelectorAll('.sheet-item.is-selected').forEach(el => {
              el.classList.remove('is-selected');
              const b = el.querySelector('.item-badge');
              if (b) b.textContent = ""; // 表示消す
            });
            this.selectedModuleCounts = {};

            // ✅ すでに選ばれてたなら「解除」で終わり
            if (isAlreadySelected) {
              this._updateSheetFooter();
              return;
            }

            // ✅ そうでなければ、この1つだけ選択
            this.selectedModuleCounts[k] = 1;
            itemEl.classList.add('is-selected');
            const badge = itemEl.querySelector('.item-badge');
            if (badge) badge.textContent = "✓";

            this._updateSheetFooter();
          };

          // 初期表示は未選択にする（badge消す）
          const badge = itemEl.querySelector('.item-badge');
          if (badge) badge.textContent = "";

          grid.appendChild(itemEl);
        });
      }
      // ---------------------------------------------------------------

      /**
       * シート内の「追加ボタン」などの状態更新
       */
      _updateSheetFooter() {
        const btn = document.getElementById('bulk-add-confirm-btn');
        const count = document.getElementById('selected-count');

        const total = Object.values(this.selectedModuleCounts).reduce((a, b) => a + b, 0);

        if (count) count.textContent = String(total);
        if (btn) btn.disabled = total === 0;
      }
      // ---------------------------------------------------------------

      /**
       * ボトムシートのイベント紐付け（初回のみ）
       */
      _bindSheetEvents(sheet) {
        sheet.querySelector('.close-sheet').onclick = () => this.closeModuleSheet();
        sheet.querySelector('.sheet-overlay').onclick = () => this.closeModuleSheet();
        sheet.querySelector('#bulk-add-confirm-btn').onclick = () => this.executeBulkAdd();
      }
      // ---------------------------------------------------------------

  /**
   * 選択したモジュールを一括でデータに追加
   */
  executeBulkAdd() {
    const targetParentId = this.pendingAddParentId;

    Object.entries(this.selectedModuleCounts).forEach(([type, qty]) => {
      for (let i = 0; i < qty; i++) {
        const newNode = this.createInitialData(type);
        if (!newNode) continue;

        if (targetParentId) {
          const parentNode = this.logic.findNodeById(this.tree, targetParentId);
          if (parentNode) {
            if (!Array.isArray(parentNode.children)) parentNode.children = [];
            parentNode.children.push(newNode);
          }
        } else {
          this.tree.push(newNode); // ✅ ここ
        }
      }
    });

    this.pendingAddParentId = null;
    this.selectedModuleCounts = {};
    this.syncView();
    this.saveToLocalStorage();
    this.closeModuleSheet();
  }
  // ---------------------------------------------------------------

  /**
   * ボトムシートを閉じる
   */
  closeModuleSheet() {
    const sheet = document.getElementById('module-bottom-sheet');
    if (sheet) {
      sheet.classList.remove('is-active');
      setTimeout(() => sheet.classList.add('is-hidden'), 300);
    }
  }
  // ---------------------------------------------------------------




  /**
   * JSONファイルを選択し、現在のエディタ状態を復元する
   */
  importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const jsonContent = await this._readFileAsText(file);
        const importedData = JSON.parse(jsonContent);

        // データの適用（確認と履歴保存を含む）
        this._applyImportedData(importedData);
      } catch (err) {
        alert('ファイルの読み込み、またはJSONの解析に失敗しました。');
        console.error('Import error:', err);
      }
    };
    
    input.click();
  }
  // ---------------------------------------------------------------


      /**
       * 読み込んだデータを現在のマスターデータに適用する
       * @param {Object[]} importedData - インポートされたツリーデータ
       * @private
       */
      _applyImportedData(importedData) {
        // ✅ project形式
        if (importedData && Array.isArray(importedData.pages)) {

          if (!confirm('現在の内容が上書きされます。よろしいですか？')) return;

          this.project = importedData;

          // activePageId 修復
          if (!this.project.pages.some(p => p.id === this.project.activePageId)) {
            this.project.activePageId = this.project.pages[0].id;
          }

          this.renderToolbar();
          this.syncView();
          alert('プロジェクトを復元しました。');
          return;
        }

        // ✅ tree形式（今のページだけ置き換え）
        if (Array.isArray(importedData)) {

          if (!confirm('現在のページを上書きします。よろしいですか？')) return;

          this._getActivePage().tree = importedData;
          this.syncView();
          alert('ページを復元しました。');
          return;
        }

        // ❌ 不正
        alert('JSON形式が不正です');
      }
      // ---------------------------------------------------------------


      /**
       * Fileオブジェクトをテキストとして読み込む（Promise化）
       * @param {File} file 
       * @returns {Promise<string>}
       * @private
       */
      _readFileAsText(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = (e) => reject(e);
          reader.readAsText(file);
        });
      }
      // ---------------------------------------------------------------

  // ---------------------------------------------------------------

  

  

  /**
   * データをブラウザの localStorage に保存する
   */
  saveToLocalStorage() {
    try {
      localStorage.setItem(
        "web_module_builder_data",
        JSON.stringify(this.project)
      );
    } catch (e) {
      console.error("saveToLocalStorage failed:", e);
    }
  }
  // ---------------------------------------------------------------




  /**
   * localStorage からデータを復元する
   */
  loadFromLocalStorage() {
    const raw = localStorage.getItem("web_module_builder_data");
    if (!raw) return false;

    try {
      const parsed = JSON.parse(raw);

      // project(v2) 前提（旧は考えない）
      if (!parsed || !Array.isArray(parsed.pages) || parsed.pages.length === 0) return false;

      // ✅ state に入れる
      this.state.project = parsed;

      // activePageId が壊れてたら先頭に寄せる
      if (!this.state.project.pages.some(p => p.id === this.state.project.activePageId)) {
        this.state.project.activePageId = this.state.project.pages[0].id;
      }

      // まだ this.project を残してるなら参照を合わせる（並走期間の事故防止）
      this.project = this.state.project;

      // tree参照を同期（あなたの実装に合わせて呼ぶ）
      if (typeof this._syncActiveTreeRef === "function") this._syncActiveTreeRef();

      return true;
    } catch (e) {
      console.error("loadFromLocalStorage failed:", e);
      return false;
    }
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
    // ✅ stateを正にする
    this.uiState.previewDragEnabled = enabled;

    // 既存互換（まだ消さない）
    this.previewDragEnabled = enabled;

    const container = document.querySelector(this.ctx.CONFIG.SELECTORS.CONTAINER_INNER);
    if (container) container.classList.toggle('drag-enabled', enabled);

    this.syncView();
  }
  // ---------------------------------------------------------------


  

}


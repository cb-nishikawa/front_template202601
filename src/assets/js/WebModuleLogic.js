export class WebModuleLogic {
  constructor(ctx) {
    this.ctx = ctx;
  }



  /**
   * 実DOMを再帰的に走査し、サイドバー用のJSONツリー構造に変換する
   */
  // ---------------------------------------------------------------
  buildModuleTree(root) {
    if (!root) return [];
    const dzAttr = this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE;

    return Array.from(root.children)
      .filter(el => !el.closest(this.ctx.CONFIG.SELECTORS.EXCLUDE_AREAS))
      .map(el => {
        const comp = el.getAttribute(this.ctx.CONFIG.ATTRIBUTES.COMPONENT);
        const mod = el.getAttribute(this.ctx.CONFIG.ATTRIBUTES.MODULE);
        const isDZ = el.hasAttribute(dzAttr);

        if (comp || mod || isDZ) {
          const def = this.ctx.ELEMENT_DEFS[comp || mod];
          
          // --- 【修正】ラベル決定ロジック ---
          let label = def ? def.label : "要素"; 
          
          // data-tree-view が指定されている子要素があれば、そのテキストをラベルにする
          const viewEl = el.querySelector('[data-tree-view]');
          if (viewEl && viewEl.textContent.trim() !== "") {
            label = viewEl.textContent.trim();
          } else if (isDZ) {
            label = el.getAttribute(dzAttr) || "枠";
          }

          const node = {
            id: this.getOrSetId(el),
            type: comp || mod || 'structure-box',
            label: label,
            isStructure: isDZ || (def && def.template.includes(dzAttr)),
            children: this.buildModuleTree(this.getDropZoneContainer(el))
          };
          return node;
        }
        return null;
      }).filter(Boolean);
  }
  // ---------------------------------------------------------------





  /**
   * 子要素を再帰する「中身のコンテナ」を返す
   * - 要素自体が data-drop-zone を持つ → その要素がコンテナ
   * - テンプレ内にダミーの data-drop-zone がある → その親要素が実コンテナ
   */
  getDropZoneContainer(el) {
    const dzAttr = this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE;

    // 1) 自分がドロップゾーンなら、自分が中身のコンテナ
    if (el.hasAttribute(dzAttr)) return el;

    // 2) 内部にドロップゾーン(ダミー)があるなら「その親」が実際に子が積まれる場所
    const dz = el.querySelector(`[${dzAttr}]`);
    if (!dz) return el;

    return dz.parentElement || el;
  }
  // ---------------------------------------------------------------



  // WebModuleLogic.js 内の buildModuleTree メソッド周辺
  extractContent(el) {
    // 編集対象の要素を探す
    const target = el.hasAttribute('data-edit') ? el : el.querySelector('[data-edit]');
    if (!target) return undefined;

    const editConfig = target.getAttribute('data-edit');
    if (editConfig.includes('html:')) {
      const text = target.innerHTML.trim();
      // 【重要】もし中身が "$html" という文字列そのものなら、それはデータではないので無視する
      if (text === '$html' || text === '') return undefined; 
      return text;
    }
    return undefined;
  }

  // 属性抽出も同様
  extractAttrs(el) {
    const target = el.querySelector('[data-edit]');
    if (!target) return {};

    const attrs = {};
    const editConfig = target.getAttribute('data-edit');
    
    // 例: "src:画像URL:初期値; alt:名前:初期値"
    editConfig.split(';').forEach(conf => {
      const [key] = conf.split(':').map(s => s.trim());
      if (key !== 'html') {
        const val = target.getAttribute(key);
        // 【重要】値が "$src" などの変数名なら取り込まない
        if (val && !val.startsWith('$')) {
          attrs[key] = val;
        }
      }
    });
    return attrs;
  }


  /**
   * モジュール内の「子要素を格納すべきコンテナ（DropZone）」を特定する
   * @param {Element} el - 探索対象の要素
   * @returns {Element} 見つかったコンテナ要素、または自身の要素
   */
  // ---------------------------------------------------------------
  findContentContainer(el) {
    const dzAttr = this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE;
    if (!el) return null;
    if (el.hasAttribute(dzAttr)) return el;
    if (el.querySelector(`:scope > [${dzAttr}]`)) return el;

    const queue = Array.from(el.children);
    while (queue.length) {
      const node = queue.shift();
      if (node.querySelector(`:scope > [${dzAttr}]`)) return node;
      queue.push(...node.children);
    }
    return el;
  }
  // ---------------------------------------------------------------



  /**
   * 要素にユニークなID（data-tree-id）を付与し、その値を返す
   * すでにIDが存在する場合は既存の値を返す
   * @param {Element} el - IDを付与・取得したい要素
   * @returns {string} 付与されたID文字列
   */
  // ---------------------------------------------------------------
  getOrSetId(el) {
    const idAttr = this.ctx.CONFIG.ATTRIBUTES.TREE_ID;
    if (!el.dataset.treeId) {
      el.dataset.treeId = "id-" + Math.random().toString(36).slice(2, 11);
      el.setAttribute(idAttr, el.dataset.treeId);
    }
    return el.dataset.treeId;
  }
  // ---------------------------------------------------------------



  /**
   * JSONツリーデータの中から指定されたIDを持つノードを検索する
   * @param {Array} tree - 検索対象のツリー配列
   * @param {string} id - 検索したいID
   * @returns {Object|null} 見つかったノード、またはnull
   */
  // ---------------------------------------------------------------
  findNodeById(tree, id) {
    for (const n of tree) {
      if (n.id === id) return n;
      if (n.children?.length) {
        const hit = this.findNodeById(n.children, id);
        if (hit) return hit;
      }
    }
    return null;
  }
  // ---------------------------------------------------------------



  /**
   * 指定された定義IDから、初期状態のノードデータを生成する
   * @param {string} defId 
   * @returns {Object|null}
   */
  createEmptyNode(defId) {
    const def = this.ctx.ELEMENT_DEFS[defId];
    if (!def) return null;

    // 1. ユニークIDの生成
    const id = "id-" + Math.random().toString(36).slice(2, 11);

    // 2. テンプレートから初期ラベルの抽出 (Builderにあったロジックをここに集約)
    let label = def.label;
    const temp = document.createElement('div');
    temp.innerHTML = def.template;
    const treeViewEl = temp.querySelector('[data-tree-view]');
    if (treeViewEl) {
      const editConf = treeViewEl.getAttribute('data-edit');
      if (editConf && editConf.includes('html:')) {
        const configPart = editConf.split(';').find(c => c.trim().startsWith('html:'));
        if (configPart) {
          label = configPart.split(':')[2] || def.label;
        }
      }
    }

    // 3. ノードの基本形
    const newNode = {
      id: id,
      type: defId,
      label: label,
      children: [],
      attrs: {},
      isStructure: def.template.includes(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE)
    };

    // 4. DropZone（入れ子構造）がある場合、デフォルトの子要素（structure-box）を入れる
    const dzEl = temp.querySelector(`[${this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE}]`);
    if (dzEl) {
      newNode.children.push({
        id: "id-" + Math.random().toString(36).slice(2, 11),
        type: 'structure-box',
        label: dzEl.getAttribute(this.ctx.CONFIG.ATTRIBUTES.DROP_ZONE) || "枠",
        isStructure: true,
        children: []
      });
    }

    return newNode;
  }
  // ---------------------------------------------------------------


  
}
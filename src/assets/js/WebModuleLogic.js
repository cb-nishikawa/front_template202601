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
        
        // 修正：自分自身がドロップゾーンか、あるいは子にドロップゾーンを持つか
        const dzVal = el.getAttribute(dzAttr);
        const isDZ = el.hasAttribute(dzAttr);

        if (comp || mod || isDZ) {
          const def = this.ctx.ELEMENT_DEFS[comp || mod];
          
          // ドロップゾーンの場合はその名前、モジュールの場合は定義のラベル
          let label = isDZ ? (dzVal || "枠") : (def ? def.label : (comp || mod));
          
          const node = {
            id: this.getOrSetId(el),
            type: comp || mod || 'structure-box', // DZの場合は専用の型にする
            label: label,
            isStructure: isDZ || !!def?.default,
            // 中身の解析：ドロップゾーンそのものならその子を、モジュールならその中のDZを探す
            children: isDZ 
              ? this.buildModuleTree(el) 
              : this.buildModuleTree(this.findContentContainer(el)),
            attrs: {},
            content: ""
          };
          
          // (以下、attrsやcontentの取得処理はそのまま)
          return node;
        }
        return null;
      }).filter(Boolean);
  }
  // ---------------------------------------------------------------



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
}
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
        const hasDZ = el.hasAttribute(dzAttr);
        const dzVal = el.getAttribute(dzAttr);

        // モジュール、または DropZone 自体をノードとして確定
        if (comp || mod || hasDZ) {
          const def = this.ctx.ELEMENT_DEFS[comp || mod];
          
          // --- ラベル決定ロジック ---
          let label = def ? def.label : (dzVal || comp || mod || this.ctx.LABELS.STRUCTURE);
          
          // data-tree-view があれば中身を優先
          const viewEl = el.querySelector('[data-tree-view]');
          if (viewEl) {
            // その viewEl が「自分自身に属するもの」かチェック
            // ＝ その viewEl から見て一番近い親モジュールが自分自身であること
            const closestModule = viewEl.closest(`[${this.ctx.CONFIG.ATTRIBUTES.MODULE}], [${this.ctx.CONFIG.ATTRIBUTES.COMPONENT}]`);
            
            if (closestModule === el) {
              const textContent = viewEl.innerText.trim();
              if (textContent) {
                label = textContent.length > 20 ? textContent.substring(0, 20) + "..." : textContent;
              }
            }
          }

          // --- 子要素の取得ロジック（ここがボタン消失防止の鍵） ---
          let children = [];
          if (hasDZ) {
            // DropZone自身の場合は、その直下の子要素をスキャン
            children = this.buildModuleTree(el);
          } else {
            // モジュールの場合は、内部にあるDropZoneを探す
            const contentContainer = this.findContentContainer(el);
            // 内部に自分とは異なるDropZoneがある場合のみ掘り下げる
            if (contentContainer && contentContainer !== el) {
              children = this.buildModuleTree(contentContainer);
            }
          }

          return {
            label: label,
            id: this.getOrSetId(el),
            isStructure: hasDZ,
            children: children
          };
        }

        // comp/mod/DZ いずれでもない要素（wrapper等）はスキップして中身を昇格
        return this.buildModuleTree(el);
      }).flat();
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
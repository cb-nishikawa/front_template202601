/**
 * 共通モジュールの構造定義
 */
const moduleTemplates = {

    'm-module': (el) => {
        const tag = el.getAttribute('tag') || 'p';
        const moduleName = el.getAttribute('data-module') || 'module';
        const className = el.className ? ` class="${el.className}"` : '';
        const type = el.getAttribute('data-type') || '';
        const typeAttr = type ? ` data-type="${type}"` : '';
        const href = el.getAttribute('href');
        const src = el.getAttribute('src');
        const alt = el.getAttribute('alt') || '';
        
        // 画像の場合
        if (src) {
            return `
                <${tag}${className} data-module="${moduleName}"${typeAttr}>
                    <span class="wrapper">
                        <span class="inner">
                            <img src="${src}" alt="${alt}">
                        </span>
                    </span>
                </${tag}>`;
        }
        
        // リンクの場合
        if (href) {
            return `
                <${tag}${className} data-module="${moduleName}"${typeAttr}>
                    <a href="${href}" class="wrapper">
                        <span class="inner">${el.innerHTML}</span>
                    </a>
                </${tag}>`;
        }
        
        // 通常のテキスト
        return `
            <${tag}${className} data-module="${moduleName}"${typeAttr}>
                <span class="wrapper"><span class="inner">${el.innerHTML}</span></span>
            </${tag}>`;
    },

    'm-ulist01': (el) => {
        const className = el.className ? ` class="${el.className}"` : '';
        const moduleName = el.getAttribute('data-module') || 'm-uList01';

        return `
            <ul${className} data-module="${moduleName}">
                ${el.innerHTML}
            </ul>`;
    },

    // レイアウト
    'l-layout': (el) => {
        const moduleName = el.getAttribute('data-module') || 'l-layout';
        const className = el.className ? ` class="${el.className}"` : '';
        const side = el.getAttribute('data-side');
        const grid = el.getAttribute('data-grid');
        
        let dataAttrs = '';
        if (side) {
            dataAttrs += ` data-side="${side}"`;
        }
        if (grid) {
            dataAttrs += ` data-grid="${grid}"`;
        }

        return `
            <div${className} data-module="${moduleName}"${dataAttrs}>
                <div class="wrapper">
                    <div class="inner">${el.innerHTML}</div>
                </div>
            </div>`;
    },

   
    // レイアウト（サイドレイアウト）
    'l-side-by-contents01': (el) => {
        const moduleName = el.getAttribute('data-module') || 'l-sideByContents01';
        const side = el.getAttribute('data-side') || 'left';
        const className = el.className ? ` class="${el.className}"` : '';

        return `
            <div${className} data-module="${moduleName}" data-side="${side}">
                <div class="wrapper">
                    <div class="inner">${el.innerHTML}</div>
                </div>
            </div>`;
    },

    // レイアウト（グリッドレイアウト）
    'l-grid-contents01': (el) => {
        const moduleName = el.getAttribute('data-module') || 'l-gridContents01';
        const grid = el.getAttribute('data-grid') || '1';
        const className = el.className ? ` class="${el.className}"` : '';

        return `
            <div${className} data-module="${moduleName}" data-grid="${grid}">
                <div class="wrapper">
                    <div class="inner">${el.innerHTML}</div>
                </div>
            </div>`;
    }
};


// カスタム要素の一括登録
export const initCustomComponents = () => {
  Object.entries(moduleTemplates).forEach(([tagName, templateFn]) => {
    if (!customElements.get(tagName)) {
      customElements.define(tagName, class extends HTMLElement {
        connectedCallback() {
          // 1. テンプレートから HTML 文字列を生成
          const htmlString = templateFn(this);
          
          // 2. 一時的なコンテナを作って DOM 要素に変換
          const temp = document.createElement('div');
          temp.innerHTML = htmlString.trim();
          const newElement = temp.firstChild;

          // 3. 自分自身（<m-title-large> など）を新しい要素で置き換える
          this.replaceWith(newElement);
        }
      });
    }
  });
};

// 実行
initCustomComponents();
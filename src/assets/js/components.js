/**
 * 共通モジュールの構造定義
 */
const moduleTemplates = {

    'm-module': (el) => {
        const tag = el.getAttribute('tag') || 'p';
        const moduleName = el.getAttribute('data-module') || 'module';
        const className = el.className ? ` class="${el.className}"` : '';
        const type = el.getAttribute('data-type') || '';
        const href = el.getAttribute('href');
        const src = el.getAttribute('src');
        const alt = el.getAttribute('alt') || '';
        const wrapTag = el.getAttribute('wrapTag') || 'span';
        const position = el.getAttribute('data-position');
        const grid = el.getAttribute('data-grid');
        
        let dataAttrs = '';
        if (type) {
            dataAttrs += ` data-type="${type}"`;
        }
        if (position) {
            dataAttrs += ` data-position="${position}"`;
        }
        if (grid) {
            dataAttrs += ` data-grid="${grid}"`;
        }
        
        // 画像の場合
        if (src) {
            return `
                <${tag}${className} data-module="${moduleName}"${dataAttrs}>
                    <${wrapTag} class="wrapper">
                        <${wrapTag} class="inner">
                            <img src="${src}" alt="${alt}">
                        </${wrapTag}>
                    </${wrapTag}>
                </${tag}>`;
        }
        
        // リンクの場合
        if (href) {
            return `
                <${tag}${className} data-module="${moduleName}"${dataAttrs}>
                    <a href="${href}" class="wrapper">
                        <${wrapTag} class="inner">${el.innerHTML}</${wrapTag}>
                    </a>
                </${tag}>`;
        }
        
        // 通常のテキスト
        return `
            <${tag}${className} data-module="${moduleName}"${dataAttrs}>
                <${wrapTag} class="wrapper"><${wrapTag} class="inner">${el.innerHTML}</${wrapTag}></${wrapTag}>
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
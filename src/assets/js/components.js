/**
 * 共通モジュールの構造定義
 */
const moduleTemplates = {
    // タイトル（大）
    'm-title-large01': (el) => {
        const tag = el.getAttribute('tag') || 'h3';
        const className = el.className ? ` class="${el.className}"` : '';
        return `
            <${tag}${className} data-module="m-title_large01">
                <span class="wrapper"><span class="inner">${el.innerHTML}</span></span>
            </${tag}>`;
    },

    // タイトル（太字）
    'm-title-bold01': (el) => {
        const tag = el.getAttribute('tag') || 'h3';
        const className = el.className ? ` class="${el.className}"` : '';
        return `
            <${tag}${className} data-module="m-title_bold01">
                <span class="wrapper"><span class="inner">${el.innerHTML}</span></span>
            </${tag}>`;
    },

    // テキスト
    'm-text-unit01': (el) => {
        const tag = el.getAttribute('tag') || 'p';
        const className = el.className ? ` class="${el.className}"` : '';
        return `
            <${tag}${className} data-module="m-text01">
                <span class="wrapper"><span class="inner">${el.innerHTML}</span></span>
            </${tag}>`;
    },

    // リンクテキスト
    'm-link-unit01': (el) => {
        const tag = el.getAttribute('tag') || 'p';
        const href = el.getAttribute('href') || '#';
        const className = el.className ? ` class="${el.className}"` : '';
        return `
            <${tag}${className} data-module="m-text01 m-link01">
                <a href="${href}" class="wrapper">
                    <span class="inner">${el.innerHTML}</span>
                </a>
            </${tag}>`;
    },

    // ボタン
    'm-btn-unit01': (el) => {
        const tag = el.getAttribute('tag') || 'p';
        const href = el.getAttribute('href') || '#';
        const className = el.className ? ` class="${el.className}"` : '';
        return `
            <${tag}${className} data-module="m-btn01">
                <a href="${href}" class="wrapper">
                    <span class="inner">${el.innerHTML}</span>
                </a>
            </${tag}>`;
    },

    // 画像
    'm-image-unit01': (el) => {
        const tag = el.getAttribute('tag') || 'p';
        const src = el.getAttribute('src') || '';
        const alt = el.getAttribute('alt') || '';
        const className = el.className ? ` class="${el.className}"` : '';
        return `
            <${tag}${className} data-module="m-image01">
                <span class="wrapper">
                    <span class="inner">
                        <img src="${src}" alt="${alt}">
                    </span>
                </span>
            </${tag}>`;
    },


    'm-u-list01': (el) => {
        const className = el.className ? ` class="${el.className}"` : '';
        const moduleName = el.getAttribute('data-module') || 'm-uList01';

        return `
            <ul${className} data-module="${moduleName}">
                ${el.innerHTML}
            </ul>`;
    },
        
    // リストアイテム
    'm-list-item01': (el) => {
        const className = el.className ? ` class="${el.className}"` : '';
        return `<li${className}>${el.innerHTML}</li>`;
    },

    // レイアウト（サイドレイアウト）
    'l-side-by-contents01': (el) => {
        const moduleName = el.getAttribute('data-module') || 'l-sideByContents01';
        const side = el.getAttribute('data-side') || 'left';
        const className = el.className ? ` class="${el.className}"` : '';

        return `
            <div${className} data-module="c-common01 ${moduleName}" data-side="${side}">
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
            <div${className} data-module="c-common01 ${moduleName}" data-grid="${grid}">
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
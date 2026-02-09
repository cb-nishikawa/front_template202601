// main.js
import { CONFIG, ELEMENT_DEFS, STYLE_DEFS } from './config.js';
import { createWebModuleBuilder } from './WebModuleBuilder.js';

document.addEventListener('DOMContentLoaded', () => {
  // ビルダーのインスタンスを作成
  const builder = createWebModuleBuilder({
    CONFIG,
    ELEMENT_DEFS,
    STYLE_DEFS
  });

  // 初期化実行
  builder.init();
  
  // 必要に応じてグローバルに関数を公開（閉じるボタンなど）
  window.closeStyleWindow = () => {
    document.querySelector(CONFIG.SELECTORS.STYLE_BLOCK)?.classList.add('is-hidden');
  };
});
import { WebModuleBuilder } from './WebModuleBuilder.js';

export const CONFIG = {
  SELECTORS: {
    CONTAINER_INNER: '[data-target="container"] .inner .block.contents',
    TREE_DISPLAY_INNER: '[data-target="treeDisplay"] .inner',
    EXCLUDE_AREAS: '[data-target="treeDisplay"], [data-target="treeSet"]',
    STYLE_BLOCK: '.block.style',
    STYLE_PANEL_INNER: '#style-edit-panel .inner'
  },
  ATTRIBUTES: {
    TREE_ID: 'data-tree-id',
    COMPONENT: 'data-component',
    MODULE: 'data-module',
    DROP_ZONE: 'data-drop-zone'
  },
  LABELS: {
    COMPONENT: '【c】',
    MODULE: '【m】',
    STRUCTURE: '【s】'
  },
  MAX_HISTORY: 50
};

export const ELEMENT_DEFS = {

  // --- グリッドセット（コンテナ系） ---
  'l-gridContents01': {
    label: 'グリッド', 
    tag: 'div',
    default: 'm-text01', 
    schema: {
      'grid': { label: '列数', type: 'text', default: '3' },
      'type': { 
        label: '種類', type: 'radio', default: 'standard',
        options: [
          { label: '標準', value: 'standard' },
          { label: 'ワイド', value: 'wide' },
          { label: 'フル', value: 'full' }
        ]
      },
      // 単一のON/OFFスイッチとして扱う場合（toggle）
      'show': { 
        label: '表示設定', type: 'toggle', default: 'show',
        options: [
          { label: '表示する', value: 'show' },
          { label: '非表示', value: 'hide' }
        ]
      },
      // もし将来「複数のバッジを表示する」など多項選択が必要なら checkbox を使う
      'tags': {
        label: 'タグ表示', type: 'checkbox', default: '',
        options: [
          { label: '新着', value: 'new' },
          { label: '限定', value: 'limited' },
          { label: 'SALE', value: 'sale' }
        ]
      }
    },
    template: `
      <$tag data-module="l-gridContents01" 
            data-grid="$grid" 
            data-type="$type" 
            data-show="$show"
            data-tags="$tags"
            >
        <div class="wrapper">
          <div class="inner">
            <div class="block contents" data-drop-zone="グリッド"></div>
          </div>
        </div>
      </$tag>`.trim()
  },

  // --- テキストモジュール ---
  'm-text01': {
    label: 'テキスト', 
    tag: 'p',
    schema: {
      'html': { label: 'テキスト内容', type: 'text', default: '新規テキスト', isContent: true }
    },
    template: `
      <$tag data-module="m-text01">
        <span class="wrapper">
          <span class="inner" data-tree-view>$html</span>
        </span>
      </$tag>`.trim()
  },

  // --- ボタンモジュール ---
  'm-btn01': {
    label: 'ボタン', 
    tag: 'p',
    schema: {
      'html': { label: 'ボタンテキスト', type: 'text', default: 'ボタン', isContent: true },
      'href': { label: 'リンク先URL', type: 'input', default: '/link' }
    },
    template: `
      <$tag data-module="m-btn01">
        <a href="$href" class="wrapper">
          <span class="inner" data-tree-view>$html</span>
        </a>
      </$tag>`.trim()
  },

  // --- 画像モジュール ---
  'm-image01': {
    label: '画像', 
    tag: 'figure',
    schema: {
      'src': { label: '画像URL', type: 'input', default: 'https://placehold.jp/200x120.png' },
      'alt': { label: '説明文(ALT)', type: 'input', default: '新規画像' }
    },
    template: `
      <$tag data-module="m-image01">
        <span class="wrapper">
          <span class="inner">
            <img src="$src" alt="$alt">
          </span>
        </span>
      </$tag>`.trim()
  },

  // --- リストセット ---
  'm-uList01': {
    label: 'リスト', 
    tag: 'ul',
    default: 'm-text01',
    schema: {}, // 特別な属性設定がない場合は空
    template: `
      <$tag data-module="m-uList01">
        <li data-drop-zone="リスト"></li>
      </$tag>`.trim()
  }
};

export const STYLE_DEFS = [
  { prop: "width", name: "幅", type: "number" },
  { prop: "height", name: "高さ", type: "number" },
  { prop: "background-color", name: "背景色", type: "color" },
  { prop: "opacity", name: "不透明度", type: "number", step: "0.1", min: "0", max: "1" },
  { prop: "margin-top", name: "上間隔", type: "number" },
  { prop: "margin-bottom", name: "下間隔", type: "number" },
  { prop: "padding-top", name: "上余白", type: "number" },
  { prop: "padding-bottom", name: "下余白", type: "number" },
  { prop: "font-size", name: "文字サイズ", type: "number" },
  { prop: "color", name: "文字色", type: "color" },
  { prop: "custom-css", name: "自由なCSS", type: "textarea" }
];

document.addEventListener('DOMContentLoaded', () => {
  const options = {
    CONFIG: CONFIG,
    ELEMENT_DEFS: ELEMENT_DEFS,
    STYLE_DEFS: STYLE_DEFS
  };

  const builder = new WebModuleBuilder(options);
  builder.init();

  document.getElementById('export-btn').onclick = () => builder.exportJSON();
  document.getElementById('import-btn').onclick = () => builder.importJSON();
});
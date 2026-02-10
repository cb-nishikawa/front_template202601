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
  'm-text01': {
    label: 'テキスト', tag: 'p',
    template: `
      <$tag data-module="m-text01">
        <span class="wrapper">
          <span class="inner" data-edit="html:テキスト内容:新規テキスト" data-tree-view>$html</span>
        </span>
      </$tag>`.trim()
  },
  'm-btn01': {
    label: 'ボタン', tag: 'p',
    template: `
      <$tag data-module="m-btn01">
        <a href="$href" class="wrapper" data-edit="href:リンク先URL:/link">
          <span class="inner" data-edit="html:ボタンテキスト:ボタンモジュール" data-tree-view>$html</span>
        </a>
      </$tag>`.trim()
  },
  'm-image01': {
    label: '画像', tag: 'figure',
    template: `
      <$tag data-module="m-image01">
        <span class="wrapper">
          <span class="inner">
            <img src="$src" alt="$alt" data-edit="src:画像URL:https://placehold.jp/200x120.png; alt:説明文(ALT):新規画像">
          </span>
        </span>
      </$tag>`.trim()
  },
  // グリッドやリストなどのコンテナ系はそのまま
  'l-gridContents01': {
    label: 'グリッドセット', tag: 'div', 
    template: `<$tag data-module="l-gridContents01"><div class="wrapper"><div class="inner"><div class="block contents" data-drop-zone="グリッド"></div></div></div></$tag>`.trim()
  },
  'm-uList01': {
    label: 'リストセット', tag: 'ul', 
    template: `<$tag data-module="m-uList01"><li data-drop-zone="リスト"></li></$tag>`.trim()
  }
};

export const STYLE_DEFS = [
  { prop: "width", name: "幅", type: "number" },
  { prop: "height", name: "高さ", type: "number" },
  { prop: "bg-color", name: "背景色", type: "color" },
  { prop: "opacity", name: "不透明度", type: "number", step: "0.1", min: "0", max: "1" },
  { prop: "margin-top", name: "上余白", type: "number" },
  { prop: "margin-bottom", name: "下余白", type: "number" },
  { prop: "padding-top", name: "上内余白", type: "number" },
  { prop: "padding-bottom", name: "下内余白", type: "number" },
  { prop: "font-size", name: "文字サイズ", type: "number" },
  { prop: "color", name: "文字色", type: "color" }
];

document.addEventListener('DOMContentLoaded', () => {
  const options = {
    CONFIG: CONFIG,
    ELEMENT_DEFS: ELEMENT_DEFS,
    STYLE_DEFS: STYLE_DEFS
  };

  const builder = new WebModuleBuilder(options);
  builder.init();
});
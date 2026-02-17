# WebModuleBuilder アーキテクチャ & フロー

---
## 🧩 概要
WebModuleBuilder は **JSONツリー駆動型のビジュアルレイアウトビルダー** です。

基本思想：
> **state.project.pages[].tree が唯一の正（Single Source of Truth）**

✔ UI表示
✔ プレビューDOM
✔ CSS出力

すべてツリーから生成されます。

---
## 🗂 状態モデル（State）

```js
this.state = {
  project: {
    version: 2,
    activePageId,
    pages: [
      { id, title, tree }
    ]
  },

  ui: {
    previewDragEnabled,
    selectedModuleCounts,
    sheetAllowDuplicates
  },

  history: []
}
```

---
## 🔁 全体フロー（最重要ループ）

```
ユーザー操作
    ↓
state / tree 更新
    ↓
syncView()
    ↓
 ├─ _refreshInternalData()
 ├─ _renderPreview()
 ├─ renderSidebar()
 ├─ saveToLocalStorage()
 └─ initPreviewSortable()
```

👉 **syncView() が全同期の中枢**

---
## 🚀 初期化フロー

### constructor(options)
初期化内容：
- ctx（CONFIG / DEFINITIONS）
- ロジック層（WebModuleLogic）
- UI層（WebModuleUI）
- 状態モデル（state）

---
### init()
起動シーケンス：

```
loadFromLocalStorage()
    ↓
renderToolbar()
    ↓
syncView()
    ↓
キーボードイベント登録
```

使用関数：
- loadFromLocalStorage()
- renderToolbar()
- syncView()

---
## 🖥 描画フロー

### syncView(treeData = null)
Builderの司令塔ループ。

役割：

1️⃣ ツリー更新 / 正規化  
→ `_refreshInternalData()`

2️⃣ プレビューDOM再構築  
→ `_renderPreview()`

3️⃣ ツリーUI再構築  
→ `renderSidebar()`

4️⃣ 状態保存  
→ `saveToLocalStorage()`

5️⃣ D&D再初期化  
→ `initPreviewSortable()`

---
## 🌲 ツリー参照フロー

### get tree()

```
_getActivePage()
    ↓
state.project.pages[].tree
```

関連関数：
- _getActivePage()
- get tree()

---
## ➕ モジュール生成フロー

### createInitialData(type)
ELEMENT_DEFS を元にノード生成。

利用箇所：
- モジュール追加セレクト
- ボトムシート

---
## 📦 ノード追加フロー

### _attachNodeToTarget(newNode, parentId)

```
parentId がある？
   ↓ YES
findNodeById(tree)
   ↓
children.push()

ELSE
   ↓
tree.push()
```

関連関数：
- _attachNodeToTarget()
- logic.findNodeById()

---
## 🖱 ドラッグ＆ドロップフロー

```
SortableJS onEnd
    ↓
_onDragEnd(evt, mode)
    ↓
moveTreeNode()
    ↓
syncView()
```

関連関数：
- _onDragEnd()
- moveTreeNode()
- _extractNodeById()
- _insertNodeAt()

---
## 🔀 ノード移動ロジック

### moveTreeNode(targetId, fromId, toId, newIndex)

1️⃣ ノード抽出  
→ `_extractNodeById()`

2️⃣ ノード挿入  
→ `_insertNodeAt()`

---
## ✏️ 編集フロー

```
openEditPanel(node)
    ↓
findNodeById(tree)
    ↓
編集UI生成
    ↓
入力変更
    ↓
_updatePropValue()
    ↓
attrs 更新
    ↓
syncView()
```

関連関数：
- openEditPanel()
- _updatePropValue()
- _applyIndividualStyle()
- _applyCustomCssWithPriority()

---
## 🎨 スタイル適用フロー

### _applyNodeStyles(el, nodeData)

```
attrs 解析
    ↓
selector ごとに分類
    ↓
CSS変数生成
    ↓
custom-css マージ
```

---
## ❌ 削除フロー

```
deleteModule(id)
    ↓
_confirmDeletion()
    ↓
_performDeleteFromTree(tree)
    ↓
syncView()
```

関連関数：
- deleteModule()
- _performDeleteFromTree()

---
## 📄 ページ管理フロー

### addPage(title)
更新対象：
- state.project.pages
- state.project.activePageId

→ syncView()

---
### setActivePage(pageId)
更新対象：
- activePageId

→ syncView()

---
## 💾 保存フロー

### saveToLocalStorage()

```
state.project → JSON.stringify → localStorage
```

---
### loadFromLocalStorage()

```
localStorage → JSON.parse → state.project
```

---
## ↩ Undoフロー（スナップショット方式）

### pushHistory(snapshot)
ツリーの状態を保存。

---
### handleUndo()

```
history.pop()
    ↓
tree 復元
    ↓
syncView()
```

---
## 🧠 責務分離（重要思想）

### WebModuleBuilder
✔ 状態管理
✔ 描画制御
✔ データ変更
✔ 永続化
✔ D&D制御

---
### WebModuleLogic
✔ DOM解析
✔ ツリー探索
✔ データ抽出

---
### WebModuleUI
✔ UI生成
✔ イベント制御
✔ 編集パネル
✔ ボトムシート

---
## 🎯 設計思想まとめ

✔ Tree = 正
✔ DOM = 投影
✔ UI = 操作層
✔ Builder = 司令塔

---
## 🚀 今後の拡張候補

安全に拡張できる領域：

✔ Redo実装
✔ ページ複製
✔ モジュールロック
✔ CSS最適化
✔ 差分描画
✔ パフォーマンス改善


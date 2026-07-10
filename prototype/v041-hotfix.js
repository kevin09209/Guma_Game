// v0.4.1 hotfix：修正點擊「開始上班」後首頁蓋住開場抽卡畫面，造成看起來卡住。
// 原因：startGame() 只關閉其他 panel，沒有關閉 screen-start。
// 這裡用最小風險覆蓋 startGame，避免重寫整個主程式。

startGame = function () {
  resetRunState();
  hidePanels();
  $("screen-start").classList.add("hidden");
  openRunDraw("start");
};

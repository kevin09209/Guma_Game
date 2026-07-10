// ============================================================
// v0.4.2 轉場演出升級
// 外掛式 patch：只包裝既有函式，不重寫主線流程。
// ============================================================

(function () {
  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => Array.from(document.querySelectorAll(selector));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function ensureTransitionLayer() {
    const stage = document.getElementById("stage");
    if (!stage || document.getElementById("transition-wipe")) return;
    const layer = document.createElement("div");
    layer.id = "transition-wipe";
    stage.appendChild(layer);
  }

  function pulseClass(el, className, duration = 700) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), duration);
  }

  function playSceneTransition() {
    const layer = document.getElementById("transition-wipe");
    pulseClass(layer, "active", 760);
  }

  function animateSceneEnter() {
    pulseClass(document.getElementById("bg"), "scene-entering", 820);
    pulseClass(document.getElementById("sprite-guma"), "scene-enter-left", 700);
    pulseClass(document.getElementById("sprite-heroine"), "scene-enter-right", 700);
  }

  function animateCardsIn() {
    qsa("#hand .card").forEach((card, index) => {
      card.style.setProperty("--card-index", index);
    });
    const overlay = document.getElementById("hand-overlay");
    pulseClass(overlay, "hand-enter", 380);
  }

  function animateDialogIn() {
    pulseClass(document.getElementById("dialog"), "dialog-enter", 420);
    pulseClass(document.getElementById("nameplate"), "nameplate-pop", 300);
  }

  function patchFunction(name, wrapper) {
    const original = window[name] || eval(`typeof ${name} !== "undefined" ? ${name} : undefined`);
    if (typeof original !== "function") return;
    window[`__v042_original_${name}`] = original;
    const patched = wrapper(original);
    window[name] = patched;
    try { eval(`${name} = patched`); } catch (_) { /* non-critical in classic script */ }
  }

  function install() {
    ensureTransitionLayer();

    patchFunction("loadScene", (original) => function patchedLoadScene(sceneId) {
      playSceneTransition();
      setTimeout(() => {
        original(sceneId);
        animateSceneEnter();
      }, 260);
    });

    patchFunction("renderLine", (original) => function patchedRenderLine(line) {
      original(line);
      animateDialogIn();
    });

    patchFunction("openHand", (original) => function patchedOpenHand() {
      setTimeout(() => {
        original();
        animateCardsIn();
      }, 180);
    });

    patchFunction("playCard", (original) => function patchedPlayCard(cardId) {
      const hand = document.getElementById("hand");
      const cards = qsa("#hand .card");
      const selected = cards.find((card) => card.textContent.includes((typeof getCard === "function" && getCard(cardId)?.name) || ""));
      cards.forEach((card) => {
        card.disabled = true;
        if (card === selected) card.classList.add("selected-card");
        else card.classList.add("dim-card");
      });
      if (hand) hand.style.pointerEvents = "none";
      setTimeout(() => {
        if (hand) hand.style.pointerEvents = "";
        original(cardId);
      }, 260);
    });

    patchFunction("showCutin", (original) => function patchedShowCutin(card, effects, bonus, onDismiss) {
      const cutin = document.getElementById("cutin");
      if (cutin) {
        cutin.classList.remove("v042-cutin-pulse");
        void cutin.offsetWidth;
        cutin.classList.add("v042-cutin-pulse");
      }
      original(card, effects, bonus, () => {
        if (cutin) cutin.classList.remove("v042-cutin-pulse");
        onDismiss();
      });
    });

    patchFunction("openRunDraw", (original) => function patchedOpenRunDraw(mode) {
      playSceneTransition();
      setTimeout(() => original(mode), 220);
    });

    patchFunction("showEnding", (original) => function patchedShowEnding() {
      playSceneTransition();
      setTimeout(() => original(), 250);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();

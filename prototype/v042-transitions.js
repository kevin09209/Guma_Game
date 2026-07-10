// ============================================================
// v0.4.2 轉場演出升級
// 調整版：只有真正換場景時才顯示場景介紹過場。
// ============================================================

(function () {
  const qsa = (selector) => Array.from(document.querySelectorAll(selector));

  function pulseClass(el, className, duration = 700) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), duration);
  }

  function getSceneForIntro(sceneId) {
    try {
      if (typeof getScene === "function") return getScene(sceneId);
    } catch (_) {}
    return null;
  }

  function ensureTransitionLayer() {
    const stage = document.getElementById("stage");
    if (!stage || document.getElementById("transition-wipe")) return;
    const layer = document.createElement("div");
    layer.id = "transition-wipe";
    stage.appendChild(layer);
  }

  function playSceneIntro(sceneId) {
    const layer = document.getElementById("transition-wipe");
    if (!layer) return;
    const scene = getSceneForIntro(sceneId);
    layer.innerHTML = `
      <div class="scene-card">
        <div class="scene-kicker">NEXT SCENE</div>
        <div class="scene-title">${scene?.title || "新的場景"}</div>
        <div class="scene-location">${scene?.location || "未知地點"}</div>
      </div>
    `;
    pulseClass(layer, "active", 1220);
  }

  function animateSceneEnter() {
    pulseClass(document.getElementById("bg"), "scene-entering", 820);
    pulseClass(document.getElementById("sprite-guma"), "scene-fade-in", 700);
    pulseClass(document.getElementById("sprite-heroine"), "scene-fade-in", 700);
  }

  function animateCardsIn() {
    qsa("#hand .card").forEach((card, index) => {
      card.style.setProperty("--card-index", index);
    });
    pulseClass(document.getElementById("hand-overlay"), "hand-enter", 340);
  }

  function animateDialogIn() {
    pulseClass(document.getElementById("dialog"), "dialog-enter", 360);
    pulseClass(document.getElementById("nameplate"), "nameplate-pop", 280);
  }

  function patchFunction(name, wrapper) {
    const original = window[name] || eval(`typeof ${name} !== "undefined" ? ${name} : undefined`);
    if (typeof original !== "function") return;
    window[`__v042_original_${name}`] = original;
    const patched = wrapper(original);
    window[name] = patched;
    try { eval(`${name} = patched`); } catch (_) { /* classic script fallback */ }
  }

  function install() {
    ensureTransitionLayer();

    patchFunction("loadScene", (original) => function patchedLoadScene(sceneId) {
      // 只有真正換場景才顯示過場介紹，不再對抽卡、結局、一般 UI 顯示 loading。
      playSceneIntro(sceneId);
      setTimeout(() => {
        original(sceneId);
        animateSceneEnter();
      }, 760);
    });

    patchFunction("renderLine", (original) => function patchedRenderLine(line) {
      original(line);
      animateDialogIn();
    });

    patchFunction("openHand", (original) => function patchedOpenHand() {
      setTimeout(() => {
        original();
        animateCardsIn();
      }, 160);
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
      }, 240);
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();

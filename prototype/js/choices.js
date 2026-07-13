/* ============================================================
   choices.js — 場景選擇題與行為記憶
   ============================================================ */

import { $ } from "./ui.js";

const hasAllFlags = (flags, required = []) => required.every((flag) => flags.has(flag));
const hasBlockedFlag = (flags, blocked = []) => blocked.some((flag) => flags.has(flag));

export function getMemoryLines(choiceData, flags) {
  return (choiceData?.memory_lines || []).filter((line) =>
    hasAllFlags(flags, line.requires_flags || []) &&
    !hasBlockedFlag(flags, line.blocks_flags || [])
  );
}

export function applyChoiceFlags(state, option) {
  for (const flag of option.set_flags || []) state.flags.add(flag);
  for (const flag of option.remove_flags || []) state.flags.delete(flag);
  state.choiceHistory.push({
    sceneId: state.sceneId,
    optionId: option.id,
    flags: [...(option.set_flags || [])],
  });
}

export function openSceneChoice({ choiceData, flags, onChoose }) {
  if (!choiceData) return false;
  $("dialog").classList.add("hidden");
  $("scene-choice-question").textContent = choiceData.question;
  const box = $("scene-choice-options");
  box.innerHTML = "";

  const available = (choiceData.options || []).filter((option) =>
    hasAllFlags(flags, option.requires_flags || []) &&
    !hasBlockedFlag(flags, option.blocks_flags || [])
  );

  available.forEach((option, index) => {
    const button = document.createElement("button");
    button.className = "scene-choice-option";
    button.textContent = `${index + 1}. ${option.label}`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      $("scene-choice-overlay").classList.add("hidden");
      onChoose(option);
    });
    box.appendChild(button);
  });

  $("scene-choice-overlay").classList.remove("hidden");
  return true;
}

export function choiceScript(option) {
  return [
    {
      type: "dialogue",
      speaker: "guma",
      emotion: option.player_emotion || "smile",
      text: option.player_line || option.label,
    },
    {
      type: "dialogue",
      speaker: "heroine",
      emotion: option.heroine_emotion || "smile",
      text: option.heroine_reply || "……",
    },
  ];
}

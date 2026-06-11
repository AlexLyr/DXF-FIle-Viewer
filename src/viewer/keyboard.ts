import { state } from "./state";
import { dom } from "./dom";
import { toggleMeasureMode } from "./measure";
import { toggleFindBar } from "./find";
import { addBookmarkFromCurrentView } from "./bookmarksUi";
import { takeScreenshot } from "./screenshot";
import { applyColorMode, refreshLayerSwatches } from "./colors";

function triggerPrint(): void {
  window.print();
}

async function triggerScreenshot(): Promise<void> {
  await takeScreenshot();
}

function clearUiFocusAndMenus(): boolean {
  let changed = false;
  if (!dom.recentMenu.classList.contains("hidden")) {
    dom.recentMenu.classList.add("hidden");
    dom.recentToggle.setAttribute("aria-expanded", "false");
    changed = true;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) {
    active.blur();
    changed = true;
  }
  return changed;
}

export function handleGlobalKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  const isInputFocused =
    target?.tagName === "INPUT" ||
    target?.tagName === "TEXTAREA" ||
    target?.isContentEditable;

  if (event.key === "Escape") {
    let handled = false;
    if (state.measureActive) {
      toggleMeasureMode(false);
      handled = true;
    }
    if (!dom.findBar.classList.contains("hidden")) {
      toggleFindBar(false);
      handled = true;
    }
    if (clearUiFocusAndMenus()) {
      handled = true;
    }
    if (handled) {
      event.preventDefault();
      return;
    }
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    toggleFindBar(true);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
    event.preventDefault();
    void triggerPrint();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void triggerScreenshot();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (isInputFocused) return;

  if (event.key.toLowerCase() === "m") {
    event.preventDefault();
    toggleMeasureMode();
    return;
  }
  if (event.key.toLowerCase() === "b") {
    event.preventDefault();
    void addBookmarkFromCurrentView();
    return;
  }
  if (event.key.toLowerCase() === "o") {
    state.colorMode = state.colorMode === "original" ? "theme" : "original";
    state.persistColorMode(state.colorMode);
    applyColorMode();
    if (state.viewer) refreshLayerSwatches(state.viewer);
    return;
  }
  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    if (event.shiftKey) {
      dom.fitAll.click();
    } else {
      dom.fit.click();
    }
    return;
  }
}

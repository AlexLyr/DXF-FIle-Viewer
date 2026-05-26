import { listBookmarks, removeBookmark, renameBookmark, saveBookmark } from "../lib/bookmarks";
import type { Bookmark } from "../lib/bookmarks";
import { state } from "./state";
import { dom } from "./dom";
import { focusOnWorld, setViewFromDxf } from "./coords";
import type { ViewerWithInternals, ViewState } from "./types";

export function getCurrentViewState(): ViewState | null {
  if (!state.viewer) return null;
  const camera = (state.viewer as ViewerWithInternals).camera;
  if (!camera) return null;
  const zoom = camera.zoom && Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  const origin = (state.viewer as ViewerWithInternals).GetOrigin?.() ?? { x: 0, y: 0 };
  return {
    centerX: camera.position.x + origin.x,
    centerY: camera.position.y + origin.y,
    width: (camera.right - camera.left) / zoom,
  };
}

export async function addBookmarkFromCurrentView(): Promise<void> {
  if (!state.viewer || !state.currentFileKey) return;
  const view = getCurrentViewState();
  if (!view) return;
  const label = window.prompt("Bookmark name");
  if (!label) return;
  await saveBookmark(state.currentFileKey, label.trim(), view.centerX, view.centerY, view.width);
  await renderBookmarks();
}

export async function renderBookmarks(): Promise<void> {
  dom.bookmarksList.innerHTML = "";
  if (!state.currentFileKey) {
    dom.bookmarksEmpty.classList.remove("hidden");
    return;
  }
  state.bookmarks = await listBookmarks(state.currentFileKey);
  dom.bookmarksEmpty.classList.toggle("hidden", state.bookmarks.length > 0);
  for (const bookmark of state.bookmarks) {
    dom.bookmarksList.append(buildBookmarkRow(bookmark));
  }
}

function buildBookmarkRow(bookmark: Bookmark): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "bookmark-row";

  const name = document.createElement("span");
  name.className = "bookmark-name";
  name.textContent = bookmark.label;
  name.title = bookmark.label;

  const rename = document.createElement("button");
  rename.className = "bookmark-action";
  rename.textContent = "✎";
  rename.addEventListener("click", async (event) => {
    event.stopPropagation();
    const next = window.prompt("Rename bookmark", bookmark.label);
    if (!next) return;
    await renameBookmark(bookmark.id, next.trim());
    await renderBookmarks();
  });

  const remove = document.createElement("button");
  remove.className = "bookmark-action";
  remove.textContent = "✕";
  remove.addEventListener("click", async (event) => {
    event.stopPropagation();
    await removeBookmark(bookmark.id);
    await renderBookmarks();
  });

  li.addEventListener("click", () => {
    if (Number.isFinite(bookmark.width) && bookmark.width > 0) {
      setViewFromDxf(bookmark.centerX, bookmark.centerY, bookmark.width);
      return;
    }
    focusOnWorld(bookmark.centerX, bookmark.centerY);
  });

  li.append(name, rename, remove);
  return li;
}

// Paste the real catalog link here once it exists; leave empty to show the "coming soon" note instead.
const CATALOG_URL = "";

document.getElementById("year").textContent = new Date().getFullYear();

const navToggle = document.getElementById("nav-toggle");
const navLinks = document.getElementById("nav-links");
navToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", isOpen);
});
navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => navLinks.classList.remove("is-open"));
});

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxStage = document.getElementById("lightbox-stage");

let zoomScale = 1, panX = 0, panY = 0;
function applyZoomTransform() {
  lightboxImg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
}
function clampPan() {
  const maxOffset = (zoomScale - 1) * 260;
  panX = Math.max(-maxOffset, Math.min(maxOffset, panX));
  panY = Math.max(-maxOffset, Math.min(maxOffset, panY));
}
function setZoom(scale) {
  zoomScale = Math.max(1, Math.min(4, scale));
  if (zoomScale === 1) { panX = 0; panY = 0; }
  clampPan();
  applyZoomTransform();
  lightboxStage.style.cursor = zoomScale > 1 ? "grab" : "zoom-in";
}

const galleryItems = [...document.querySelectorAll(".gallery-item")];
let currentGalleryIndex = 0;

function openLightboxAt(index) {
  currentGalleryIndex = (index + galleryItems.length) % galleryItems.length;
  const item = galleryItems[currentGalleryIndex];
  lightboxImg.src = item.dataset.full;
  lightboxImg.alt = item.querySelector("img").alt;
  setZoom(1);
}

galleryItems.forEach((item, index) => {
  item.addEventListener("click", () => {
    lightbox.classList.add("is-open");
    openLightboxAt(index);
  });
});
function closeLightbox() {
  lightbox.classList.remove("is-open");
  lightboxImg.src = "";
  setZoom(1);
}
document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
document.getElementById("lightbox-prev").addEventListener("click", () => openLightboxAt(currentGalleryIndex - 1));
document.getElementById("lightbox-next").addEventListener("click", () => openLightboxAt(currentGalleryIndex + 1));
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (!lightbox.classList.contains("is-open")) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowRight") openLightboxAt(currentGalleryIndex - 1);
  else if (e.key === "ArrowLeft") openLightboxAt(currentGalleryIndex + 1);
});

lightboxStage.addEventListener("wheel", (e) => {
  e.preventDefault();
  setZoom(zoomScale - e.deltaY * 0.0015 * zoomScale);
}, { passive: false });

lightboxStage.addEventListener("dblclick", () => setZoom(zoomScale > 1 ? 1 : 2.5));

// Pointer-based drag-to-pan and pinch-to-zoom (works for mouse, touch, and pen).
const activePointers = new Map();
let pinchStartDist = 0, pinchStartScale = 1, dragStart = null;

lightboxStage.addEventListener("pointerdown", (e) => {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  lightboxStage.setPointerCapture(e.pointerId);
  if (activePointers.size === 1 && zoomScale > 1) {
    dragStart = { x: e.clientX - panX, y: e.clientY - panY };
    lightboxStage.classList.add("is-dragging");
  } else if (activePointers.size === 2) {
    const pts = [...activePointers.values()];
    pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    pinchStartScale = zoomScale;
  }
});

lightboxStage.addEventListener("pointermove", (e) => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2) {
    const pts = [...activePointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (pinchStartDist > 0) setZoom(pinchStartScale * (dist / pinchStartDist));
  } else if (activePointers.size === 1 && dragStart) {
    panX = e.clientX - dragStart.x;
    panY = e.clientY - dragStart.y;
    clampPan();
    applyZoomTransform();
  }
});

function endPointer(e) {
  activePointers.delete(e.pointerId);
  dragStart = null;
  pinchStartDist = 0;
  lightboxStage.classList.remove("is-dragging");
}
lightboxStage.addEventListener("pointerup", endPointer);
lightboxStage.addEventListener("pointercancel", endPointer);
lightboxStage.addEventListener("pointerleave", endPointer);

// ===== Free-canvas designer =====
const canvasEl = document.getElementById("designer-canvas");
const emptyHint = document.getElementById("designer-empty-hint");
const draftNotice = document.getElementById("designer-draft-notice");
const undoBtn = document.getElementById("config-undo");

let zIndexCounter = 10; // shape/frame are pinned to low z-indexes (always the base tier); everything else starts above them
let activeLayerEl = null;
let frameLayerEl = null; // only one frame is ever on canvas; a new frame choice restyles it instead of adding another
let currentTextStyle = "carve";
let undoStack = [];
let isRebuilding = false; // true while restoring a saved/undo state, so those rebuild steps don't themselves get pushed to history
let draftSaveTimer = null;
const UNDO_LIMIT = 40;
const DRAFT_KEY = "amaDesignerDraft";
const frameGap = (width, height) => Math.max(20, Math.min(width, height) * 0.07);

function updateEmptyHint() {
  emptyHint.style.display = canvasEl.querySelectorAll(".layer").length ? "none" : "flex";
}

function setActiveLayer(el) {
  document.querySelectorAll(".layer.is-active").forEach((l) => l.classList.remove("is-active"));
  activeLayerEl = el || null;
  if (el) el.classList.add("is-active");
  if (activeLayerEl && activeLayerEl.dataset.type === "text") {
    const inner = activeLayerEl.querySelector(".layer-text");
    const style = inner.classList.contains("style-raised") ? "raised" : "carve";
    document.querySelectorAll("[data-text-style]").forEach((b) => b.classList.toggle("is-active", b.dataset.textStyle === style));
  }
}
canvasEl.addEventListener("pointerdown", (e) => {
  if (e.target === canvasEl) setActiveLayer(null);
});

function placeCaretAtEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function enterEditMode(inner, pushHistory) {
  if (pushHistory) pushUndo();
  inner.contentEditable = "true";
  inner.focus();
  placeCaretAtEnd(inner);
}

function attachDrag(el, resizeHandles, onResize, isBaseTier) {
  let mode = null;
  let corner = null;
  let start = null;

  function beginPointer(e, m, c) {
    pushUndo();
    mode = m;
    corner = c;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const canvasRect = canvasEl.getBoundingClientRect();
    start = {
      x: e.clientX, y: e.clientY,
      left: rect.left - canvasRect.left, top: rect.top - canvasRect.top,
      width: rect.width, height: rect.height,
    };
    setActiveLayer(el);
    if (m === "drag") el.classList.add("is-dragging");
    if (!isBaseTier) el.style.zIndex = ++zIndexCounter;
    e.preventDefault();
    e.stopPropagation();
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".layer-resize") || e.target.closest(".layer-del") || e.target.closest(".layer-edit")) return;
    if (e.target.isContentEditable) return;
    beginPointer(e, "drag", null);
  });
  resizeHandles.forEach(({ el: handle, corner: c }) => {
    handle.addEventListener("pointerdown", (e) => beginPointer(e, "resize", c));
  });

  el.addEventListener("pointermove", (e) => {
    if (!mode || !start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const minSize = 24;
    if (mode === "drag") {
      const newLeft = Math.max(0, Math.min(canvasEl.clientWidth - start.width, start.left + dx));
      const newTop = Math.max(0, Math.min(canvasEl.clientHeight - start.height, start.top + dy));
      el.style.left = newLeft + "px";
      el.style.top = newTop + "px";
    } else if (mode === "resize") {
      let newWidth = start.width, newHeight = start.height, newLeft = start.left, newTop = start.top;
      if (corner === "se") {
        newWidth = Math.max(minSize, start.width + dx);
        newHeight = Math.max(minSize, start.height + dy);
      } else if (corner === "sw") {
        newWidth = Math.max(minSize, start.width - dx);
        newHeight = Math.max(minSize, start.height + dy);
        newLeft = start.left + (start.width - newWidth);
      } else if (corner === "ne") {
        newWidth = Math.max(minSize, start.width + dx);
        newHeight = Math.max(minSize, start.height - dy);
        newTop = start.top + (start.height - newHeight);
      } else if (corner === "nw") {
        newWidth = Math.max(minSize, start.width - dx);
        newHeight = Math.max(minSize, start.height - dy);
        newLeft = start.left + (start.width - newWidth);
        newTop = start.top + (start.height - newHeight);
      }
      if (newLeft < 0) {
        newWidth += newLeft;
        newLeft = 0;
      }
      if (newTop < 0) {
        newHeight += newTop;
        newTop = 0;
      }
      newWidth = Math.max(minSize, Math.min(newWidth, canvasEl.clientWidth - newLeft));
      newHeight = Math.max(minSize, Math.min(newHeight, canvasEl.clientHeight - newTop));
      el.style.width = newWidth + "px";
      el.style.height = newHeight + "px";
      el.style.left = newLeft + "px";
      el.style.top = newTop + "px";
      if (onResize) onResize(newWidth, newHeight);
    }
  });

  function endDrag(e) {
    if (!mode) return;
    try { el.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    mode = null; start = null; corner = null;
    el.classList.remove("is-dragging");
    scheduleDraftSave();
  }
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
}

function createLayerShell(type, extraClass, innerEl, onResize, tierOrEditable) {
  const isBaseTier = tierOrEditable === "shape" || tierOrEditable === "frame";
  const el = document.createElement("div");
  el.className = "layer" + (extraClass ? " " + extraClass : "");
  el.dataset.type = type;
  el.appendChild(innerEl);

  if (type === "text") {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "layer-edit";
    editBtn.textContent = "✎";
    editBtn.setAttribute("aria-label", "עריכת כיתוב");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setActiveLayer(el);
      enterEditMode(innerEl, true);
    });
    el.appendChild(editBtn);
  }

  const del = document.createElement("button");
  del.type = "button";
  del.className = "layer-del";
  del.textContent = "×";
  del.setAttribute("aria-label", "הסרה");
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    pushUndo();
    if (el === frameLayerEl) frameLayerEl = null;
    if (el === activeLayerEl) activeLayerEl = null;
    el.remove();
    updateEmptyHint();
    scheduleDraftSave();
  });
  el.appendChild(del);

  const resizeHandles = ["nw", "ne", "sw", "se"].map((corner) => {
    const handle = document.createElement("div");
    handle.className = "layer-resize " + corner;
    el.appendChild(handle);
    return { el: handle, corner };
  });

  attachDrag(el, resizeHandles, onResize, isBaseTier);

  if (tierOrEditable === "shape") {
    canvasEl.insertBefore(el, canvasEl.firstChild);
    el.style.zIndex = 1;
  } else if (tierOrEditable === "frame") {
    const shapeEl = canvasEl.querySelector('.layer[data-type="shape"]');
    canvasEl.insertBefore(el, shapeEl ? shapeEl.nextSibling : canvasEl.firstChild);
    el.style.zIndex = 2;
  } else {
    canvasEl.appendChild(el);
    el.style.zIndex = ++zIndexCounter;
  }
  updateEmptyHint();
  return el;
}

function addShape(kind, geo) {
  if (!isRebuilding) pushUndo();
  const inner = document.createElement("div");
  inner.className = "layer-shape";
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  let width, height, left, top;
  if (geo) {
    ({ width, height, left, top } = geo);
  } else if (kind === "square") {
    width = Math.min(w, h) * 0.55; height = width;
    left = (w - width) / 2; top = (h - height) / 2;
  } else {
    width = w * 0.75; height = h * 0.4;
    left = (w - width) / 2; top = (h - height) / 2;
  }
  const el = createLayerShell("shape", "", inner, null, "shape");
  el.dataset.shapeKind = kind;
  el.style.width = width + "px";
  el.style.height = height + "px";
  el.style.left = left + "px";
  el.style.top = top + "px";
  if (!isRebuilding) scheduleDraftSave();
  return el;
}

document.querySelectorAll("[data-text-style]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const style = btn.dataset.textStyle;
    currentTextStyle = style;
    document.querySelectorAll("[data-text-style]").forEach((b) => b.classList.toggle("is-active", b === btn));
    if (activeLayerEl && activeLayerEl.dataset.type === "text") {
      pushUndo();
      const inner = activeLayerEl.querySelector(".layer-text");
      inner.classList.remove("style-carve", "style-raised");
      inner.classList.add("style-" + style);
      scheduleDraftSave();
    }
  });
});

function addText(text, style, geo) {
  if (!isRebuilding) pushUndo();
  const inner = document.createElement("div");
  inner.className = "layer-text style-" + (style || currentTextStyle);
  inner.textContent = text || "";
  inner.contentEditable = "false";
  inner.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    enterEditMode(inner, true);
  });
  inner.addEventListener("blur", () => {
    inner.contentEditable = "false";
    scheduleDraftSave();
  });

  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  let width, height, left, top;
  if (geo) {
    ({ width, height, left, top } = geo);
  } else {
    width = Math.min(w * 0.5, 260); height = 64;
    left = (w - width) / 2; top = (h - height) / 2;
  }

  const el = createLayerShell("text", "", inner, (nw, nh) => {
    inner.style.fontSize = Math.max(12, nh * 0.42) + "px";
  });
  el.style.width = width + "px";
  el.style.height = height + "px";
  el.style.left = left + "px";
  el.style.top = top + "px";

  if (!geo && !isRebuilding) {
    setActiveLayer(el);
    enterEditMode(inner, false);
  }
  if (!isRebuilding) scheduleDraftSave();
  return el;
}

function addPainting(src, geo) {
  if (!isRebuilding) pushUndo();
  const inner = document.createElement("div");
  inner.className = "layer-painting";
  const img = document.createElement("img");
  img.src = src;
  img.alt = "ציור";
  inner.appendChild(img);

  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  let width, height, left, top;
  if (geo) {
    ({ width, height, left, top } = geo);
  } else {
    width = w * 0.42; height = width * 0.5;
    left = (w - width) / 2; top = (h - height) / 2;
  }

  const el = createLayerShell("painting", "", inner);
  el.style.width = width + "px";
  el.style.height = height + "px";
  el.style.left = left + "px";
  el.style.top = top + "px";

  if (!geo) {
    img.addEventListener("load", () => {
      const ratio = img.naturalHeight / img.naturalWidth;
      el.style.height = (width * ratio) + "px";
    });
  }
  if (!isRebuilding) scheduleDraftSave();
  return el;
}

function createFrameLayer(kind, geo) {
  const inner = document.createElement("div");
  inner.className = "layer-frame frame-" + kind;
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  let width, height, left, top;
  if (geo) {
    ({ width, height, left, top } = geo);
  } else {
    const shapeEl = canvasEl.querySelector('.layer[data-type="shape"]');
    if (shapeEl) {
      const sw = parseFloat(shapeEl.style.width) || w * 0.55;
      const sh = parseFloat(shapeEl.style.height) || h * 0.4;
      const sl = parseFloat(shapeEl.style.left) || 0;
      const st = parseFloat(shapeEl.style.top) || 0;
      const gap = frameGap(sw, sh); // Visible separation, including room for the cornice border.
      width = sw + gap * 2; height = sh + gap * 2;
      left = sl - gap; top = st - gap;
    } else {
      width = w * 0.6; height = h * 0.5;
      left = (w - width) / 2; top = (h - height) / 2;
    }
  }
  const el = createLayerShell("frame", "", inner, null, "frame");
  el.style.zIndex = kind === "glass" ? 900 : 2;
  el.style.width = width + "px";
  el.style.height = height + "px";
  el.style.left = left + "px";
  el.style.top = top + "px";
  return el;
}

function addFrame(kind, geo, forceNew) {
  if (!isRebuilding) pushUndo();
  if (frameLayerEl && !forceNew) {
    frameLayerEl.querySelector(".layer-frame").className = "layer-frame frame-" + kind;
    frameLayerEl.style.zIndex = kind === "glass" ? 900 : 2;
    ensureFrameSpacing();
  } else {
    const el = createFrameLayer(kind, geo);
    if (!frameLayerEl) frameLayerEl = el;
  }
  if (!isRebuilding) scheduleDraftSave();
}

function ensureFrameSpacing() {
  const shape = canvasEl.querySelector('.layer[data-type="shape"]');
  if (!shape || !frameLayerEl) return;
  const x = parseFloat(shape.style.left), y = parseFloat(shape.style.top);
  const w = parseFloat(shape.style.width), h = parseFloat(shape.style.height);
  const fx = parseFloat(frameLayerEl.style.left), fy = parseFloat(frameLayerEl.style.top);
  const right = fx + parseFloat(frameLayerEl.style.width);
  const bottom = fy + parseFloat(frameLayerEl.style.height);
  // Widen close-fitting frames while retaining larger gaps and independently positioned frames.
  if (fx > x || fy > y || right < x + w || bottom < y + h) return;
  const gap = frameGap(w, h);
  const left = Math.min(fx, x - gap), top = Math.min(fy, y - gap);
  Object.assign(frameLayerEl.style, {
    left: left + 'px', top: top + 'px',
    width: (Math.max(right, x + w + gap) - left) + 'px',
    height: (Math.max(bottom, y + h + gap) - top) + 'px'
  });
}

document.querySelectorAll("[data-add]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const kind = btn.dataset.add;
    if (kind === "shape-square") addShape("square");
    else if (kind === "shape-rect") addShape("rect");
    else if (kind === "frame-carve") addFrame("carve");
    else if (kind === "frame-led") addFrame("led");
    else if (kind === "frame-cornice") addFrame("cornice");
  });
});

document.getElementById("designer-add-text").addEventListener("click", () => {
  addText("", currentTextStyle);
});

document.querySelectorAll(".painting-opt").forEach((btn) => {
  btn.addEventListener("click", () => addPainting(btn.dataset.painting));
});

document.getElementById("designer-upload").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => addPainting(reader.result);
  reader.readAsDataURL(file);
  e.target.value = "";
});

function clearCanvasLayers() {
  canvasEl.querySelectorAll(".layer").forEach((l) => l.remove());
  frameLayerEl = null;
  activeLayerEl = null;
  updateEmptyHint();
}

document.getElementById("designer-clear").addEventListener("click", () => {
  if (!canvasEl.querySelector(".layer")) return;
  pushUndo();
  clearCanvasLayers();
  scheduleDraftSave();
});

// ---- Serialize / rebuild (used by undo and by the saved-draft restore) ----
function serializeLayer(el) {
  const type = el.dataset.type;
  const data = {
    type,
    left: parseFloat(el.style.left) || 0,
    top: parseFloat(el.style.top) || 0,
    width: parseFloat(el.style.width) || 0,
    height: parseFloat(el.style.height) || 0,
  };
  if (type === "shape") {
    data.kind = el.dataset.shapeKind || "square";
  } else if (type === "text") {
    const inner = el.querySelector(".layer-text");
    data.text = inner.textContent;
    data.style = inner.classList.contains("style-raised") ? "raised" : "carve";
  } else if (type === "painting") {
    data.src = el.querySelector("img").src;
  } else if (type === "frame") {
    data.kind = el.querySelector(".layer-frame").className.match(/frame-(\w+)/)[1];
  }
  return data;
}

function serializeCanvas() {
  return [...canvasEl.querySelectorAll(".layer")].map(serializeLayer);
}

function rebuildCanvas(state) {
  isRebuilding = true;
  clearCanvasLayers();
  (state || []).forEach((d) => {
    const geo = { left: d.left, top: d.top, width: d.width, height: d.height };
    if (d.type === "shape") addShape(d.kind, geo);
    else if (d.type === "text") addText(d.text, d.style, geo);
    else if (d.type === "painting") addPainting(d.src, geo);
    else if (d.type === "frame") addFrame(d.kind, geo, true);
  });
  isRebuilding = false;
  updateEmptyHint();
}

// ---- Undo ----
function pushUndo() {
  if (isRebuilding) return;
  undoStack.push(serializeCanvas());
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  undoBtn.disabled = false;
}
function undo() {
  if (!undoStack.length) return;
  const prev = undoStack.pop();
  rebuildCanvas(prev);
  undoBtn.disabled = undoStack.length === 0;
  scheduleDraftSave();
}
undoBtn.disabled = true;
undoBtn.addEventListener("click", undo);

// ---- Draft autosave / restore ----
function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    try {
      const state = serializeCanvas();
      if (state.length) localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
      else localStorage.removeItem(DRAFT_KEY);
    } catch (err) { /* storage unavailable (private mode / quota) - safe to ignore */ }
  }, 500);
}

document.getElementById("designer-draft-discard").addEventListener("click", () => {
  if (canvasEl.querySelector(".layer")) pushUndo();
  clearCanvasLayers();
  try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ }
  draftNotice.hidden = true;
});

(function loadDraftOnStart() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (err) { saved = null; }
  if (saved && Array.isArray(saved) && saved.length) {
    rebuildCanvas(saved);
    draftNotice.hidden = false;
  }
})();

async function exportDesignCanvas() {
  const scale = 1200 / canvasEl.clientWidth;
  const outW = Math.round(canvasEl.clientWidth * scale);
  const outH = Math.round(canvasEl.clientHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);

  const layers = [...canvasEl.querySelectorAll(".layer")].sort((a, b) => {
    const aGlass = a.dataset.type === "frame" && a.querySelector(".frame-glass");
    const bGlass = b.dataset.type === "frame" && b.querySelector(".frame-glass");
    return Number(aGlass) - Number(bGlass);
  });
  for (const layer of layers) {
    const x = parseFloat(layer.style.left) * scale;
    const y = parseFloat(layer.style.top) * scale;
    const w = parseFloat(layer.style.width) * scale;
    const h = parseFloat(layer.style.height) * scale;
    const type = layer.dataset.type;

    if (type === "shape") {
      ctx.fillStyle = "#9c968a";
      ctx.fillRect(x, y, w, h);
    } else if (type === "text") {
      const textEl = layer.querySelector(".layer-text");
      const fontSize = parseFloat(getComputedStyle(textEl).fontSize) * scale;
      const isRaised = textEl.classList.contains("style-raised");
      ctx.font = `700 ${fontSize}px "David Libre", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = textEl.textContent.split("\n");
      const lineHeight = fontSize * 1.15;
      const startY = y + h / 2 - (lineHeight * (lines.length - 1)) / 2;
      if (isRaised) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 3 * scale;
        ctx.shadowOffsetY = 2 * scale;
        ctx.fillStyle = "#ffffff";
        lines.forEach((line, i) => ctx.fillText(line, x + w / 2, startY + i * lineHeight));
        ctx.restore();
      } else {
        ctx.fillStyle = "#9c968a";
        lines.forEach((line, i) => ctx.fillText(line, x + w / 2, startY + i * lineHeight));
      }
    } else if (type === "painting") {
      const img = layer.querySelector("img");
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x, y, w, h);
    } else if (type === "frame") {
      const kind = layer.querySelector(".layer-frame").className.match(/frame-(\w+)/)[1];
      const lineWidth = (kind === "cornice" ? 10 : kind === "led" ? 3 : 4) * scale;
      const inset = lineWidth / 2;
      if (kind === "glass") {
        ctx.save();
        ctx.fillStyle = "rgba(220, 235, 238, 0.10)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(150, 160, 164, 0.72)";
        ctx.lineWidth = 2 * scale;
        ctx.strokeRect(x + scale, y + scale, w - 2 * scale, h - 2 * scale);
        const screwRadius = 5 * scale;
        [[x + 12 * scale, y + 12 * scale], [x + w - 12 * scale, y + 12 * scale], [x + 12 * scale, y + h - 12 * scale], [x + w - 12 * scale, y + h - 12 * scale]].forEach(([sx, sy]) => {
          const gradient = ctx.createRadialGradient(sx - screwRadius * .3, sy - screwRadius * .3, scale, sx, sy, screwRadius);
          gradient.addColorStop(0, "#f7f7f5"); gradient.addColorStop(.55, "#9b9b96"); gradient.addColorStop(1, "#454541");
          ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(sx, sy, screwRadius, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      } else if (kind === "led") {
        ctx.save();
        ctx.shadowColor = "rgba(255,214,140,0.85)";
        ctx.shadowBlur = 14 * scale;
        ctx.strokeStyle = "#f6dfa0";
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(x + inset, y + inset, w - lineWidth, h - lineWidth);
        ctx.restore();
      } else if (kind === "cornice") {
        ctx.strokeStyle = "#f5f2ea";
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(x + inset, y + inset, w - lineWidth, h - lineWidth);
      } else {
        ctx.strokeStyle = "#9c968a";
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(x + inset, y + inset, w - lineWidth, h - lineWidth);
      }
    }
  }
  return canvas;
}

document.getElementById("config-save").addEventListener("click", async () => {
  if (!canvasEl.querySelector(".layer")) {
    alert("הוסיפו לפחות רכיב אחד לעיצוב לפני השמירה.");
    return;
  }
  try {
    const canvas = await exportDesignCanvas();
    canvas.toBlob((blob) => {
      if (!blob) throw new Error("empty blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "חריטה-אמנותית-עיצוב-אישי.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  } catch (err) {
    alert("שמירת התמונה לא זמינה בעת פתיחת הקובץ ישירות מהמחשב. פתחו את האתר המקוון כדי לשמור את ההדמיה, או צלמו מסך.");
  }
});

document.getElementById("config-send").addEventListener("click", () => {
  if (!canvasEl.querySelector(".layer")) {
    alert("הוסיפו לפחות רכיב אחד לעיצוב לפני השליחה.");
    return;
  }
  const proceed = confirm(
    'שימו לב: יש להוריד קודם את תמונת העיצוב (כפתור "הורדת ההדמיה"), ולצרף אותה ידנית להודעת המייל שתיפתח כעת — התמונה אינה מצורפת אוטומטית.\n\nלפתוח את המייל?'
  );
  if (!proceed) return;
  const subject = encodeURIComponent("בקשה להצעת מחיר - חריטה אמנותית בקיר");
  const body = encodeURIComponent(
    "שלום מרדכי,\n\nעיצבתי עיצוב אישי באתר ואשמח לקבל הצעת מחיר.\n\n" +
    "יש לצרף כאן ידנית את קובץ התמונה שהורדתי מהאתר (ההורדה לא מצורפת אוטומטית להודעה).\n\nתודה!"
  );
  window.location.href = `mailto:mlib161461@gmail.com?subject=${subject}&body=${body}`;
});

const catalogBtn = document.getElementById("catalog-btn");
const catalogNote = document.getElementById("catalog-note");
catalogBtn.addEventListener("click", (e) => {
  if (!CATALOG_URL) {
    e.preventDefault();
    catalogNote.classList.add("is-visible");
  } else {
    catalogBtn.href = CATALOG_URL;
    catalogBtn.target = "_blank";
    catalogBtn.rel = "noopener";
  }
});

// Guided choices use the existing layers, history and draft format.

canvasEl.classList.add('advanced-open');
document.querySelectorAll('.designer-category').forEach(category => {
  category.addEventListener('toggle', () => {
    if (category.open) document.querySelectorAll('.designer-category').forEach(other => {
      if (other !== category) other.open = false;
    });
  });
});
function guidedChange(change) {
  pushUndo();
  isRebuilding = true;
  try { change(); } finally { isRebuilding = false; }
  updateEmptyHint();
  scheduleDraftSave();
  syncGuidedChoices();
}
function setGuidedModel(model) {
  const src = `images/paintings/${model}-painting.jpg`;
  const existing = canvasEl.querySelector('.layer[data-type="painting"]');
  if (existing) {
    const img = existing.querySelector('img');
    img.onload = () => fitGuidedPainting(existing, img);
    img.src = src;
  } else {
    const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
    const layer = addPainting(src, { left: w * .25, top: h * .24, width: w * .5, height: h * .4 });
    const img = layer.querySelector('img');
    img.onload = () => fitGuidedPainting(layer, img);
    if (img.complete && img.naturalWidth) fitGuidedPainting(layer, img);
  }
}
function fitGuidedPainting(layer, img) {
  if (!layer.isConnected || !img.naturalWidth) return;
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  const ratio = img.naturalWidth / img.naturalHeight;
  const width = Math.min(w * .5, h * .4 * ratio);
  const height = width / ratio;
  Object.assign(layer.style, { width: width + 'px', height: height + 'px', left: (w - width) / 2 + 'px', top: h * .24 + (h * .4 - height) / 2 + 'px' });
  scheduleDraftSave();
}
function syncGuidedChoices() {
  const shape = canvasEl.querySelector('.layer[data-type="shape"]');
  document.querySelectorAll('[data-shape]').forEach(button => button.setAttribute('aria-pressed', String(Boolean(shape && shape.dataset.shapeKind === button.dataset.shape))));
  const painting = canvasEl.querySelector('.layer[data-type="painting"] img');
  document.querySelectorAll('[data-model]').forEach(button => {
    button.setAttribute('aria-pressed', String(Boolean(painting && painting.src.endsWith(`/${button.dataset.model}-painting.jpg`))));
  });
  const frame = canvasEl.querySelector('.layer-frame');
  document.querySelectorAll('[data-frame]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.frame === 'none' ? !frame : Boolean(frame && frame.classList.contains(`frame-${button.dataset.frame}`))));
  });
}
document.querySelectorAll('[data-model]').forEach(button => button.addEventListener('click', () => guidedChange(() => setGuidedModel(button.dataset.model))));
document.querySelectorAll('[data-frame]').forEach(button => button.addEventListener('click', () => guidedChange(() => {
  if (button.dataset.frame === 'none') {
    canvasEl.querySelectorAll('.layer[data-type="frame"]').forEach(layer => layer.remove());
    frameLayerEl = null;
  } else addFrame(button.dataset.frame);
})));
document.querySelectorAll('[data-shape]').forEach(button => button.addEventListener('click', () => guidedChange(() => {
  const oldShape = canvasEl.querySelector('.layer[data-type="shape"]');
  if (oldShape) oldShape.remove();
  addShape(button.dataset.shape);
  if (frameLayerEl) {
    const kind = frameLayerEl.querySelector('.layer-frame').className.match(/frame-(\w+)/)[1];
    frameLayerEl.remove();
    frameLayerEl = null;
    addFrame(kind);
  }
})));
new MutationObserver(syncGuidedChoices).observe(canvasEl, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'class'] });
ensureFrameSpacing();

// Reveal gallery works gently as they enter the viewport.
const galleryGrid = document.querySelector('.featured-gallery .gallery-grid');
if (galleryGrid) {
  const galleryItems = [...galleryGrid.querySelectorAll('.gallery-item')];
  galleryItems.forEach((item, index) => {
    item.style.setProperty('--gallery-delay', `${(index % 3) * 90}ms`);
  });
  galleryGrid.classList.add('gallery-animate-ready');
  if ('IntersectionObserver' in window) {
    const galleryObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14 });
    galleryItems.forEach((item) => galleryObserver.observe(item));
  } else {
    galleryItems.forEach((item) => item.classList.add('is-visible'));
  }
}
syncGuidedChoices();

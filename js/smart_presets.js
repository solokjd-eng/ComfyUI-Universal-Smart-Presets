/**
 * ComfyUI Universal Smart Presets
 * - Global Node Presets (Single Node Across Workflows)
 * - 2-Tier Roof Badges (Positioned cleanly ABOVE node top border at Y: -48px)
 *    1) [🌐 N] Global Presets Badge (Purple with exact count)
 *    2) [🌟 N] Master Hub Link Badge (Gold with exact count of linked master presets)
 * - Interactive Hover Tooltip & Direct Modal Launch on Click
 * - Math-Exact Screen-Space Hit Testing & Window-level Event Capture
 * - Non-blocking Glassmorphic Toast Notifications
 */

import { app } from "../../scripts/app.js";
import { initModal, showPresetModal, closeModal, showToast } from "./presets_modal.js";
import { hubPresetsStore } from "./hub_node.js";
import { showHubManageModal } from "./hub_modal.js";

const STORAGE_KEY = "ComfyUI_Universal_Smart_Presets_v1";

export let presetsStore = {};

function loadStylesheet() {
    const cssId = "usp-presets-stylesheet";
    let link = document.getElementById(cssId);
    if (!link) {
        link = document.createElement("link");
        link.id = cssId;
        link.rel = "stylesheet";
        link.type = "text/css";
        document.head.appendChild(link);
    }
    link.href = new URL("./presets_modal.css?v=" + Date.now(), import.meta.url).href;
}

export function loadPresetsFromStorage() {
    try {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
            presetsStore = JSON.parse(local);
        }
    } catch (e) {
        console.warn("[Smart Presets] Failed to read localStorage:", e);
    }

    fetch("/universal_presets/load")
        .then((res) => res.json())
        .then((data) => {
            if (data && data.success && data.presets && Object.keys(data.presets).length > 0) {
                presetsStore = { ...presetsStore, ...data.presets };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(presetsStore));
                app.graph?.setDirtyCanvas(true, true);
            }
        })
        .catch(() => {});
}

export function savePresetsToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(presetsStore));
    } catch (e) {
        console.warn("[Smart Presets] Failed to save to localStorage:", e);
    }

    fetch("/universal_presets/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presets: presetsStore }),
    }).catch(() => {});
}

export function getNodeType(node) {
    return node.comfyClass || node.type || "UnknownNode";
}

export function getPresetsForNode(node) {
    const type = getNodeType(node);
    return presetsStore[type] || {};
}

// --- Node Snapshot & Restore Engine ---

export function extractNodeState(node) {
    const nodeType = getNodeType(node);
    const isRgthreeLora = nodeType.includes("Power Lora Loader") || (node.widgets && node.widgets.some(w => w.name && w.name.includes("lora")));

    const state = {
        nodeType: nodeType,
        timestamp: Date.now(),
        widgets: {},
        _isLoraStack: false,
    };

    if (node.widgets && Array.isArray(node.widgets)) {
        for (const w of node.widgets) {
            if (!w.name) continue;
            if (typeof w.value === "object" && w.value !== null) {
                try {
                    state.widgets[w.name] = JSON.parse(JSON.stringify(w.value));
                } catch (e) {
                    state.widgets[w.name] = w.value;
                }
            } else {
                state.widgets[w.name] = w.value;
            }
        }
    }

    if (isRgthreeLora) {
        state._isLoraStack = true;
        state.loras = [];

        for (const w of node.widgets || []) {
            if (w.value && typeof w.value === "object" && ("lora" in w.value || "on" in w.value)) {
                state.loras.push({
                    lora: w.value.lora || "",
                    strength: w.value.strength ?? 1.0,
                    strengthTwo: w.value.strengthTwo ?? w.value.strength ?? 1.0,
                    on: w.value.on ?? true,
                });
            } else if (w.name && w.name.startsWith("lora_") && typeof w.value === "string") {
                state.loras.push({
                    lora: w.value,
                    strength: 1.0,
                    on: true,
                });
            }
        }

        if (node.widgets_values) {
            state.widgets_values = JSON.parse(JSON.stringify(node.widgets_values));
        }
    }

    return state;
}

export function applyNodeState(node, presetData) {
    if (!presetData) return;

    const disabledWidgets = Array.isArray(presetData._disabledWidgets) ? presetData._disabledWidgets : [];

    if (presetData.widgets && node.widgets) {
        for (const w of node.widgets) {
            if (w.name && presetData.widgets[w.name] !== undefined) {
                // If this widget parameter is turned OFF in preset, preserve existing canvas node value!
                if (disabledWidgets.includes(w.name)) {
                    continue;
                }
                w.value = presetData.widgets[w.name];
                if (typeof w.callback === "function") {
                    try {
                        w.callback(w.value);
                    } catch (e) {}
                }
            }
        }
    }

    if (presetData._isLoraStack) {
        if (presetData.widgets_values && Array.isArray(presetData.widgets_values)) {
            if (node.widgets_values) {
                node.widgets_values = JSON.parse(JSON.stringify(presetData.widgets_values));
            }
            if (typeof node.configure === "function") {
                try {
                    node.configure({ widgets_values: presetData.widgets_values });
                } catch (e) {}
            }
        }

        if (Array.isArray(presetData.loras) && presetData.loras.length > 0) {
            if (typeof node.addLora === "function" && typeof node.removeLora === "function") {
                const currentRows = (node.widgets || []).filter(w => w.name && w.name.includes("lora")).length;
                const targetRows = presetData.loras.length;

                for (let i = currentRows; i < targetRows; i++) {
                    node.addLora();
                }
            }

            let loraIdx = 0;
            for (const w of node.widgets || []) {
                if (loraIdx >= presetData.loras.length) break;
                const item = presetData.loras[loraIdx];

                if (w.value && typeof w.value === "object") {
                    w.value.lora = item.lora;
                    w.value.strength = item.strength;
                    if ("strengthTwo" in w.value) w.value.strengthTwo = item.strengthTwo ?? item.strength;
                    if ("on" in w.value) w.value.on = item.on ?? true;
                    if (typeof w.callback === "function") w.callback(w.value);
                    loraIdx++;
                } else if (w.name && w.name.includes("lora") && typeof w.value === "string") {
                    w.value = item.lora;
                    if (typeof w.callback === "function") w.callback(w.value);
                    loraIdx++;
                }
            }
        }
    }

    if (typeof node.onPropertyChanged === "function") {
        try {
            node.onPropertyChanged();
        } catch (e) {}
    }
    app.graph?.setDirtyCanvas(true, true);
}

// --- 🌟 2-Tier Roof Badges Bounds & Drawing ---

export function getBadgesForNode(node) {
    if (!node || !node.pos || !node.size || node.type === "UniversalPresetHub" || node.comfyClass === "UniversalPresetHub") {
        return null;
    }

    const presets = getPresetsForNode(node);
    const globalCount = Object.keys(presets).length;

    // Calculate how many Master Presets in Hub contain this node
    const hubCount = Object.values(hubPresetsStore || {}).filter(
        (p) => (p.targets || []).some((t) => t.id === node.id || (t.nodeType && t.nodeType === (node.comfyClass || node.type)))
    ).length;

    if (globalCount === 0 && hubCount === 0) return null;

    const titleH = (typeof LiteGraph !== "undefined" && LiteGraph.NODE_TITLE_HEIGHT) ? LiteGraph.NODE_TITLE_HEIGHT : 30;
    const tabY = -titleH - 18; // -48px
    const tabHeight = 18;
    let curX = 10;

    const result = {};

    if (globalCount > 0) {
        const w = 46;
        result.global = { x: curX, y: tabY, w: w, h: tabHeight, count: globalCount };
        curX += w + 6;
    }

    if (hubCount > 0) {
        const w = 46;
        result.hub = { x: curX, y: tabY, w: w, h: tabHeight, count: hubCount };
    }

    return result;
}

function drawRoofBadges(node, ctx) {
    const badges = getBadgesForNode(node);
    if (!badges) return;

    ctx.save();

    // 1. Global Badge (Purple)
    if (badges.global) {
        const b = badges.global;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(b.x, b.y, b.w, b.h, 5);
        } else {
            ctx.rect(b.x, b.y, b.w, b.h);
        }

        const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        grad.addColorStop(0, "#6366f1");
        grad.addColorStop(1, "#a855f7");
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`🌐 ${b.count}`, b.x + b.w / 2, b.y + b.h / 2);
    }

    // 2. Hub Badge (Gold with Exact Count)
    if (badges.hub) {
        const b = badges.hub;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(b.x, b.y, b.w, b.h, 5);
        } else {
            ctx.rect(b.x, b.y, b.w, b.h);
        }

        const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        grad.addColorStop(0, "#d97706");
        grad.addColorStop(1, "#f59e0b");
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`🌟 ${b.count}`, b.x + b.w / 2, b.y + b.h / 2);
    }

    ctx.restore();
}

// --- 💬 Roof Badge Floating Tooltip & Hit Testing ---

let tooltipElement = null;

function createTooltipDOM() {
    const existing = document.getElementById("usp-badge-tooltip");
    if (existing) {
        existing.remove();
    }
    const div = document.createElement("div");
    div.id = "usp-badge-tooltip";
    div.className = "usp-badge-tooltip";
    document.body.appendChild(div);
    tooltipElement = div;
}

function showTooltip(screenX, screenY, title, desc, action, colorClass) {
    if (!tooltipElement || !document.getElementById("usp-badge-tooltip")) createTooltipDOM();
    tooltipElement.innerHTML = `
        <div class="usp-tooltip-title ${colorClass}">${title}</div>
        <div class="usp-tooltip-desc">${desc}</div>
        <div class="usp-tooltip-action">${action}</div>
    `;
    tooltipElement.style.left = `${screenX}px`;
    tooltipElement.style.top = `${screenY}px`;
    tooltipElement.classList.add("active");
}

function hideTooltip() {
    if (tooltipElement) {
        tooltipElement.classList.remove("active");
    }
}

/**
 * Accurate search for roof badge under screen mouse position
 */
function findBadgeAtScreenPos(clientX, clientY) {
    const canvas = app.canvas;
    const graph = app.graph;
    if (!canvas || !graph || !graph._nodes) return null;

    const canvasEl = canvas.canvas || document.querySelector("canvas");
    if (!canvasEl) return null;

    const rect = canvasEl.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return null;
    }

    const scale = Number(canvas.ds?.scale || 1);
    const offset = canvas.ds?.offset || [0, 0];

    for (const n of graph._nodes) {
        const badges = getBadgesForNode(n);
        if (!badges) continue;

        // Check global badge
        if (badges.global) {
            const b = badges.global;
            const sx = (n.pos[0] + b.x + offset[0]) * scale + rect.left;
            const sy = (n.pos[1] + b.y + offset[1]) * scale + rect.top;
            const sw = b.w * scale;
            const sh = b.h * scale;

            if (clientX >= sx - 6 && clientX <= sx + sw + 6 && clientY >= sy - 6 && clientY <= sy + sh + 6) {
                return {
                    type: "global",
                    node: n,
                    count: b.count,
                };
            }
        }

        // Check hub badge
        if (badges.hub) {
            const b = badges.hub;
            const sx = (n.pos[0] + b.x + offset[0]) * scale + rect.left;
            const sy = (n.pos[1] + b.y + offset[1]) * scale + rect.top;
            const sw = b.w * scale;
            const sh = b.h * scale;

            if (clientX >= sx - 6 && clientX <= sx + sw + 6 && clientY >= sy - 6 && clientY <= sy + sh + 6) {
                return {
                    type: "hub",
                    node: n,
                    count: b.count,
                };
            }
        }
    }

    return null;
}

function handleCanvasPointerMove(e) {
    const badgeInfo = findBadgeAtScreenPos(e.clientX, e.clientY);
    if (badgeInfo) {
        if (app.canvas?.canvas) {
            app.canvas.canvas.style.cursor = "pointer";
        }
        if (badgeInfo.type === "global") {
            const title = badgeInfo.node.title || badgeInfo.node.type;
            showTooltip(
                e.clientX + 14,
                e.clientY + 14,
                `🌐 글로벌 프리셋 (${badgeInfo.count}개)`,
                `<b>${escapeHtml(title)}</b> 노드에 저장된 전역 프리셋입니다.`,
                `👉 클릭하여 글로벌 프리셋 관리자 열기`,
                "purple"
            );
        } else {
            const title = badgeInfo.node.title || badgeInfo.node.type;
            showTooltip(
                e.clientX + 14,
                e.clientY + 14,
                `🌟 마스터 프리셋 연동 (${badgeInfo.count}개)`,
                `<b>${escapeHtml(title)}</b> 노드가 포함된 ${badgeInfo.count}개의 마스터 프리셋이 허브에 등록되어 있습니다.`,
                `👉 클릭하여 마스터 프리셋 관리자 열기`,
                "gold"
            );
        }
    } else {
        hideTooltip();
        if (app.canvas?.canvas && app.canvas.canvas.style.cursor === "pointer") {
            app.canvas.canvas.style.cursor = "default";
        }
    }
}

function handleCanvasPointerDown(e) {
    if (e.button !== 0) return; // Left click only
    const badgeInfo = findBadgeAtScreenPos(e.clientX, e.clientY);
    if (badgeInfo) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        hideTooltip();

        if (badgeInfo.type === "global") {
            showPresetModal(badgeInfo.node);
        } else {
            const hubNode = (app.graph?._nodes || []).find(n => n.type === "UniversalPresetHub" || n.comfyClass === "UniversalPresetHub");
            showHubManageModal(hubNode || null);
        }
        return false;
    }
}

// --- ComfyUI Web Extension Registration ---

app.registerExtension({
    name: "ComfyUI.UniversalSmartPresets",

    async setup() {
        console.log("[Smart Presets] Initializing 2-Tier Roof Badge System & Tooltips...");
        loadStylesheet();
        loadPresetsFromStorage();
        createTooltipDOM();

        // Attach top-level window listeners for guaranteed hover & click handling
        window.removeEventListener("pointermove", handleCanvasPointerMove);
        window.removeEventListener("pointerdown", handleCanvasPointerDown, { capture: true });

        window.addEventListener("pointermove", handleCanvasPointerMove, { passive: true });
        window.addEventListener("pointerdown", handleCanvasPointerDown, { capture: true });

        // Initialize Global Preset Modal
        initModal({
            getPresets: (node) => getPresetsForNode(node),
            onApply: (node, presetName, presetData) => {
                applyNodeState(node, presetData);
            },
            onUpdate: (node, presetName, presetData) => {
                const nodeType = getNodeType(node);
                if (!presetsStore[nodeType]) presetsStore[nodeType] = {};
                presetsStore[nodeType][presetName] = presetData;
                savePresetsToStorage();
                app.graph?.setDirtyCanvas(true, true);
            },
            onSave: (node, presetName) => {
                const nodeType = getNodeType(node);
                if (!presetsStore[nodeType]) presetsStore[nodeType] = {};
                presetsStore[nodeType][presetName] = extractNodeState(node);
                savePresetsToStorage();
                app.graph?.setDirtyCanvas(true, true);
            },
            onDelete: (node, presetName) => {
                const nodeType = getNodeType(node);
                if (presetsStore[nodeType] && presetsStore[nodeType][presetName]) {
                    delete presetsStore[nodeType][presetName];
                    savePresetsToStorage();
                    app.graph?.setDirtyCanvas(true, true);
                }
            },
            onRename: (node, oldName, newName) => {
                const nodeType = getNodeType(node);
                if (presetsStore[nodeType] && presetsStore[nodeType][oldName]) {
                    const data = presetsStore[nodeType][oldName];
                    delete presetsStore[nodeType][oldName];
                    presetsStore[nodeType][newName] = data;
                    savePresetsToStorage();
                    app.graph?.setDirtyCanvas(true, true);
                }
            },
            onReorder: (node, fromIdx, toIdx) => {
                const nodeType = getNodeType(node);
                if (!presetsStore[nodeType]) return;
                const entries = Object.entries(presetsStore[nodeType]);
                const [moved] = entries.splice(fromIdx, 1);
                entries.splice(toIdx, 0, moved);
                const newStore = {};
                for (const [k, v] of entries) {
                    newStore[k] = v;
                }
                presetsStore[nodeType] = newStore;
                savePresetsToStorage();
                app.graph?.setDirtyCanvas(true, true);
            },
            onImport: (importedData) => {
                if (importedData && typeof importedData === "object") {
                    presetsStore = { ...presetsStore, ...importedData };
                    savePresetsToStorage();
                    app.graph?.setDirtyCanvas(true, true);
                    showToast("📥 글로벌 프리셋을 성공적으로 불러왔습니다!", "success");
                }
            },
            onExport: () => {
                const blob = new Blob([JSON.stringify(presetsStore, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `comfyui_global_presets_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast("📤 글로벌 프리셋 JSON 백업 파일이 다운로드되었습니다.", "info");
            },
        });

        // 1. Context Menu Hook (No browser prompts, opens custom modal directly)
        if (typeof LGraphCanvas !== "undefined") {
            const origGetNodeMenuOptions = LGraphCanvas.prototype.getNodeMenuOptions;
            LGraphCanvas.prototype.getNodeMenuOptions = function (node) {
                const options = origGetNodeMenuOptions ? origGetNodeMenuOptions.apply(this, arguments) : [];
                if (!node || node.type === "UniversalPresetHub") return options;

                const nodeType = getNodeType(node);
                const presets = getPresetsForNode(node);
                const presetNames = Object.keys(presets);

                const submenu = [];

                submenu.push({
                    content: "💾 현재 세팅 글로벌 프리셋으로 저장...",
                    callback: () => {
                        showPresetModal(node, {
                            focusSave: true,
                            defaultName: `${node.title || nodeType} #${presetNames.length + 1}`,
                        });
                    },
                });

                submenu.push({
                    content: "📋 글로벌 프리셋 관리자 열기...",
                    callback: () => {
                        showPresetModal(node);
                    },
                });

                if (presetNames.length > 0) {
                    submenu.push(null);

                    for (const name of presetNames) {
                        const presetData = presets[name];
                        const badgeInfo = presetData._isLoraStack ? `[${presetData.loras?.length || 0} LoRAs]` : "";
                        submenu.push({
                            content: `▶ ${name} ${badgeInfo}`,
                            callback: () => {
                                applyNodeState(node, presetData);
                                showToast(`✨ [${name}] 프리셋 적용 완료!`, "success");
                            },
                        });
                    }
                }

                options.push(null);
                options.push({
                    content: `🌐 글로벌 프리셋 (${presetNames.length})`,
                    has_submenu: true,
                    submenu: {
                        options: submenu,
                    },
                });

                return options;
            };
        }

        // 2. Hook LGraphNode.prototype.onDrawForeground for Roof Badges
        if (typeof LGraphNode !== "undefined") {
            const origOnDrawForeground = LGraphNode.prototype.onDrawForeground;
            LGraphNode.prototype.onDrawForeground = function (ctx, canvas) {
                const res = origOnDrawForeground ? origOnDrawForeground.apply(this, arguments) : undefined;
                drawRoofBadges(this, ctx);
                return res;
            };
        }
    },

    async nodeCreated(node) {
        const origOnDrawForeground = node.onDrawForeground;
        node.onDrawForeground = function (ctx, canvas) {
            const res = origOnDrawForeground?.apply(this, arguments);
            drawRoofBadges(this, ctx);
            return res;
        };
    },
});

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

console.log("%c[Universal Smart Presets]%c 2-Tier Roof Badges & Tooltips Ready.", "color: #6366f1; font-weight: bold;", "color: inherit;");

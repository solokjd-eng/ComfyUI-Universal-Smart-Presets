/**
 * ComfyUI Universal Preset Hub Node Extension
 * - Real-Time Multi-Instance Wireless Mirroring (All Hub Nodes on canvas sync 100% like clones)
 * - Direct On-Canvas Radio Switcher (Fast Groups Style): Instant One-Click Preset Switching
 * - Exclusive Single-Active State (Radio Button Mode across Workflow)
 * - Dynamic Node Auto-Height Scaling & Smooth Internal Mouse-Wheel Scrolling
 * - Canvas Drag & Drop Reordering with Visual Insertion Guide
 * - Complete Two-Way Sync with Universal Preset Hub Modal
 * - Full Support for Node Execution Modes (Bypass 🟣 / Mute 🔴 / Active 🟢)
 * - Zero Cross-Workflow Leakage + Automatic PNG Metadata Embedding
 */

import { app } from "../../scripts/app.js";
import { extractNodeState, applyNodeState } from "./smart_presets.js";
import { initHubModal, showHubManageModal } from "./hub_modal.js";
import { showToast } from "./presets_modal.js";

const ROW_HEIGHT = 34;
const ROW_GAP = 5;
const HEADER_HEIGHT = 26;
const EMPTY_HEIGHT = 44;
const STATUS_FOOTER_HEIGHT = 28;
const TOP_CONTROLS_HEIGHT = 92;
const MAX_VISIBLE_ROWS = 5.5;
const MAX_LIST_VIEW_HEIGHT = Math.round(MAX_VISIBLE_ROWS * (ROW_HEIGHT + ROW_GAP)); // ~214px
const NODE_DEFAULT_WIDTH = 370;

export let hubPresetsStore = {}; // Backwards compatibility

/**
 * Broadcast updated presets and active state to ALL UniversalPresetHub nodes on canvas in real-time
 */
export function broadcastHubPresets(presets, activePreset = null) {
    if (!app.graph?._nodes) return;

    for (const n of app.graph._nodes) {
        if (n.type === "UniversalPresetHub" || n.comfyClass === "UniversalPresetHub") {
            if (!n.properties) n.properties = {};
            n.properties.hub_presets = JSON.parse(JSON.stringify(presets));
            if (activePreset !== null) {
                n.properties.active_preset = activePreset;
            }
        }
    }
    updateAllHubNodes();
}

/**
 * Get hub presets dictionary from a UniversalPresetHub node instance (Synchronized across all canvas hub nodes)
 */
export function getHubPresets(hubNode) {
    if (!hubNode && app.graph?._nodes) {
        hubNode = app.graph._nodes.find(n => n.type === "UniversalPresetHub" || n.comfyClass === "UniversalPresetHub");
    }
    if (!hubNode) return {};
    if (!hubNode.properties) hubNode.properties = {};
    if (!hubNode.properties.hub_presets || typeof hubNode.properties.hub_presets !== "object") {
        hubNode.properties.hub_presets = {};
    }

    // If this node is empty but other hub nodes on canvas have presets, auto-inherit
    if (Object.keys(hubNode.properties.hub_presets).length === 0 && app.graph?._nodes) {
        const otherHub = app.graph._nodes.find(n => 
            (n.type === "UniversalPresetHub" || n.comfyClass === "UniversalPresetHub") && 
            n !== hubNode && 
            n.properties?.hub_presets && 
            Object.keys(n.properties.hub_presets).length > 0
        );
        if (otherHub) {
            hubNode.properties.hub_presets = JSON.parse(JSON.stringify(otherHub.properties.hub_presets));
            if (otherHub.properties.active_preset) {
                hubNode.properties.active_preset = otherHub.properties.active_preset;
            }
        }
    }

    return hubNode.properties.hub_presets;
}

/**
 * Dynamically calculate and set the exact required size for UniversalPresetHub node
 */
export function computeHubNodeSize(node) {
    if (!node || !node.size) return [NODE_DEFAULT_WIDTH, 160];
    const presets = getHubPresets(node);
    const count = Object.keys(presets).length;

    let listHeight = 0;
    if (count === 0) {
        listHeight = HEADER_HEIGHT + EMPTY_HEIGHT;
    } else {
        const fullContentHeight = HEADER_HEIGHT + count * (ROW_HEIGHT + ROW_GAP);
        listHeight = Math.min(fullContentHeight, HEADER_HEIGHT + MAX_LIST_VIEW_HEIGHT);
    }

    const totalHeight = TOP_CONTROLS_HEIGHT + listHeight + STATUS_FOOTER_HEIGHT + 14;
    const currentW = Math.max(node.size[0] || NODE_DEFAULT_WIDTH, NODE_DEFAULT_WIDTH);
    node.size = [currentW, totalHeight];
    return node.size;
}

/**
 * Register UniversalPresetHub extension
 */
app.registerExtension({
    name: "ComfyUI.UniversalPresetHub",

    async setup() {
        console.log("[Hub Node] Initializing Cloned Multi-Instance Universal Preset Hub Switchers...");

        // Auto-clean any legacy global localStorage hub cache
        try {
            localStorage.removeItem("ComfyUI_Master_Hub_Presets_v1");
            localStorage.removeItem("ComfyUI_Universal_Hub_Presets_v1");
        } catch (e) {}

        // Initialize Grand Modal Callbacks with synced data across all nodes
        initHubModal({
            getPresets: (hubNode) => getHubPresets(hubNode),
            onApply: (presetName, presetData, hubNode) => {
                applyMasterPresetToWorkflow(presetData, hubNode);
            },
            onSave: (hubNode, presetName) => {
                saveMasterPresetFromSelection(hubNode, presetName);
            },
            onDelete: (presetName, hubNode) => {
                const presets = getHubPresets(hubNode);
                delete presets[presetName];
                let newActive = hubNode?.properties?.active_preset;
                if (newActive === presetName) {
                    const remaining = Object.keys(presets);
                    newActive = remaining.length > 0 ? remaining[0] : "None";
                }
                broadcastHubPresets(presets, newActive);
                app.graph?.setDirtyCanvas(true, true);
            },
            onRename: (oldName, newName, hubNode) => {
                const presets = getHubPresets(hubNode);
                if (presets[oldName]) {
                    const data = presets[oldName];
                    data.name = newName;
                    delete presets[oldName];
                    presets[newName] = data;
                    let newActive = hubNode?.properties?.active_preset;
                    if (newActive === oldName) {
                        newActive = newName;
                    }
                    broadcastHubPresets(presets, newActive);
                    app.graph?.setDirtyCanvas(true, true);
                }
            },
            onReorder: (fromIdx, toIdx, hubNode) => {
                const presets = getHubPresets(hubNode);
                const entries = Object.entries(presets);
                const [moved] = entries.splice(fromIdx, 1);
                entries.splice(toIdx, 0, moved);

                const newStore = {};
                for (const [k, v] of entries) {
                    newStore[k] = v;
                }
                broadcastHubPresets(newStore);
                app.graph?.setDirtyCanvas(true, true);
            },
            onExport: (hubNode) => {
                const presets = getHubPresets(hubNode);
                const blob = new Blob([JSON.stringify(presets, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `comfyui_universal_hub_presets_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast("📤 유니버셜 프리셋 JSON 백업 파일이 다운로드되었습니다.", "info");
            },
            onImport: (importedData, hubNode) => {
                if (importedData && typeof importedData === "object") {
                    const presets = getHubPresets(hubNode);
                    Object.assign(presets, importedData);
                    broadcastHubPresets(presets);
                    app.graph?.setDirtyCanvas(true, true);
                    showToast("📥 유니버셜 프리셋을 성공적으로 불러왔습니다!", "success");
                }
            },
        });

        // 1. Window-level Wheel listener for smooth internal list scrolling without zooming canvas
        window.addEventListener("wheel", (e) => {
            const canvas = app.canvas;
            if (!canvas || !app.graph?._nodes) return;

            const rect = canvas.canvas?.getBoundingClientRect?.() || document.querySelector("canvas")?.getBoundingClientRect?.();
            if (!rect) return;

            const clientX = e.clientX;
            const clientY = e.clientY;
            if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;

            const scale = Number(canvas.ds?.scale || 1);
            const offset = canvas.ds?.offset || [0, 0];
            const canvasX = (clientX - rect.left) / scale - offset[0];
            const canvasY = (clientY - rect.top) / scale - offset[1];

            for (const node of app.graph._nodes) {
                if (node.type === "UniversalPresetHub" || node.comfyClass === "UniversalPresetHub") {
                    if (
                        node.pos &&
                        node.size &&
                        canvasX >= node.pos[0] &&
                        canvasX <= node.pos[0] + node.size[0] &&
                        canvasY >= node.pos[1] &&
                        canvasY <= node.pos[1] + node.size[1]
                    ) {
                        const presets = getHubPresets(node);
                        const count = Object.keys(presets).length;
                        const listTopY = TOP_CONTROLS_HEIGHT;
                        const listBottomY = node.size[1] - STATUS_FOOTER_HEIGHT - 6;
                        const listViewHeight = listBottomY - listTopY;
                        const totalContentHeight = HEADER_HEIGHT + count * (ROW_HEIGHT + ROW_GAP);
                        const maxScroll = Math.max(0, totalContentHeight - listViewHeight);

                        if (maxScroll > 0 && canvasY >= node.pos[1] + listTopY && canvasY <= node.pos[1] + listBottomY) {
                            e.preventDefault();
                            e.stopPropagation();
                            const delta = e.deltaY > 0 ? 36 : -36;
                            node._scrollOffset = Math.max(0, Math.min(maxScroll, (node._scrollOffset || 0) + delta));
                            app.graph.setDirtyCanvas(true, true);
                            return;
                        }
                    }
                }
            }
        }, { passive: false });

        // 2. Real-time canvas selection watcher
        if (typeof LGraphCanvas !== "undefined") {
            const origProcessMouseDown = LGraphCanvas.prototype.processMouseDown;
            LGraphCanvas.prototype.processMouseDown = function () {
                const res = origProcessMouseDown ? origProcessMouseDown.apply(this, arguments) : false;
                setTimeout(() => updateAllHubNodes(), 30);
                return res;
            };

            const origProcessMouseUp = LGraphCanvas.prototype.processMouseUp;
            LGraphCanvas.prototype.processMouseUp = function () {
                const res = origProcessMouseUp ? origProcessMouseUp.apply(this, arguments) : false;
                setTimeout(() => updateAllHubNodes(), 30);
                return res;
            };
        }
    },

    async nodeCreated(node) {
        if (node.comfyClass === "UniversalPresetHub" || node.type === "UniversalPresetHub") {
            if (!node.title || node.title.includes("마스터")) {
                node.title = "🌟 Universal Preset Hub (유니버셜 프리셋 허브)";
            }
            // Inherit presets from any existing hub node on canvas
            getHubPresets(node);
            setupHubNodeWidgets(node);
            computeHubNodeSize(node);
            updateAllHubNodes();
        }
    },

    async loadedGraphNode(node) {
        if (node.comfyClass === "UniversalPresetHub" || node.type === "UniversalPresetHub") {
            if (!node.title || node.title.includes("마스터")) {
                node.title = "🌟 Universal Preset Hub (유니버셜 프리셋 허브)";
            }
            getHubPresets(node);
            setupHubNodeWidgets(node);
            computeHubNodeSize(node);
            updateHubPresetButton(node);
        }
    }
});

/**
 * Get list of currently selected nodes on canvas
 */
export function getCurrentlySelectedNodes(hubNode) {
    const selected = [];
    const canvasSelection = app.canvas?.selected_nodes;

    if (canvasSelection && Object.keys(canvasSelection).length > 0) {
        for (const k in canvasSelection) {
            const n = canvasSelection[k];
            if (n && n !== hubNode && n.type !== "UniversalPresetHub" && n.comfyClass !== "UniversalPresetHub") {
                selected.push(n);
            }
        }
    } else if (app.graph?._nodes) {
        for (const n of app.graph._nodes) {
            if (n.is_selected && n !== hubNode && n.type !== "UniversalPresetHub" && n.comfyClass !== "UniversalPresetHub") {
                selected.push(n);
            }
        }
    }

    return selected;
}

/**
 * Configure Ultra-Streamlined 2-Row Controls + Direct On-Canvas Preset Switcher
 */
function setupHubNodeWidgets(node) {
    if (!node.title || node.title.includes("마스터")) {
        node.title = "🌟 Universal Preset Hub (유니버셜 프리셋 허브)";
    }
    if (!node.properties) node.properties = {};
    if (!node.properties.active_preset) node.properties.active_preset = "None";
    if (!node.properties.hub_presets) node.properties.hub_presets = {};
    if (node._scrollOffset === undefined) node._scrollOffset = 0;
    if (!node._dragState) node._dragState = null;

    // Initialize or update buttons safely without duplicate creation
    if (!node.widgets || node.widgets.length === 0) {
        node.widgets = [];

        // 1. Top Row 1: Grand Hub Modal Launcher Button
        const modalBtn = node.addWidget("button", "🏷️ [유니버셜 프리셋 관리자] 열기 ▼", null, () => {
            showHubManageModal(node);
        });
        node._modalBtn = modalBtn;

        // 2. Top Row 2: Clean Save Selection Button
        const saveBtn = node.addWidget("button", "💾 선택 노드로 새 유니버셜 프리셋 저장", null, () => {
            const selectedNodes = getCurrentlySelectedNodes(node);
            if (selectedNodes.length === 0) {
                showToast("⚠️ 먼저 캔버스에서 묶고 싶은 노드들을 선택(Ctrl+클릭 / 드래그)해 주세요!", "warning");
                return;
            }

            const presets = getHubPresets(node);
            const defaultName = `유니버셜 세팅 #${Object.keys(presets).length + 1}`;
            showHubManageModal(node, { focusSave: true, defaultName: defaultName });
        });
        node._saveBtn = saveBtn;
    } else {
        node._modalBtn = node.widgets[0];
        node._saveBtn = node.widgets[1];
    }

    // Attach event hooks only once per node instance to prevent recursion
    if (!node._hubHooksInitialized) {
        node._hubHooksInitialized = true;

        // 3. Interactive Mouse Event Handlers for Direct On-Canvas Switching & Reordering
        const origOnMouseDown = node.onMouseDown;
        node.onMouseDown = function (e, localPos, canvas) {
            const res = origOnMouseDown ? origOnMouseDown.apply(this, arguments) : false;
            if (res) return res;

            const presets = getHubPresets(this);
            const presetNames = Object.keys(presets);
            const count = presetNames.length;
            if (count === 0) return false;

            const listTopY = TOP_CONTROLS_HEIGHT;
            const listBottomY = this.size[1] - STATUS_FOOTER_HEIGHT - 6;
            const localX = localPos ? localPos[0] : (e && e.canvasX !== undefined ? e.canvasX - this.pos[0] : 0);
            const localY = localPos ? localPos[1] : (e && e.canvasY !== undefined ? e.canvasY - this.pos[1] : 0);

            if (localY >= listTopY + HEADER_HEIGHT && localY <= listBottomY && localX >= 10 && localX <= this.size[0] - 10) {
                const scroll = this._scrollOffset || 0;
                const contentY = localY - (listTopY + HEADER_HEIGHT) + scroll;
                const rowIndex = Math.floor(contentY / (ROW_HEIGHT + ROW_GAP));
                const offsetInRow = contentY % (ROW_HEIGHT + ROW_GAP);

                if (rowIndex >= 0 && rowIndex < count && offsetInRow <= ROW_HEIGHT) {
                    const targetName = presetNames[rowIndex];

                    // Check if user clicked on drag handle ⠿ (X: 10 ~ 38px)
                    if (localX <= 38) {
                        this._dragState = {
                            active: true,
                            fromIndex: rowIndex,
                            targetIndex: rowIndex,
                            name: targetName,
                            startY: localY,
                            currentY: localY,
                        };
                        if (app.canvas?.canvas) app.canvas.canvas.style.cursor = "grabbing";
                        app.graph?.setDirtyCanvas(true, true);
                        return true;
                    }

                    // Clicked on the row or Radio Toggle Switch: Activate and sync across ALL hub nodes!
                    applyMasterPresetToWorkflow(presets[targetName], this);
                    broadcastHubPresets(presets, targetName);
                    app.graph?.setDirtyCanvas(true, true);
                    return true;
                }
            }

            return false;
        };

        const origOnMouseMove = node.onMouseMove;
        node.onMouseMove = function (e, localPos, canvas) {
            origOnMouseMove?.apply(this, arguments);

            const presets = getHubPresets(this);
            const presetNames = Object.keys(presets);
            const count = presetNames.length;
            const localX = localPos ? localPos[0] : (e && e.canvasX !== undefined ? e.canvasX - this.pos[0] : 0);
            const localY = localPos ? localPos[1] : (e && e.canvasY !== undefined ? e.canvasY - this.pos[1] : 0);
            const listTopY = TOP_CONTROLS_HEIGHT;
            const listBottomY = this.size[1] - STATUS_FOOTER_HEIGHT - 6;

            // Handle Active Drag Reordering
            if (this._dragState?.active) {
                this._dragState.currentY = localY;
                const scroll = this._scrollOffset || 0;
                const contentY = Math.max(0, localY - (listTopY + HEADER_HEIGHT) + scroll);
                const rawTargetIndex = Math.floor(contentY / (ROW_HEIGHT + ROW_GAP));
                this._dragState.targetIndex = Math.max(0, Math.min(count - 1, rawTargetIndex));
                app.graph?.setDirtyCanvas(true, true);
                return;
            }

            // Hover Cursor Hint
            if (localY >= listTopY + HEADER_HEIGHT && localY <= listBottomY && localX >= 10 && localX <= this.size[0] - 10) {
                if (localX <= 38) {
                    if (app.canvas?.canvas) app.canvas.canvas.style.cursor = "grab";
                } else {
                    if (app.canvas?.canvas) app.canvas.canvas.style.cursor = "pointer";
                }
            }
        };

        const origOnMouseUp = node.onMouseUp;
        node.onMouseUp = function (e, localPos, canvas) {
            origOnMouseUp?.apply(this, arguments);

            if (this._dragState?.active) {
                const fromIndex = this._dragState.fromIndex;
                const toIndex = this._dragState.targetIndex;
                const presetName = this._dragState.name;
                this._dragState = null;

                if (fromIndex !== undefined && toIndex !== undefined && fromIndex !== toIndex) {
                    const presets = getHubPresets(this);
                    const entries = Object.entries(presets);
                    const [moved] = entries.splice(fromIndex, 1);
                    entries.splice(toIndex, 0, moved);

                    const newStore = {};
                    for (const [k, v] of entries) {
                        newStore[k] = v;
                    }
                    broadcastHubPresets(newStore);
                    showToast(`↕️ [${presetName}] 프리셋 순서가 변경되었습니다.`, "gold");
                }

                if (app.canvas?.canvas) app.canvas.canvas.style.cursor = "default";
                app.graph?.setDirtyCanvas(true, true);
            }
        };

        // 4. Custom Canvas Rendering: On-Canvas Radio Switcher, Dynamic Scrollbar & Selection Status
        const origDrawForeground = node.onDrawForeground;
        node.onDrawForeground = function (ctx) {
            origDrawForeground?.apply(this, arguments);

            const presets = getHubPresets(this);
            const presetNames = Object.keys(presets);
            const count = presetNames.length;
            const activeName = this.properties?.active_preset || "None";

            const listTopY = TOP_CONTROLS_HEIGHT;
            const listBottomY = this.size[1] - STATUS_FOOTER_HEIGHT - 6;
            const listViewHeight = Math.max(10, listBottomY - listTopY);
            const fullContentHeight = HEADER_HEIGHT + count * (ROW_HEIGHT + ROW_GAP);
            const maxScroll = Math.max(0, fullContentHeight - listViewHeight);
            const scrollOffset = Math.max(0, Math.min(maxScroll, this._scrollOffset || 0));

            ctx.save();

            // 1. Draw List Area Header Strip
            ctx.fillStyle = "#f59e0b";
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(`📋 유니버셜 프리셋 (${count}개)`, 12, listTopY + 12);

            ctx.fillStyle = "#94a3b8";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText("⚡ 클릭하여 즉시 적용", this.size[0] - 12, listTopY + 12);

            // 2. Preset List Viewport with Strict Canvas Clipping
            ctx.save();
            ctx.beginPath();
            ctx.rect(8, listTopY + HEADER_HEIGHT, this.size[0] - 16, Math.max(0, listViewHeight - HEADER_HEIGHT));
            ctx.clip();

            ctx.translate(0, -scrollOffset);

            if (count === 0) {
                // Empty State Notice
                const emptyBoxY = listTopY + HEADER_HEIGHT + 6;
                ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(10, emptyBoxY, this.size[0] - 20, 36, 6);
                    ctx.stroke();
                } else {
                    ctx.strokeRect(10, emptyBoxY, this.size[0] - 20, 36);
                }
                ctx.setLineDash([]);

                ctx.fillStyle = "#94a3b8";
                ctx.font = "11px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("💡 노드 선택 후 상단 버튼을 눌러 저장해 보세요", this.size[0] / 2, emptyBoxY + 18);
            } else {
                // Draw Preset Rows
                presetNames.forEach((name, idx) => {
                    const presetData = presets[name];
                    const rowY = listTopY + HEADER_HEIGHT + idx * (ROW_HEIGHT + ROW_GAP);
                    const rowW = this.size[0] - 20;
                    const isActive = (name === activeName);
                    const isDraggingThis = (this._dragState?.active && this._dragState.fromIndex === idx);

                    ctx.save();
                    if (isDraggingThis) {
                        ctx.globalAlpha = 0.4;
                    }

                    // Row Background Container
                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(10, rowY, rowW, ROW_HEIGHT, 6);
                    } else {
                        ctx.rect(10, rowY, rowW, ROW_HEIGHT);
                    }

                    if (isActive) {
                        const rowGrad = ctx.createLinearGradient(10, rowY, 10 + rowW, rowY + ROW_HEIGHT);
                        rowGrad.addColorStop(0, "rgba(245, 158, 11, 0.18)");
                        rowGrad.addColorStop(1, "rgba(217, 119, 6, 0.08)");
                        ctx.fillStyle = rowGrad;
                        ctx.fill();

                        ctx.strokeStyle = "rgba(245, 158, 11, 0.85)";
                        ctx.lineWidth = 1.4;
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = "rgba(30, 41, 59, 0.7)";
                        ctx.fill();

                        ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }

                    // ⠿ Drag Grip Icon
                    ctx.fillStyle = isActive ? "#fcd34d" : "#64748b";
                    ctx.font = "bold 13px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("⠿", 22, rowY + ROW_HEIGHT / 2);

                    // 🌟 Preset Name
                    const nodeCount = presetData?.targets?.length || 0;
                    let displayName = name;
                    if (displayName.length > 18) {
                        displayName = displayName.slice(0, 16) + "...";
                    }
                    const titleText = `🌟 ${displayName}`;

                    ctx.font = isActive ? "bold 12px sans-serif" : "12px sans-serif";
                    ctx.fillStyle = isActive ? "#fef08a" : "#f8fafc";
                    ctx.textAlign = "left";
                    ctx.textBaseline = "middle";
                    ctx.fillText(titleText, 34, rowY + ROW_HEIGHT / 2);

                    const nameWidth = ctx.measureText(titleText).width;

                    // Target Node Count Tag
                    ctx.font = "10.5px sans-serif";
                    ctx.fillStyle = isActive ? "#fcd34d" : "#94a3b8";
                    ctx.fillText(`(${nodeCount}개)`, 34 + nameWidth + 8, rowY + ROW_HEIGHT / 2);

                    // 🟢 Radio Toggle Switch Capsule (Fast Groups Style)
                    const switchW = 56;
                    const switchH = 20;
                    const switchX = 10 + rowW - switchW - 6;
                    const switchY = rowY + (ROW_HEIGHT - switchH) / 2;

                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(switchX, switchY, switchW, switchH, 10);
                    } else {
                        ctx.rect(switchX, switchY, switchW, switchH);
                    }

                    if (isActive) {
                        // Vibrant Active Gradient (Emerald / Amber)
                        const swGrad = ctx.createLinearGradient(switchX, switchY, switchX + switchW, switchY + switchH);
                        swGrad.addColorStop(0, "#10b981");
                        swGrad.addColorStop(1, "#059669");
                        ctx.fillStyle = swGrad;
                        ctx.fill();

                        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        // Active "ON" Text
                        ctx.fillStyle = "#ffffff";
                        ctx.font = "bold 9.5px sans-serif";
                        ctx.textAlign = "left";
                        ctx.fillText("ON", switchX + 10, switchY + switchH / 2 + 0.5);

                        // Knob on Right
                        ctx.beginPath();
                        ctx.arc(switchX + switchW - 10, switchY + switchH / 2, 7, 0, Math.PI * 2);
                        ctx.fillStyle = "#ffffff";
                        ctx.fill();
                    } else {
                        // Inactive Switch
                        ctx.fillStyle = "#1e293b";
                        ctx.fill();

                        ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        // Inactive "OFF" Text
                        ctx.fillStyle = "#64748b";
                        ctx.font = "bold 9.5px sans-serif";
                        ctx.textAlign = "right";
                        ctx.fillText("OFF", switchX + switchW - 8, switchY + switchH / 2 + 0.5);

                        // Knob on Left
                        ctx.beginPath();
                        ctx.arc(switchX + 10, switchY + switchH / 2, 7, 0, Math.PI * 2);
                        ctx.fillStyle = "#475569";
                        ctx.fill();
                    }

                    ctx.restore();
                });

                // Draw Drag Insertion Indicator Line
                if (this._dragState?.active && this._dragState.targetIndex !== undefined) {
                    const targetY = listTopY + HEADER_HEIGHT + this._dragState.targetIndex * (ROW_HEIGHT + ROW_GAP);
                    ctx.save();
                    ctx.strokeStyle = "#f59e0b";
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.moveTo(10, targetY - 2);
                    ctx.lineTo(this.size[0] - 10, targetY - 2);
                    ctx.stroke();

                    ctx.fillStyle = "#f59e0b";
                    ctx.beginPath();
                    ctx.arc(10, targetY - 2, 4, 0, Math.PI * 2);
                    ctx.arc(this.size[0] - 10, targetY - 2, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }

            ctx.restore(); // Restore Clipping & Translation

            // 3. Draw Sleek Modern Scrollbar (when content exceeds viewport)
            if (maxScroll > 0) {
                const scrollTrackX = this.size[0] - 10;
                const scrollTrackY = listTopY + HEADER_HEIGHT + 2;
                const scrollTrackH = Math.max(10, listViewHeight - HEADER_HEIGHT - 4);

                ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(scrollTrackX, scrollTrackY, 4, scrollTrackH, 2);
                } else {
                    ctx.rect(scrollTrackX, scrollTrackY, 4, scrollTrackH);
                }
                ctx.fill();

                const thumbH = Math.max(18, (scrollTrackH / fullContentHeight) * scrollTrackH);
                const thumbY = scrollTrackY + (scrollOffset / maxScroll) * (scrollTrackH - thumbH);

                ctx.fillStyle = "rgba(245, 158, 11, 0.75)";
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(scrollTrackX, thumbY, 4, thumbH, 2);
                } else {
                    ctx.rect(scrollTrackX, thumbY, 4, thumbH);
                }
                ctx.fill();
            }

            // 4. Bottom Canvas Status Display (Real-Time Selected Nodes Watcher)
            const selectedNodes = getCurrentlySelectedNodes(this);
            const selCount = selectedNodes.length;

            ctx.fillStyle = selCount > 0 ? "#38bdf8" : "#94a3b8";
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            if (selCount > 0) {
                ctx.fillText(`🎯 캔버스 선택 감지: ${selCount}개 노드`, this.size[0] / 2, this.size[1] - 14);
            } else {
                ctx.fillText(`💡 캔버스에서 노드를 선택하세요 (Ctrl+클릭 / 드래그)`, this.size[0] / 2, this.size[1] - 14);
            }

            ctx.restore();
        };
    }

    updateHubPresetButton(node);
}

function getPresetDisplayLabel(node) {
    const presets = getHubPresets(node);
    const presetNames = Object.keys(presets);
    if (presetNames.length === 0) {
        return "🏷️ [유니버셜 프리셋 관리자] (0개) ▼";
    }

    const activeName = node?.properties?.active_preset && presets[node.properties.active_preset]
        ? node.properties.active_preset
        : presetNames[0];

    const presetData = presets[activeName];
    const nodeCount = presetData?.targets?.length || 0;

    return `🏷️ [${activeName}] (${nodeCount}개 노드) 관리자 ▼`;
}

function updateHubPresetButton(node) {
    if (node._modalBtn) {
        node._modalBtn.name = getPresetDisplayLabel(node);
    }
}

/**
 * Save snapshot of all currently selected nodes with pos info & mode state (Synced across all hub nodes)
 */
export function saveMasterPresetFromSelection(hubNode, presetName) {
    if (!hubNode && app.graph?._nodes) {
        hubNode = app.graph._nodes.find(n => n.type === "UniversalPresetHub" || n.comfyClass === "UniversalPresetHub");
    }
    if (!hubNode) return;

    const selectedNodes = getCurrentlySelectedNodes(hubNode);
    if (selectedNodes.length === 0) {
        showToast("⚠️ 캔버스에서 선택된 노드가 없습니다.", "warning");
        return;
    }

    const targetsData = [];
    for (const targetNode of selectedNodes) {
        targetsData.push({
            id: targetNode.id,
            title: targetNode.title || targetNode.type,
            nodeType: targetNode.comfyClass || targetNode.type,
            pos: targetNode.pos ? [targetNode.pos[0], targetNode.pos[1]] : [0, 0],
            state: extractNodeState(targetNode),
        });
    }

    const presets = getHubPresets(hubNode);
    presets[presetName] = {
        name: presetName,
        timestamp: Date.now(),
        targets: targetsData,
    };

    // Broadcast newly saved preset to ALL hub nodes on the canvas
    broadcastHubPresets(presets, presetName);
    app.graph?.setDirtyCanvas(true, true);
}

/**
 * Apply composite master preset data with Smart 3-Stage Matching
 * 1. Exact ID match (Same workflow)
 * 2. Exact Custom Title + NodeType match (Cross-workflow renamed nodes)
 * 3. Sequential 1:1 NodeType match ordered by relative canvas X position (Zero duplication)
 */
export function applyMasterPresetToWorkflow(presetData, hubNode = null) {
    if (!presetData || !Array.isArray(presetData.targets)) {
        showToast("⚠️ 유효하지 않은 유니버셜 프리셋 데이터입니다.", "warning");
        return;
    }

    const graph = app.graph;
    if (!graph || !graph._nodes) return;

    let appliedCount = 0;
    const usedNodeIds = new Set();
    const targets = presetData.targets.map(t => ({ ...t, _matched: false }));

    // --- Pass 1: Exact Node ID Matching ---
    for (const target of targets) {
        const nodeById = graph.getNodeById(target.id);
        if (nodeById && !usedNodeIds.has(nodeById.id)) {
            const currentType = nodeById.comfyClass || nodeById.type;
            if (currentType === target.nodeType || !target.nodeType) {
                applyNodeState(nodeById, target.state);
                usedNodeIds.add(nodeById.id);
                target._matched = true;
                appliedCount++;
            }
        }
    }

    // --- Pass 2: Custom Title + NodeType Matching (Cross-Workflow with Named Nodes) ---
    for (const target of targets) {
        if (target._matched) continue;
        if (target.title && target.nodeType) {
            const matchedByTitle = graph._nodes.find(n => 
                !usedNodeIds.has(n.id) &&
                (n.comfyClass || n.type) === target.nodeType &&
                (n.title || n.type) === target.title
            );
            if (matchedByTitle) {
                applyNodeState(matchedByTitle, target.state);
                usedNodeIds.add(matchedByTitle.id);
                target._matched = true;
                appliedCount++;
            }
        }
    }

    // --- Pass 3: Sequential 1:1 Matching by Canvas Position (Left-to-Right Flow) ---
    for (const target of targets) {
        if (target._matched) continue;
        if (target.nodeType) {
            const availableNodes = graph._nodes.filter(n => 
                !usedNodeIds.has(n.id) && 
                (n.comfyClass || n.type) === target.nodeType
            );

            if (availableNodes.length > 0) {
                // Sort by relative canvas X position (left-to-right flow)
                availableNodes.sort((a, b) => (a.pos?.[0] || 0) - (b.pos?.[0] || 0));
                const targetNode = availableNodes[0];

                applyNodeState(targetNode, target.state);
                usedNodeIds.add(targetNode.id);
                target._matched = true;
                appliedCount++;
            }
        }
    }

    // Synchronize active preset across ALL hub nodes on canvas
    if (graph._nodes) {
        for (const n of graph._nodes) {
            if (n.comfyClass === "UniversalPresetHub" || n.type === "UniversalPresetHub") {
                if (!n.properties) n.properties = {};
                n.properties.active_preset = presetData.name;
            }
        }
    }

    updateAllHubNodes();
    graph.setDirtyCanvas(true, true);
    showToast(`✨ [${presetData.name}] 유니버셜 프리셋 일괄 적용 완료 (총 ${appliedCount}개 노드 동기화)`, "gold");
}

/**
 * Update all Hub nodes on canvas (Recomputes size, updates buttons, refreshes switcher)
 */
export function updateAllHubNodes() {
    if (!app.graph?._nodes) return;

    for (const node of app.graph._nodes) {
        if (node.comfyClass === "UniversalPresetHub" || node.type === "UniversalPresetHub") {
            computeHubNodeSize(node);
            updateHubPresetButton(node);
        }
    }
    app.graph.setDirtyCanvas(true, true);
}

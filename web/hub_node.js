/**
 * ComfyUI Universal Preset Hub Node Extension
 * - Ultra-Streamlined 2-Row UI on Node:
 *    1) [ 🏷️ 마스터 프리셋: [이름] ([N]개 노드) ▼ ] -> Opens Grand Management Modal
 *    2) [ 💾 선택 노드 마스터 프리셋 저장 ] -> Opens custom Glassmorphism Modal directly!
 * - Integrated Grand Modal (Select, Apply, Reorder, Edit, Save, Export/Import)
 * - Zero Blocking Alerts + Pure Glassmorphic Floating Toast Notifications
 * - Smart 3-Stage Multi-Key Matching (ID -> Custom Title -> Sequential 1:1 Canvas Pos)
 */

import { app } from "../../scripts/app.js";
import { extractNodeState, applyNodeState } from "./smart_presets.js";
import { initHubModal, showHubManageModal } from "./hub_modal.js";
import { showToast } from "./presets_modal.js";

const HUB_STORAGE_KEY = "ComfyUI_Master_Hub_Presets_v1";

export let hubPresetsStore = {};

export function loadHubPresetsFromStorage() {
    try {
        const local = localStorage.getItem(HUB_STORAGE_KEY);
        if (local) {
            hubPresetsStore = JSON.parse(local);
        }
    } catch (e) {
        console.warn("[Hub] Failed to read localStorage:", e);
    }

    fetch("/universal_presets/load")
        .then((res) => res.json())
        .then((data) => {
            if (data && data.success && data.hub_presets && Object.keys(data.hub_presets).length > 0) {
                hubPresetsStore = { ...hubPresetsStore, ...data.hub_presets };
                localStorage.setItem(HUB_STORAGE_KEY, JSON.stringify(hubPresetsStore));
                app.graph?.setDirtyCanvas(true, true);
            }
        })
        .catch(() => {});
}

export function saveHubPresetsToStorage() {
    try {
        localStorage.setItem(HUB_STORAGE_KEY, JSON.stringify(hubPresetsStore));
    } catch (e) {
        console.warn("[Hub] Failed to save localStorage:", e);
    }

    fetch("/universal_presets/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hub_presets: hubPresetsStore }),
    }).catch(() => {});
}

/**
 * Register UniversalPresetHub extension
 */
app.registerExtension({
    name: "ComfyUI.UniversalPresetHub",

    async setup() {
        console.log("[Hub Node] Initializing Streamlined Universal Preset Hub...");
        loadHubPresetsFromStorage();

        // Initialize Grand Modal Callbacks
        initHubModal({
            getPresets: () => hubPresetsStore,
            onApply: (presetName, presetData) => {
                applyMasterPresetToWorkflow(presetData);
            },
            onSave: (hubNode, presetName) => {
                saveMasterPresetFromSelection(hubNode, presetName);
            },
            onDelete: (presetName) => {
                delete hubPresetsStore[presetName];
                saveHubPresetsToStorage();
                updateAllHubNodes();
            },
            onRename: (oldName, newName) => {
                if (hubPresetsStore[oldName]) {
                    const data = hubPresetsStore[oldName];
                    data.name = newName;
                    delete hubPresetsStore[oldName];
                    hubPresetsStore[newName] = data;
                    saveHubPresetsToStorage();
                    updateAllHubNodes();
                }
            },
            onReorder: (fromIdx, toIdx) => {
                const entries = Object.entries(hubPresetsStore);
                const [moved] = entries.splice(fromIdx, 1);
                entries.splice(toIdx, 0, moved);

                const newStore = {};
                for (const [k, v] of entries) {
                    newStore[k] = v;
                }
                hubPresetsStore = newStore;
                saveHubPresetsToStorage();
                updateAllHubNodes();
            },
            onExport: () => {
                const blob = new Blob([JSON.stringify(hubPresetsStore, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `comfyui_master_hub_presets_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast("📤 마스터 프리셋 JSON 백업 파일이 다운로드되었습니다.", "info");
            },
            onImport: (importedData) => {
                if (importedData && typeof importedData === "object") {
                    hubPresetsStore = { ...hubPresetsStore, ...importedData };
                    saveHubPresetsToStorage();
                    updateAllHubNodes();
                    showToast("📥 마스터 프리셋을 성공적으로 불러왔습니다!", "success");
                }
            },
        });

        // Real-time canvas selection watcher
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
            setupHubNodeWidgets(node);
        }
    },
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
            if (n && n !== hubNode && n.type !== "UniversalPresetHub") {
                selected.push(n);
            }
        }
    } else if (app.graph?._nodes) {
        for (const n of app.graph._nodes) {
            if (n.is_selected && n !== hubNode && n.type !== "UniversalPresetHub") {
                selected.push(n);
            }
        }
    }

    return selected;
}

/**
 * Configure Ultra-Streamlined 2-Row UI on UniversalPresetHub node
 */
function setupHubNodeWidgets(node) {
    node.size = [320, 130];
    if (!node.properties) node.properties = {};
    if (!node.properties.active_preset) node.properties.active_preset = "None";

    // 1. Row 1: Clickable Master Preset Selector Button -> Opens Grand Modal
    const presetBtn = node.addWidget("button", getPresetDisplayLabel(node), null, () => {
        showHubManageModal(node);
    });
    node._presetBtn = presetBtn;

    // 2. Row 2: Clean Save Button -> Opens Grand Modal directly with input focused!
    const saveBtn = node.addWidget("button", "💾 선택 노드 마스터 프리셋 저장", null, () => {
        const selectedNodes = getCurrentlySelectedNodes(node);
        if (selectedNodes.length === 0) {
            showToast("⚠️ 먼저 캔버스에서 묶고 싶은 노드들을 선택(Ctrl+클릭 / 드래그)해 주세요!", "warning");
            return;
        }

        const defaultName = `마스터 세팅 #${Object.keys(hubPresetsStore).length + 1}`;
        showHubManageModal(node, { focusSave: true, defaultName: defaultName });
    });
    node._saveBtn = saveBtn;

    // 3. Bottom Canvas Drawing (Status Display)
    const origDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        origDrawForeground?.apply(this, arguments);

        const selectedNodes = getCurrentlySelectedNodes(this);
        const count = selectedNodes.length;

        ctx.save();
        ctx.fillStyle = count > 0 ? "#38bdf8" : "#94a3b8";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";

        if (count > 0) {
            ctx.fillText(`🎯 캔버스 선택 감지: ${count}개 노드`, this.size[0] / 2, this.size[1] - 12);
        } else {
            ctx.fillText(`💡 캔버스에서 노드를 선택하세요 (Ctrl+클릭 / 드래그)`, this.size[0] / 2, this.size[1] - 12);
        }
        ctx.restore();
    };

    updateHubPresetButton(node);
}

function getPresetDisplayLabel(node) {
    const presetNames = Object.keys(hubPresetsStore);
    if (presetNames.length === 0) {
        return "🏷️ 마스터 프리셋: (없음) [클릭하여 관리] ▼";
    }

    const activeName = node?.properties?.active_preset && hubPresetsStore[node.properties.active_preset]
        ? node.properties.active_preset
        : presetNames[0];

    const presetData = hubPresetsStore[activeName];
    const nodeCount = presetData?.targets?.length || 0;

    return `🏷️ [${activeName}] (${nodeCount}개 노드) ▼`;
}

function updateHubPresetButton(node) {
    if (node._presetBtn) {
        node._presetBtn.name = getPresetDisplayLabel(node);
    }
}

/**
 * Save snapshot of all currently selected nodes with pos info
 */
export function saveMasterPresetFromSelection(hubNode, presetName) {
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

    hubPresetsStore[presetName] = {
        name: presetName,
        timestamp: Date.now(),
        targets: targetsData,
    };

    saveHubPresetsToStorage();
    if (hubNode) {
        hubNode.properties.active_preset = presetName;
    }
    updateAllHubNodes();
    app.graph?.setDirtyCanvas(true, true);
}

/**
 * Apply composite master preset data with Smart 3-Stage Matching
 * 1. Exact ID match (Same workflow)
 * 2. Exact Custom Title + NodeType match (Cross-workflow renamed nodes)
 * 3. Sequential 1:1 NodeType match ordered by relative canvas X position (Zero duplication)
 */
export function applyMasterPresetToWorkflow(presetData) {
    if (!presetData || !Array.isArray(presetData.targets)) {
        showToast("⚠️ 유효하지 않은 마스터 프리셋 데이터입니다.", "warning");
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

    if (graph._nodes) {
        for (const n of graph._nodes) {
            if (n.comfyClass === "UniversalPresetHub" || n.type === "UniversalPresetHub") {
                n.properties.active_preset = presetData.name;
                updateHubPresetButton(n);
            }
        }
    }

    graph.setDirtyCanvas(true, true);
    showToast(`✨ [${presetData.name}] 일괄 적용 완료 (총 ${appliedCount}개 노드 동기화)`, "gold");
}

/**
 * Update all Hub nodes on canvas
 */
export function updateAllHubNodes() {
    if (!app.graph?._nodes) return;

    for (const node of app.graph._nodes) {
        if (node.comfyClass === "UniversalPresetHub" || node.type === "UniversalPresetHub") {
            updateHubPresetButton(node);
        }
    }
    app.graph.setDirtyCanvas(true, true);
}

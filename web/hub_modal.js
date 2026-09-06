/**
 * ComfyUI Master Preset Hub Modal Controller
 * - Visual Preset Selection & Management Modal
 * - Live Dynamic Selected Nodes & Parameters Preview Box (Adaptive max-height: 55vh)
 * - Instant Apply (Zero blocking popups + Floating Glassmorphic Toast)
 * - Drag & Drop Preset Card Reordering (⠿) & Order Buttons (▲/▼)
 * - In-place Inline Title Rename (✏️ / Double Click)
 * - Accordion Deep Matrix Expand/Collapse (▼/▲)
 * - JSON Import/Export & Comprehensive Cross-Workflow Guide Sub-Modal
 */

import { app } from "../../scripts/app.js";
import { extractNodeState } from "./smart_presets.js";
import { showToast, showGuideModal } from "./presets_modal.js";

let hubModalElement = null;
let currentHubNode = null;
let onApplyMasterCallback = null;
let onSaveMasterCallback = null;
let onDeleteMasterCallback = null;
let onRenameMasterCallback = null;
let onReorderMasterCallback = null;
let onExportMasterCallback = null;
let onImportMasterCallback = null;
let getHubPresetsCallback = null;

// Track expanded state across master preset cards
const expandedHubState = new Set();

export function initHubModal(callbacks) {
    onApplyMasterCallback = callbacks.onApply;
    onSaveMasterCallback = callbacks.onSave;
    onDeleteMasterCallback = callbacks.onDelete;
    onRenameMasterCallback = callbacks.onRename;
    onReorderMasterCallback = callbacks.onReorder;
    onExportMasterCallback = callbacks.onExport;
    onImportMasterCallback = callbacks.onImport;
    getHubPresetsCallback = callbacks.getPresets;

    createHubModalDOM();
}

function createHubModalDOM() {
    const existing = document.getElementById("usp-hub-modal");
    if (existing) {
        existing.remove();
    }

    const backdrop = document.createElement("div");
    backdrop.id = "usp-hub-modal";
    backdrop.className = "usp-modal-backdrop";
    backdrop.innerHTML = `
        <div class="usp-modal-container">
            <div class="usp-modal-header">
                <div class="usp-header-title-box">
                    <div class="usp-header-icon gold">🌟</div>
                    <div>
                        <h3 class="usp-header-title">마스터 프리셋 관리자</h3>
                        <p class="usp-header-subtitle">마스터 프리셋은 <strong>현재 워크플로우에 저장</strong>됩니다 (다른 워크플로우 적용 시 하단 <strong>💡 주의사항 가이드</strong> 참조)</p>
                    </div>
                </div>
                <button class="usp-btn-close" id="usp-hub-btn-close" title="Close">✕</button>
            </div>

            <div class="usp-modal-body">
                <!-- Save Box with Dynamic Live Selection Preview -->
                <div class="usp-save-bar gold" id="usp-hub-save-box">
                    <div class="usp-save-input-row">
                        <input type="text" class="usp-input" id="usp-hub-name-input" placeholder="새 마스터 프리셋 이름 입력 (예: KREA2 Turbo 실사 세팅)..." />
                        <button class="usp-btn usp-btn-gold" id="usp-hub-btn-save">
                            <span>💾</span> 현재 선택 노드로 저장
                        </button>
                    </div>

                    <!-- Live Selected Nodes Preview Box (Adaptive height) -->
                    <div id="usp-hub-selected-preview-container">
                        <!-- Populated dynamically by renderSelectedNodesPreview -->
                    </div>
                </div>

                <!-- Presets List -->
                <div class="usp-presets-list" id="usp-hub-presets-container">
                    <!-- Master Preset cards -->
                </div>
            </div>

            <div class="usp-modal-footer">
                <div class="usp-footer-left">
                    <button class="usp-btn usp-btn-secondary" id="usp-hub-btn-export" title="Export to JSON">
                        <span>📤</span> 백업 (Export)
                    </button>
                    <button class="usp-btn usp-btn-secondary" id="usp-hub-btn-import" title="Import from JSON">
                        <span>📥</span> 불러오기 (Import)
                    </button>
                    <button class="usp-btn usp-btn-guide" id="usp-hub-btn-guide" title="타 워크플로우 적용 및 백업 주의사항 가이드">
                        <span>💡</span> 다른 워크플로우 적용/백업 가이드 (주의사항)
                    </button>
                    <input type="file" id="usp-hub-import-input" accept=".json" style="display: none;" />
                </div>
                <button class="usp-btn usp-btn-secondary" id="usp-hub-btn-done">닫기</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);
    hubModalElement = backdrop;

    // Events
    document.getElementById("usp-hub-btn-close").addEventListener("click", closeHubModal);
    document.getElementById("usp-hub-btn-done").addEventListener("click", closeHubModal);
    backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) closeHubModal();
    });

    document.getElementById("usp-hub-btn-save").addEventListener("click", handleSaveMaster);
    document.getElementById("usp-hub-name-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSaveMaster();
    });

    // Guide Modal
    document.getElementById("usp-hub-btn-guide").addEventListener("click", showGuideModal);

    // Export / Import
    document.getElementById("usp-hub-btn-export").addEventListener("click", () => {
        if (onExportMasterCallback) onExportMasterCallback();
    });

    const fileInput = document.getElementById("usp-hub-import-input");
    document.getElementById("usp-hub-btn-import").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file && onImportMasterCallback) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    onImportMasterCallback(data);
                    renderHubPresetList();
                    showToast("📥 마스터 프리셋을 성공적으로 불러왔습니다!", "success");
                } catch (err) {
                    showToast("⚠️ JSON 파일을 읽는 중 오류가 발생했습니다: " + err.message, "warning");
                }
            };
            reader.readAsText(file);
        }
        fileInput.value = "";
    });
}

/**
 * Get list of currently selected nodes on canvas
 */
function getSelectedNodes(hubNode) {
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
 * Extract human-readable summary of key parameters for a node
 */
function getNodeSummary(node) {
    const nodeType = node.comfyClass || node.type || "Node";
    const title = node.title || nodeType;
    const state = extractNodeState(node);
    const details = [];

    // 1. LoRA Stack (rgthree Power Lora Loader or multi-lora stacks)
    if (state._isLoraStack && Array.isArray(state.loras)) {
        const activeLoras = state.loras.filter(l => l && l.on !== false && l.lora && l.lora !== "None");
        if (activeLoras.length > 0) {
            activeLoras.forEach((l, idx) => {
                const name = String(l.lora).split(/[\/\\]/).pop().replace(/\.(safetensors|pt|ckpt)$/i, "");
                const str = l.strength !== undefined ? ` (${typeof l.strength === "number" ? l.strength.toFixed(2) : l.strength})` : "";
                details.push({
                    text: `LoRA #${idx + 1}: ${name}${str}`,
                    isLora: true
                });
            });
        } else {
            details.push({ text: `LoRA: 활성 항목 없음`, isLora: true });
        }
    }

    // 2. Scan standard widgets
    if (state.widgets) {
        for (const [key, val] of Object.entries(state.widgets)) {
            if (val === undefined || val === null || val === "" || typeof val === "function") continue;

            // Model / Checkpoint / VAE / CLIP / UNET
            if (/vae_name|ckpt_name|unet_name|model_name|clip_name|lora_name/i.test(key)) {
                const cleanVal = String(val).split(/[\/\\]/).pop();
                const label = key.replace(/_name$/i, "").toUpperCase();
                details.push({ text: `${label}: ${cleanVal}`, isCkpt: true });
            }
            // KSampler core settings
            else if (/^(steps|cfg|sampler_name|scheduler|denoise|seed)$/i.test(key)) {
                if (key === "seed" && Number(val) > 1000000) {
                    details.push({ text: `seed: ${String(val).slice(0, 8)}...` });
                } else {
                    details.push({ text: `${key}: ${val}` });
                }
            }
            // Prompt / Text
            else if (/^(text|prompt|string|text_positive|text_negative)$/i.test(key) && typeof val === "string") {
                const clean = val.replace(/\s+/g, " ").trim();
                if (clean) {
                    const shortText = clean.length > 40 ? clean.slice(0, 37) + "..." : clean;
                    details.push({ text: `텍스트: "${shortText}"` });
                }
            }
        }

        // Generic fallback for widgets
        if (details.length === 0) {
            const entries = Object.entries(state.widgets).filter(([k, v]) => typeof v !== "object" && typeof v !== "function");
            for (const [k, v] of entries.slice(0, 4)) {
                const strVal = String(v).split(/[\/\\]/).pop();
                const shortVal = strVal.length > 25 ? strVal.slice(0, 22) + "..." : strVal;
                details.push({ text: `${k}: ${shortVal}` });
            }
        }
    }

    if (details.length === 0) {
        details.push({ text: "기본 파라미터 연동" });
    }

    return {
        title,
        nodeType,
        details,
    };
}

/**
 * Render the live selected nodes & parameters preview box inside save area
 */
function renderSelectedNodesPreview(hubNode) {
    const container = document.getElementById("usp-hub-selected-preview-container");
    if (!container) return;

    const selectedNodes = getSelectedNodes(hubNode);
    const count = selectedNodes.length;

    if (count === 0) {
        container.innerHTML = `
            <div class="usp-selected-preview-box empty">
                <div class="usp-selected-preview-header">
                    <span class="usp-header-badge warning">⚠️ 선택된 노드 없음 (0개)</span>
                </div>
                <div class="usp-selected-empty-text">
                    캔버스에서 묶고 싶은 노드들을 마우스로 선택(<b>Ctrl + 클릭</b> 또는 <b>Shift + 드래그</b>)한 후 저장해 주세요.
                </div>
            </div>
        `;
        return;
    }

    const chipsHtml = selectedNodes.map(node => {
        const summary = getNodeSummary(node);
        const paramsHtml = summary.details.map(d => {
            const cls = d.isLora ? "usp-chip-param lora" : (d.isCkpt ? "usp-chip-param ckpt" : "usp-chip-param");
            return `<div class="${cls}" title="${escapeHtml(d.text)}">${escapeHtml(d.text)}</div>`;
        }).join("");

        return `
            <div class="usp-selected-node-chip">
                <div class="usp-chip-header">
                    <span class="usp-chip-icon">🎯</span>
                    <span class="usp-chip-title" title="${escapeHtml(summary.title)}">${escapeHtml(summary.title)}</span>
                    <span class="usp-chip-type" title="${escapeHtml(summary.nodeType)}">${escapeHtml(summary.nodeType)}</span>
                </div>
                <div class="usp-chip-details">
                    ${paramsHtml}
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div class="usp-selected-preview-box">
            <div class="usp-selected-preview-header">
                <div class="usp-preview-header-left">
                    <span class="usp-header-badge gold">🎯 저장 대상 노드: <strong>${count}개 선택됨</strong></span>
                </div>
                <span class="usp-selected-hint">※ 아래 노드들의 전체 세팅값이 하나의 마스터 세트로 스냅샷 저장됩니다</span>
            </div>
            <div class="usp-selected-nodes-grid">
                ${chipsHtml}
            </div>
        </div>
    `;
}

export function showHubManageModal(hubNode = null, options = {}) {
    if (!hubModalElement || !document.getElementById("usp-hub-modal")) {
        createHubModalDOM();
    }
    if (!hubNode && app.graph?._nodes) {
        hubNode = app.graph._nodes.find(n => n.type === "UniversalPresetHub" || n.comfyClass === "UniversalPresetHub") || null;
    }
    currentHubNode = hubNode;

    const nameInput = document.getElementById("usp-hub-name-input");
    const saveBox = document.getElementById("usp-hub-save-box");

    if (options.focusSave) {
        nameInput.value = options.defaultName || "";
        saveBox.style.boxShadow = "0 0 0 2px rgba(245, 158, 11, 0.6)";
        setTimeout(() => {
            nameInput.focus();
            nameInput.select();
        }, 80);
    } else {
        nameInput.value = "";
        saveBox.style.boxShadow = "none";
    }

    renderSelectedNodesPreview(hubNode);
    renderHubPresetList();
    hubModalElement.classList.add("active");
}

export function closeHubModal() {
    if (hubModalElement) {
        hubModalElement.classList.remove("active");
    }
    currentHubNode = null;
}

function handleSaveMaster() {
    if (!currentHubNode && app.graph?._nodes) {
        currentHubNode = app.graph._nodes.find(n => n.type === "UniversalPresetHub" || n.comfyClass === "UniversalPresetHub") || null;
    }
    if (!currentHubNode) return;

    const selectedNodes = getSelectedNodes(currentHubNode);
    if (selectedNodes.length === 0) {
        showToast("⚠️ 캔버스에서 먼저 노드들을 마우스로 선택(Ctrl+클릭 / 드래그)해 주세요!", "warning");
        return;
    }

    const input = document.getElementById("usp-hub-name-input");
    const name = input.value.trim();
    if (!name) {
        showToast("⚠️ 마스터 프리셋 이름을 입력해 주세요!", "warning");
        input.focus();
        return;
    }

    if (onSaveMasterCallback) {
        onSaveMasterCallback(currentHubNode, name);
        input.value = "";
        renderHubPresetList();
        renderSelectedNodesPreview(currentHubNode);
        showToast(`💾 [${name}] 마스터 프리셋이 저장되었습니다! (총 ${selectedNodes.length}개 노드)`, "gold");
    }
}

function renderHubPresetList() {
    const container = document.getElementById("usp-hub-presets-container");
    container.innerHTML = "";

    const presets = getHubPresetsCallback ? getHubPresetsCallback() : {};
    const presetNames = Object.keys(presets);

    if (presetNames.length === 0) {
        container.innerHTML = `
            <div class="usp-empty-notice">
                저장된 마스터 프리셋이 없습니다.<br>
                캔버스에서 노드들을 선택(Ctrl+클릭 or Shift+드래그) 후 위 입력창에 이름을 적고 저장해 보세요!
            </div>
        `;
        return;
    }

    presetNames.forEach((presetName, index) => {
        const presetData = presets[presetName];
        const card = createMasterPresetCard(presetName, presetData, index, presetNames.length);
        container.appendChild(card);
    });

    setupHubDragAndDrop(container);
}

function createMasterPresetCard(presetName, presetData, index, totalCount) {
    const card = document.createElement("div");
    card.className = "usp-preset-card hub-card";
    card.draggable = true;
    card.dataset.index = index;
    card.dataset.name = presetName;

    const isExpanded = expandedHubState.has(presetName);
    if (isExpanded) {
        card.classList.add("expanded");
    }

    const targets = presetData.targets || [];
    const previewHtml = generateTargetsPreview(targets);
    const deepMatrixHtml = generateMasterDeepMatrixHtml(targets);

    card.innerHTML = `
        <div class="usp-card-top">
            <div class="usp-preset-name-box">
                <span class="usp-drag-handle" title="드래그하여 순서 변경">⠿</span>
                <span class="usp-preset-icon">🌟</span>
                <span class="usp-preset-name-text" title="클릭하여 이름 수정">${escapeHtml(presetName)}</span>
                <span class="usp-preset-badge-tag">${targets.length}개 노드 연동</span>
            </div>
            <div class="usp-card-actions">
                <!-- Reorder buttons -->
                <button class="usp-btn usp-btn-order" data-action="up" title="위로 이동" ${index === 0 ? "disabled" : ""}>▲</button>
                <button class="usp-btn usp-btn-order" data-action="down" title="아래로 이동" ${index === totalCount - 1 ? "disabled" : ""}>▼</button>
                
                <button class="usp-btn usp-btn-expand ${isExpanded ? "active" : ""}" data-action="toggle-expand" title="상세 정보 펼치기/접기">
                    <span class="usp-expand-icon">▼</span> ${isExpanded ? "접기" : "상세 보기"}
                </button>
                <button class="usp-btn usp-btn-apply" data-action="apply">
                    <span>▶</span> 일괄 적용
                </button>
                <button class="usp-btn usp-btn-secondary" data-action="rename" title="이름 수정">
                    <span>✏️</span>
                </button>
                <button class="usp-btn usp-btn-danger" data-action="delete" title="삭제">
                    <span>🗑️</span>
                </button>
            </div>
        </div>
        <div class="usp-preview-box">
            ${previewHtml}
        </div>
        <div class="usp-card-expanded-content">
            ${deepMatrixHtml}
        </div>
    `;

    // 1. Instant Apply (Closes modal immediately + Non-blocking Toast)
    card.querySelector('[data-action="apply"]').addEventListener("click", () => {
        closeHubModal();
        if (onApplyMasterCallback) {
            onApplyMasterCallback(presetName, presetData);
        }
    });

    // 2. Expand / Collapse Toggle
    const expandBtn = card.querySelector('[data-action="toggle-expand"]');
    expandBtn.addEventListener("click", () => {
        if (expandedHubState.has(presetName)) {
            expandedHubState.delete(presetName);
            card.classList.remove("expanded");
            expandBtn.classList.remove("active");
            expandBtn.innerHTML = '<span class="usp-expand-icon">▼</span> 상세 보기';
        } else {
            expandedHubState.add(presetName);
            card.classList.add("expanded");
            expandBtn.classList.add("active");
            expandBtn.innerHTML = '<span class="usp-expand-icon">▼</span> 접기';
        }
    });

    // 3. Inline Rename (No prompt popups!)
    const titleSpan = card.querySelector(".usp-preset-name-text");
    const renameBtn = card.querySelector('[data-action="rename"]');

    const triggerInlineRename = () => {
        startMasterInlineRename(card, presetName, (newName) => {
            if (onRenameMasterCallback) {
                onRenameMasterCallback(presetName, newName);
                if (expandedHubState.has(presetName)) {
                    expandedHubState.delete(presetName);
                    expandedHubState.add(newName);
                }
                renderHubPresetList();
                showToast(`✏️ 마스터 프리셋 이름이 [${newName}] (으)로 변경되었습니다.`, "gold");
            }
        });
    };

    renameBtn.addEventListener("click", triggerInlineRename);
    titleSpan.addEventListener("dblclick", triggerInlineRename);

    // 4. Reorder Up / Down
    card.querySelector('[data-action="up"]').addEventListener("click", () => {
        if (onReorderMasterCallback && index > 0) {
            onReorderMasterCallback(index, index - 1);
            renderHubPresetList();
            showToast("↕️ 마스터 프리셋 순서가 변경되었습니다.", "gold");
        }
    });

    card.querySelector('[data-action="down"]').addEventListener("click", () => {
        if (onReorderMasterCallback && index < totalCount - 1) {
            onReorderMasterCallback(index, index + 1);
            renderHubPresetList();
            showToast("↕️ 마스터 프리셋 순서가 변경되었습니다.", "gold");
        }
    });

    // 5. Delete
    card.querySelector('[data-action="delete"]').addEventListener("click", () => {
        if (confirm(`'${presetName}' 마스터 프리셋을 정말 삭제하시겠습니까?`)) {
            if (onDeleteMasterCallback) {
                onDeleteMasterCallback(presetName);
                expandedHubState.delete(presetName);
                renderHubPresetList();
                showToast(`🗑️ [${presetName}] 마스터 프리셋이 삭제되었습니다.`, "warning");
            }
        }
    });

    return card;
}

/**
 * Inline Rename for Master Presets
 */
function startMasterInlineRename(card, oldName, onSave) {
    const nameBox = card.querySelector(".usp-preset-name-box");
    const titleSpan = card.querySelector(".usp-preset-name-text");
    if (!nameBox || !titleSpan) return;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "usp-inline-edit-input gold";
    input.value = oldName;

    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    let isFinished = false;

    const finishEdit = (shouldSave) => {
        if (isFinished) return;
        isFinished = true;

        const newName = input.value.trim();
        if (shouldSave && newName && newName !== oldName) {
            onSave(newName);
        } else {
            input.replaceWith(titleSpan);
        }
    };

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            finishEdit(true);
        } else if (e.key === "Escape") {
            finishEdit(false);
        }
    });

    input.addEventListener("blur", () => {
        finishEdit(true);
    });
}

/**
 * Setup Drag and Drop for Master Preset Cards
 */
function setupHubDragAndDrop(container) {
    let draggedCard = null;

    container.querySelectorAll(".usp-preset-card").forEach((card) => {
        card.addEventListener("dragstart", (e) => {
            draggedCard = card;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", card.dataset.index);
            card.classList.add("dragging");
        });

        card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            container.querySelectorAll(".usp-preset-card").forEach((c) => {
                c.classList.remove("drag-over-top", "drag-over-bottom");
            });
            draggedCard = null;
        });

        card.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (!draggedCard || draggedCard === card) return;

            const rect = card.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            if (e.clientY < midpoint) {
                card.classList.add("drag-over-top");
                card.classList.remove("drag-over-bottom");
            } else {
                card.classList.add("drag-over-bottom");
                card.classList.remove("drag-over-top");
            }
        });

        card.addEventListener("dragleave", () => {
            card.classList.remove("drag-over-top", "drag-over-bottom");
        });

        card.addEventListener("drop", (e) => {
            e.preventDefault();
            card.classList.remove("drag-over-top", "drag-over-bottom");
            if (!draggedCard || draggedCard === card) return;

            const fromIndex = parseInt(draggedCard.dataset.index, 10);
            const toIndex = parseInt(card.dataset.index, 10);

            if (onReorderMasterCallback && fromIndex !== toIndex) {
                onReorderMasterCallback(fromIndex, toIndex);
                renderHubPresetList();
                showToast("↕️ 마스터 프리셋 순서가 변경되었습니다.", "gold");
            }
        });
    });
}

function generateTargetsPreview(targets) {
    if (!targets || targets.length === 0) {
        return '<span class="usp-tag">연동된 노드 없음</span>';
    }

    return targets.map(t => {
        const title = t.title || t.nodeType || "Node";
        let detail = "";

        if (t.state?._isLoraStack && Array.isArray(t.state.loras)) {
            const activeCount = t.state.loras.filter(l => l && l.on !== false && l.lora && l.lora !== "None").length;
            detail = `LoRA ${activeCount || t.state.loras.length}종`;
        } else if (t.state?.widgets) {
            const keys = Object.keys(t.state.widgets);
            if (keys.length > 0) {
                const sampleVal = String(t.state.widgets[keys[0]] ?? "").split(/[\/\\]/).pop();
                detail = sampleVal.length > 14 ? sampleVal.slice(0, 12) + "..." : sampleVal;
            }
        }

        return `<span class="usp-tag usp-tag-node"><span class="usp-tag-node-title">${escapeHtml(title)}</span>${detail ? ` <span class="usp-tag-node-detail">(${escapeHtml(detail)})</span>` : ""}</span>`;
    }).join("");
}

function generateMasterDeepMatrixHtml(targets) {
    if (!targets || targets.length === 0) {
        return '<div class="usp-empty-notice">연동된 노드 세부 정보가 없습니다.</div>';
    }

    const nodeBoxes = targets.map(t => {
        const title = t.title || t.nodeType || "Node";
        const nodeType = t.nodeType || "Unknown";
        const params = [];

        // LoRAs
        if (t.state?._isLoraStack && Array.isArray(t.state.loras)) {
            t.state.loras.forEach((l, idx) => {
                const name = String(l.lora || "None").split(/[\/\\]/).pop();
                const str = l.strength !== undefined ? l.strength : 1.0;
                const stateIcon = l.on === false ? "⚪" : "🟣";
                params.push(`
                    <div class="usp-expanded-param-item usp-lora-row">
                        <span class="usp-lora-idx">${stateIcon} #${idx + 1}</span>
                        <span class="usp-lora-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                        <span class="usp-lora-weight">${str}</span>
                    </div>
                `);
            });
        }

        // Widgets
        if (t.state?.widgets) {
            for (const [key, val] of Object.entries(t.state.widgets)) {
                if (key.startsWith("_") || typeof val === "object" || typeof val === "function") continue;
                let displayVal = String(val);
                if (/ckpt_name|model_name|vae_name|clip_name|unet_name|lora_name/i.test(key)) {
                    displayVal = displayVal.split(/[\/\\]/).pop();
                }
                params.push(`
                    <div class="usp-expanded-param-item">
                        <span class="usp-param-key">${escapeHtml(key)}:</span>
                        <span class="usp-param-val">${escapeHtml(displayVal)}</span>
                    </div>
                `);
            }
        }

        if (params.length === 0) {
            params.push('<div class="usp-expanded-param-item"><span class="usp-param-key">기본 설정값 연동</span></div>');
        }

        return `
            <div class="usp-expanded-node-box">
                <div class="usp-expanded-node-title">
                    <span>${escapeHtml(title)}</span>
                    <span class="usp-expanded-node-type">${escapeHtml(nodeType)}</span>
                </div>
                <div class="usp-expanded-params-list">
                    ${params.join("")}
                </div>
            </div>
        `;
    }).join("");

    return `
        <div style="font-weight: 700; color: #f1f5f9; margin-bottom: 12px; font-size: 0.94rem;">📋 연동 노드별 상세 파라미터 매트릭스:</div>
        <div class="usp-expanded-grid">
            ${nodeBoxes}
        </div>
    `;
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

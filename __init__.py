"""
ComfyUI Universal Smart Presets & Master Preset Hub
- Web Extension directory mapping (web/)
- Master Preset Hub custom node (Streamlined UI)
- Backend JSON persistence API endpoints (/universal_presets/...)
"""

import os
import json
from aiohttp import web
from server import PromptServer

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PRESETS_FILE = os.path.join(CURRENT_DIR, "presets_data.json")
HUB_PRESETS_FILE = os.path.join(CURRENT_DIR, "hub_presets_data.json")

# --- Master Preset Hub Node Definition (Clean & Streamlined) ---

class UniversalPresetHub:
    """
    🌟 Universal Preset Hub (마스터 프리셋 허브)
    선 연결 없이 워크플로우 내 여러 노드(모델, LoRA, 샘플러, CLIP, VAE 등)의 설정을
    하나의 마스터 프리셋으로 묶어 일괄 저장 및 일괄 적용하는 무선 컨트롤러 노드입니다.
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "UniversalPresets"
    OUTPUT_NODE = True

    def execute(self, **kwargs):
        return ()


# Export custom nodes & web directory
WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {
    "UniversalPresetHub": UniversalPresetHub
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "UniversalPresetHub": "🌟 Universal Preset Hub (마스터 프리셋 허브)"
}

__all__ = ["WEB_DIRECTORY", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]


# --- Backend Persistence API (Global Node Presets Only) ---

@PromptServer.instance.routes.get("/universal_presets/load")
async def load_presets_handler(request):
    """Load global node presets from backend JSON file."""
    try:
        data = {}
        if os.path.exists(PRESETS_FILE):
            with open(PRESETS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        return web.json_response({"success": True, "presets": data, "hub_presets": {}})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.post("/universal_presets/save")
async def save_presets_handler(request):
    """Save global node presets to backend JSON file."""
    try:
        body = await request.json()
        if "presets" in body:
            with open(PRESETS_FILE, "w", encoding="utf-8") as f:
                json.dump(body["presets"], f, ensure_ascii=False, indent=2)
        return web.json_response({"success": True, "message": "Global presets saved successfully"})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

print("\033[34m[Universal Smart Presets]\033[0m Master Preset Hub & Extension Ready.")

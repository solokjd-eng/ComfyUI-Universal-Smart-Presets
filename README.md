# 🌟 ComfyUI Universal Smart Presets & Master Hub

ComfyUI의 모든 단일 노드 및 다중 노드 묶음을 위한 **차세대 스마트 프리셋 관리 확장 기능(Custom Node)**입니다.
개별 노드별 **글로벌 프리셋(Global Presets)**과 여러 노드를 하나로 묶어 다루는 **마스터 허브(Universal Preset Hub)**를 동시에 제공합니다.

---

## ✨ 주요 핵심 기능 (Key Features)

### 1. 🌐 글로벌 프리셋 관리자 (Global Node Presets)
* **모든 노드 자동 지원**: KSampler, Checkpoint Loader, VAE Loader, CLIP Text Encode, LoRA Loader 등 모든 커스텀 노드 지원
* **동적 LoRA 스택 완벽 지원**: `Power Lora Loader (rgthree)`의 다중 LoRA 목록, 가중치, 온/오프 상태까지 무손실 저장/복원
* **선택적 파라미터 On/Off 제어**:
  * 접힌 상태의 파라미터 알약 태그(Pill)를 클릭하여 특정 옵션(예: `seed`)만 제외(OFF) 가능
  * 적용 시 OFF된 옵션은 현재 캔버스 노드의 고유 값을 건드리지 않고 완벽히 보존
* **양방향 실시간 동기화 (Two-Way Sync)**:
  * 접힌 상태의 태그 On/Off ↔ 상세 보기 스위치가 100% 실시간 연동
* **인라인 파라미터 에디팅 & 위젯 자동 감지**:
  * **숫자 스텝퍼 (`[-] [수치] [+]`)**: 브라우저 기본 화살표를 대체하여 클릭 한 번으로 값 조절
  * **드롭다운 자동 감지**: 시스템에 설치된 체크포인트/LoRA/샘플러/스케줄러 목록 자동 연동
* **1.5배 대형화 Pro Dark UI**: 시원하고 가독성 높은 다크 글래스모피즘 테마

---

### 2. 🏷️ 마스터 허브 관리자 (`UniversalPresetHub`)
* **다중 노드 묶음 프리셋**: 캔버스에서 여러 개의 노드를 선택(드래그/Ctrl+클릭)하여 하나의 마스터 프리셋으로 통째로 저장
* **스마트 3단계 노드 매칭 (타 워크플로우 100% 완벽 호환)**:
  1. `node.id` 고유 번호 매칭 (동일 워크플로우)
  2. `Title + NodeType` 사용자 정의 제목 매칭 (타 워크플로우)
  3. `Left-to-Right` 캔버스 좌우 배치 순서 1:1 순차 배정 (중복 배정 원천 차단)
* **초슬림 2줄 캔버스 인터페이스**:
  * Row 1: `🏷️ [마스터 프리셋 선택] ▼` (클릭 시 마스터 관리창 오픈)
  * Row 2: `💾 선택 노드 마스터 프리셋 저장` (선택된 노드 즉시 저장창 오픈)

---

### 3. 🛡️ 안전한 백업 & 공유 (Backup & Import/Export)
* **단일 JSON 백업 (Export)**: 언제든지 저장된 모든 프리셋을 단일 `.json` 파일로 추출
* **가져오기 (Import)**: 다른 PC나 새로운 워크플로우에서 JSON을 불러오면 기존 목록과 안전하게 자동 병합(Merge)
* **내장 가이드 모달**: 타 워크플로우 적용 및 다중 동일 노드 사용 시 제목 지정 꿀팁 안내

---

## 🚀 설치 방법 (Installation)

1. ComfyUI의 `custom_nodes` 디렉토리에 클론 또는 복사합니다:
   ```bash
   cd ComfyUI/custom_nodes
   git clone https://github.com/solokjd-eng/ComfyUI-Universal-Smart-Presets.git
   ```
2. ComfyUI를 재시작하고 웹 브라우저에서 `Ctrl + F5`로 새로고침합니다.

---

## 📂 파일 구조 (File Structure)

```text
ComfyUI-Universal-Smart-Presets/
├── __init__.py               # ComfyUI 백엔드 API & 허브 노드 등록
├── README.md                 # 설명 문서
├── js/                       # 프론트엔드 웹 확장 스크립트
│   ├── smart_presets.js      # 글로벌 프리셋 & 지붕 배지 엔드포인트
│   ├── presets_modal.js      # 글로벌 프리셋 모달 UI & 스텝퍼
│   ├── presets_modal.css     # Pro Dark 1.5x 대형화 스타일시트
│   ├── hub_node.js           # 마스터 허브 노드 & 3단계 매칭 엔진
│   └── hub_modal.js          # 마스터 허브 전용 관리 모달창
└── web/                      # 웹 확장 배포 디렉토리
```

---

## 📄 License
MIT License

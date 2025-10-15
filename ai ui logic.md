
### Layout Transformation

**Current (Nissan Micra):**
```
┌─────────────────────────────────┐
│  Header                          │  ← 8%
├─────────────────────────────────┤
│                                  │
│  Content (requires scroll)       │  ← 67%
│                                  │
├─────────────────────────────────┤
│  Model Tray (HUGE)               │  ← 25%
└─────────────────────────────────┘
```

**Target (Ferrari):**
```
┌─────────────────────────────────┐
│  Minimal Header + Inline Models  │  ← 6%
├─────────────────────────────────┤
│                                  │
│  Primary Response (75% height)   │
│  ┌─────────────┬──────────────┐ │
│  │ Synthesis   │  Ensemble    │ │  ← 75%
│  │             │              │ │
│  └─────────────┴──────────────┘ │
│                                  │
│  [Show Sources ▼] (collapsed)    │  ← 2%
├─────────────────────────────────┤
│  Inline Input (subtle)           │  ← 8%
└─────────────────────────────────┘
```

---

## 🔧 Specific Changes

### Change 1: **Collapse Model Tray into Header**

**Replace this monstrosity:**
```
Models: [ChatGPT ✓] [Claude ✓] [Gemini ✓] [Qwen]
⭐ Synthesis: [ChatGPT] [Claude] [Gemini]
🎯 Ensemble: □ Enable Ensemble
   Ensemble Provider: [ChatGPT] [Claude] [Gemini]
🤔 Think (ChatGPT): OFF
```

**With this minimal inline control:**
```
┌────────────────────────────────────────────────────┐
│ ⚡ Sidecar    [○ Claude ○ Gemini ○ GPT]  ⭐Claude  │
└────────────────────────────────────────────────────┘
```

**Interaction:**
- Click model circles → toggle on/off (glows when active)
- Click ⭐ → cycles through synthesis providers (Claude → Gemini → GPT → OFF)
- Hover shows tooltips: "Synthesis: Claude" or "Synthesis: Off"
- No separate tray. Everything inline.

---

### Change 2: **Grid Layout for Primary Responses**

**Current:** no smart box 
**Problem:** Forces scrolling, can't compare side-by-side

**Solution:** Side-by-side grid with **smart sizing**

```css
.response-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  height: calc(100vh - 180px); /* Leave room for header + input */
  padding: 16px;
}

.synthesis-panel,
.ensemble-panel {
  overflow-y: auto;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  padding: 24px;
}
```

**Visual:**
```
┌──────────────────┬──────────────────┐
│ SYNTHESIS        │ ENSEMBLE         │
│                  │                  │
│ Claude's unified │ ChatGPT's        │
│ answer from all  │ decision map     │
│ three models...  │ showing paths... │
│                  │                  │
│ [scrollable]     │ [scrollable]     │
│                  │                  │
└──────────────────┴──────────────────┘
```

---

### Change 3: **Batch Sources = Collapsed by Default**

**Current:** "Show Sources" button that expands inline
**Problem:** Pushes synthesis/ensemble up when expanded

**Solution:** Slide-out drawer from bottom (like iOS Control Center)

```typescript
const [sourcesOpen, setSourcesOpen] = useState(false);

<div className="sources-drawer" data-open={sourcesOpen}>
  <button onClick={() => setSourcesOpen(!sourcesOpen)}>
    {sourcesOpen ? '▼ Hide' : '▲ Sources'} (3)
  </button>
  
  {sourcesOpen && (
    <div className="sources-grid">
      {/* ChatGPT, Claude, Gemini cards */}
    </div>
  )}
</div>
```

**CSS:**
```css
.sources-drawer {
  position: fixed;
  bottom: 80px; /* Above input */
  left: 0;
  right: 0;
  background: rgba(10, 10, 25, 0.98);
  backdrop-filter: blur(20px);
  transform: translateY(100%);
  transition: transform 0.3s ease;
  max-height: 40vh;
  overflow-y: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.sources-drawer[data-open="true"] {
  transform: translateY(0);
}
```

**Why this works:**
- Doesn't shift layout when opened
- Still accessible (one click)
- Sources are secondary info, not primary

---

### Change 4: **Input Bar = Always Visible, Minimal**

**Current:** Large input box with "System • 3" badge
**Problem:** Takes too much space, feels heavy

**Solution:** macOS Spotlight-style floating input

```css
.input-bar {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: min(800px, calc(100% - 32px));
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.input-bar input {
  flex: 1;
  background: none;
  border: none;
  color: #e2e8f0;
  font-size: 15px;
}

.input-bar button {
  background: linear-gradient(45deg, #6366f1, #8b5cf6);
  border-radius: 16px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
}
```

---

### Change 5: **Visual Hierarchy Through Typography**

**Current:** Everything is same font size
**Fix:** Scale by importance

```css
/* Synthesis/Ensemble content */
.primary-response {
  font-size: 16px;
  line-height: 1.7;
  letter-spacing: 0.01em;
}

/* Batch sources (less important) */
.source-card {
  font-size: 14px;
  line-height: 1.6;
  opacity: 0.9;
}

/* Headers */
.response-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.5;
}
```

---

## 🎨 Color & Atmosphere Refinement

**Current:** Purple gradients everywhere
**Problem:** Feels "startup-y", not serious

**Singularity palette:**
```css
:root {
  --bg-primary: #0a0a19;
  --bg-elevated: rgba(255, 255, 255, 0.03);
  --border: rgba(255, 255, 255, 0.08);
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --accent: #6366f1; /* Use sparingly */
  --accent-soft: rgba(99, 102, 241, 0.1);
}
```

**Where to use accent (purple):**
- Send button only
- Active model indicators
- Synthesis ⭐ when enabled

**Where NOT to use accent:**
- Backgrounds
- Borders
- Headers

---

## 📐 Before/After Comparison

### Current Experience:
1. User sends prompt
2. Scrolls down to see model tray
3. Scrolls back up to see synthesis
4. Clicks "Show Sources" → everything shifts
5. Scrolls to read sources
6. Loses context of synthesis/ensemble

### Ferrari Experience:
1. User sends prompt
2. **Sees synthesis + ensemble simultaneously**
3. Compares side-by-side without scrolling
4. Optionally opens sources drawer (doesn't shift layout)
5. Types follow-up in persistent input bar
6. Never loses context

---

## 🚀 Implementation Priority

### Phase 1: Breathing Room
- [ ] Collapse model tray into header
- [ ] Make input bar floating/minimal
- [ ] Increase synthesis/ensemble font size to 16px

**Impact:** Immediate 40% more content visible

### Phase 2: Grid Layout
- [ ] Side-by-side synthesis/ensemble
- [ ] Fixed height with internal scroll
- [ ] Remove vertical stacking

**Impact:** Can see both responses without scrolling

### Phase 3: Sources Drawer 
- [ ] Bottom slide-up drawer for batch sources
- [ ] Collapsed by default
- [ ] Doesn't shift layout when opened

**Impact:** Clean primary view, sources on-demand

### Phase 4: Polish 
- [ ] Refine color palette (less purple)
- [ ] Typography scale (11px → 16px range)
- [ ] Subtle animations (ease-out only)

---

## 💬 The "Feel" You're Targeting

**Current:** Feature demo (look at all these buttons!)
**Target:** Native OS app (it just works)

**Inspiration:**
- **macOS Spotlight:** Minimal input, instant results
- **Linear:** Clean grid, no chrome, content-first
- **Raycast:** Keyboard-driven, no UI noise

The product should feel like **you're thinking with multiple brains**, not **configuring settings**.

---


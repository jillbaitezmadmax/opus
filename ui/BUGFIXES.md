# Critical Bug Fixes - Phase 1 Post-Launch

## Issues Reported

1. ✅ **Layout Overflow** - Canvas and controls cut off at viewport edge
2. ✅ **Save Dialog UX** - No visual feedback, doesn't auto-close
3. ⚠️ **Documents Panel Crash** - Blue screen on opening panel
4. ⚠️ **Document Persistence** - Documents not saving to IndexedDB
5. ⚠️ **Ghost Deletion** - Ghosts persist after removal and refresh
6. ⚠️ **Drag Offset** - Dragged item position doesn't match cursor
7. ✅ **Dropzone Size** - Only top 1/4 of canvas was droppable
8. ✅ **CSS Warning** - borderColor vs borderRight conflict
9. ⏳ **HorizontalChatRail** - Synthesis/map responses show wrong content (deferred to Phase 2)

## Fixes Applied

### 1. Layout Overflow ✅
**Problem**: Grid layout with `minmax(350px, 500px)` and `gap: 12px` caused horizontal overflow.

**Fix**: 
- Changed grid to fixed `400px` for Reference Zone
- Removed gap between columns (`gap: 0`)
- Removed outer padding on main container
- Added `overflow: hidden` to grid container

**Files**: `ComposerMode.tsx`

### 2. Save Dialog UX ✅
**Problem**: Save button had no visual feedback, dialog didn't close after save.

**Fix**:
- Added `transform: scale(0.95)` on button press
- Added `transition: all 0.15s ease` for smooth animation
- Added `setTimeout` to auto-close dialog 300ms after successful save
- Moved `setIsSaving(false)` inside timeout to prevent flicker

**Files**: `SaveDialog.tsx`, `ComposerMode.tsx`

### 3. Dropzone Size ✅
**Problem**: Canvas dropzone only covered top portion of editor.

**Fix**:
- Added `width: '100%'` to canvas container
- Added `boxSizing: 'border-box'` to prevent overflow
- Ensured dropzone div matches full canvas height

**Files**: `CanvasEditorV2.tsx`

### 4. CSS Warning ✅
**Problem**: React warning about mixing `borderColor` and `borderRight` shorthand properties.

**Fix**:
- Removed `borderRight: 'none'` from RefineButton
- Kept only `borderColor` property
- Border handled by adjacent button's `borderLeft`

**Files**: `RefineButton.tsx`

### 5. Drag Offset ⚠️ IN PROGRESS
**Problem**: Dragged item appears far from cursor position.

**Fix Applied**:
- Added activation constraints to DnD sensors:
  - `MouseSensor`: 5px distance threshold
  - `TouchSensor`: 100ms delay, 5px tolerance
- This prevents accidental drags and improves cursor tracking

**Files**: `ComposerMode.tsx`

**Note**: DnD Kit uses transform-based positioning. If offset persists, may need custom DragOverlay positioning.

### 6. Documents Panel Crash ⚠️ IN PROGRESS
**Problem**: Blue screen (likely React error boundary) when opening Documents panel.

**Root Cause Analysis**:
- `DocumentsHistoryPanel` created new `EnhancedDocumentStore()` instance
- Should use singleton `enhancedDocumentStore` instead
- Type mismatch in `listDocuments()` - expected `createdAt` and `updatedAt` but got `lastModified`

**Fix Applied**:
- Removed `new EnhancedDocumentStore()` instantiation
- Use singleton import `enhancedDocumentStore`
- Map `lastModified` to both `createdAt` and `updatedAt`
- Added better error messages with actual error text

**Files**: `DocumentsHistoryPanel.tsx`

### 7. Document Persistence ⚠️ INVESTIGATING
**Problem**: Documents not appearing in IndexedDB stores.

**Possible Causes**:
1. `DocumentManager` API mismatch - ComposerMode uses wrong signature
2. Persistence layer not initialized
3. Feature flags disabled
4. Extension bridge not connected

**Investigation Needed**:
- Check if `documentManager` prop is actually passed to ComposerMode
- Verify `PERSISTENCE_FEATURE_FLAGS` settings
- Check browser console for persistence errors
- Inspect IndexedDB in DevTools for `documents` store

**Current Code**:
```typescript
// ComposerMode expects DocumentManager but may not receive it
const handleSave = async (title: string) => {
  if (!documentManager || !sessionId) return; // May be returning early
  // ...
  await documentManager.createDocument(title, sessionId, parsedContent);
}
```

### 8. Ghost Deletion ⚠️ INVESTIGATING
**Problem**: Ghosts remain in storage after deletion and page refresh.

**Possible Causes**:
1. `deleteGhost` not actually deleting from IndexedDB
2. Ghost IDs not matching between UI and storage
3. Persistence bridge method not implemented
4. Cache not clearing after deletion

**Investigation Needed**:
- Check if `extensionBridge.deleteGhost()` is implemented
- Verify ghost IDs in storage vs UI state
- Check if ghosts are being re-loaded from wrong document

**Current Code**:
```typescript
const handleUnpinGhost = async (ghostId: string) => {
  if (PERSISTENCE_FEATURE_FLAGS.ENABLE_GHOST_RAIL) {
    await enhancedDocumentStore.deleteGhost(ghostId); // May be failing silently
  }
  setPinnedGhosts(prev => prev.filter(g => g.id !== ghostId));
};
```

## Next Steps

### Immediate (Critical)
1. **Verify DocumentManager Integration**
   - Check if `documentManager` prop is passed to ComposerMode
   - Add console.log to see if save path is reached
   - Check IndexedDB `documents` store manually

2. **Test Ghost Deletion**
   - Add console.log in `deleteGhost` to verify it's called
   - Check IndexedDB `ghosts` store before/after deletion
   - Verify ghost IDs match

3. **Test Documents Panel**
   - Reload extension and test opening Documents panel
   - Check for React error in console
   - Verify error boundary doesn't trigger

### Phase 2 (Deferred)
- Fix HorizontalChatRail synthesis/map response loading
- Replace HorizontalChatRail with NavigatorBar
- Add hover preview and click-to-jump

## Testing Checklist

- [ ] Save document → check IndexedDB `documents` store
- [ ] Load document → verify content appears in editor
- [ ] Pin segment → check IndexedDB `ghosts` store
- [ ] Delete pin → verify removed from IndexedDB
- [ ] Refresh page → verify pins reload correctly
- [ ] Open Documents panel → no crash
- [ ] Drag segment → cursor tracks correctly
- [ ] Drop on canvas → full canvas is droppable
- [ ] Click Save button → visual feedback + auto-close

## Known Limitations

1. **Persistence Dependency**: All features require extension bridge connection
2. **No Offline Mode**: In-memory fallback loses data on refresh
3. **Error Handling**: Silent failures in persistence layer
4. **Type Safety**: Some `any` types in persistence bridge calls

## Recommendations

1. **Add Persistence Status Indicator**: Show user if persistence is working
2. **Better Error Messages**: Surface persistence errors to UI
3. **Retry Logic**: Auto-retry failed persistence operations
4. **Validation**: Validate document/ghost data before save
5. **Migration Path**: Handle schema changes gracefully

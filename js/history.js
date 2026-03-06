/**
 * history.js - Undo/Redo stack using state snapshots
 */

const History = (() => {
  const MAX_HISTORY = 100;
  let undoStack = [];
  let redoStack = [];
  let _onChange = null;

  /** Save a snapshot of the current state */
  function push() {
    const state = Model.getState();
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    // Clear redo stack on new action
    redoStack = [];
    if (_onChange) _onChange();
  }

  /** Undo: restore previous state */
  function undo() {
    if (undoStack.length === 0) return false;
    // Save current state to redo
    redoStack.push(JSON.stringify(Model.getState()));
    // Restore previous
    const prev = JSON.parse(undoStack.pop());
    Model.setState(prev);
    if (_onChange) _onChange();
    return true;
  }

  /** Redo: restore next state */
  function redo() {
    if (redoStack.length === 0) return false;
    // Save current state to undo
    undoStack.push(JSON.stringify(Model.getState()));
    // Restore next
    const next = JSON.parse(redoStack.pop());
    Model.setState(next);
    if (_onChange) _onChange();
    return true;
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  /** Clear history */
  function clear() {
    undoStack = [];
    redoStack = [];
    if (_onChange) _onChange();
  }

  /** Set callback for when history changes */
  function onChange(fn) {
    _onChange = fn;
  }

  return {
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
    onChange
  };
})();

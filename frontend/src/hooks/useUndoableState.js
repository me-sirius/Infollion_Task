import { useCallback, useRef, useState } from 'react';

// useUndoableState: small undo/redo stack on top of useState.
// API: { state, set, undo, redo, canUndo, canRedo, reset }.
export function useUndoableState(initial) {
  const [state, setState] = useState(initial);
  // History and index live in refs so callbacks can mutate them, but we mirror
  // them as state so canUndo/canRedo can be safely read during render.
  const historyRef = useRef([initial]);
  const indexRef = useRef(0);
  const [historyLength, setHistoryLength] = useState(1);
  const [historyIndex, setHistoryIndex] = useState(0);

  const set = useCallback((next) => {
    setState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      const trimmed = historyRef.current.slice(0, indexRef.current + 1);
      trimmed.push(value);
      historyRef.current = trimmed;
      indexRef.current = trimmed.length - 1;
      setHistoryLength(trimmed.length);
      setHistoryIndex(trimmed.length - 1);
      return value;
    });
  }, []);

  const undo = useCallback(() => {
    if (indexRef.current === 0) return;
    indexRef.current -= 1;
    setHistoryIndex(indexRef.current);
    setState(historyRef.current[indexRef.current]);
  }, []);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current += 1;
    setHistoryIndex(indexRef.current);
    setState(historyRef.current[indexRef.current]);
  }, []);

  const reset = useCallback((value) => {
    historyRef.current = [value];
    indexRef.current = 0;
    setHistoryLength(1);
    setHistoryIndex(0);
    setState(value);
  }, []);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLength - 1;

  return { state, set, undo, redo, canUndo, canRedo, reset };
}

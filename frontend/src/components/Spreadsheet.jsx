import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cellId,
  COL_LABELS,
  computeSheet,
  displayValue,
  isValidCellId,
  MAX_COLS,
  MAX_ROWS,
} from '../utils/formulaEngine';
import { useUndoableState } from '../hooks/useUndoableState';
import { Cell } from './Cell';

export function Spreadsheet() {
  const {
    state: cells,
    set: setCells,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  } = useUndoableState({});

  const [selected, setSelected] = useState('A1');
  const [nameBoxValue, setNameBoxValue] = useState('A1');
  const [gridCols, setGridCols] = useState(10);
  const [gridRows, setGridRows] = useState(10);
  const gridContainerRef = useRef(null);
  // draft is the current uncommitted edit ({ id, value } | null). Keeping it
  // out of the undo history avoids pushing a snapshot per keystroke; the
  // history grows only on commits.
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const editing = draft ? draft.id : null;

  // Overlay the in-flight draft on top of committed cells so the user sees
  // live recalculation as they type a formula.
  const previewCells = useMemo(() => {
    if (!draft) return cells;
    if (draft.value === '') {
      const next = { ...cells };
      delete next[draft.id];
      return next;
    }
    return { ...cells, [draft.id]: draft.value };
  }, [cells, draft]);

  const computed = useMemo(() => computeSheet(previewCells), [previewCells]);

  const commitValue = useCallback(
    (id, value) => {
      setCells((prev) => {
        const next = { ...prev };
        if (value === undefined || value === '') {
          delete next[id];
        } else {
          next[id] = value;
        }
        return next;
      });
      setDraft(null);
    },
    [setCells],
  );

  const handleCommit = useCallback(
    (id, value) => commitValue(id, value),
    [commitValue],
  );

  const handleCancel = useCallback(() => setDraft(null), []);

  const handleSelect = useCallback((id) => {
    if (draftRef.current) {
      commitValue(draftRef.current.id, draftRef.current.value);
    }
    setSelected(id);
    setNameBoxValue(id);
  }, [commitValue]);

  const handleStartEdit = useCallback(
    (id) => {
      setSelected(id);
      setDraft({ id, value: cells[id] ?? '', editMode: 'edit' });
    },
    [cells],
  );

  const handleDraftChange = useCallback((id, value) => {
    setDraft((prev) => ({ id, value, editMode: prev?.editMode ?? 'enter' }));
  }, []);

  const moveSelection = useCallback((id, direction) => {
    if (draftRef.current) {
      commitValue(draftRef.current.id, draftRef.current.value);
    }
    const colStr = id.match(/^[A-Z]+/)[0];
    const col = COL_LABELS.indexOf(colStr);
    const row = parseInt(id.slice(colStr.length), 10) - 1;
    let nc = col;
    let nr = row;
    if (direction === 'up') nr = Math.max(0, row - 1);
    if (direction === 'down') nr = Math.min(gridRows - 1, row + 1);
    if (direction === 'left') nc = Math.max(0, col - 1);
    if (direction === 'right') nc = Math.min(gridCols - 1, col + 1);
    const next = cellId(nc, nr);
    setSelected(next);
    setNameBoxValue(next);
  }, [commitValue, gridRows, gridCols]);

  // Global keyboard handling: arrows to move, Enter/F2 to edit, Delete to
  // clear, Ctrl/Cmd+Z/Y for undo/redo, printable keys to start typing.
  useEffect(() => {
    function onKey(e) {
      const target = e.target;
      const isInputFocused =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (
        (ctrl && (e.key === 'y' || e.key === 'Y')) ||
        (ctrl && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
      ) {
        e.preventDefault();
        redo();
        return;
      }

      if (isInputFocused) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(selected, 'up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSelection(selected, 'down');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveSelection(selected, 'left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveSelection(selected, 'right');
      } else if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        setDraft({ id: selected, value: cells[selected] ?? '', editMode: 'edit' });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        commitValue(selected, '');
      } else if (
        e.key.length === 1 &&
        !ctrl &&
        !e.altKey &&
        /[\x20-\x7e]/.test(e.key)
      ) {
        e.preventDefault();
        setDraft({ id: selected, value: e.key, editMode: 'enter' });
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, cells, moveSelection, undo, redo, commitValue]);

  const selectedRaw = cells[selected] ?? '';
  const selectedDraftValue =
    draft && draft.id === selected ? draft.value : selectedRaw;
  const selectedDisplay = displayValue(computed, selected, selectedDraftValue);
  const selectedHasError = !!computed.errors[selected];

  const visibleCols = COL_LABELS.slice(0, gridCols);

  return (
    <div className="w-full max-w-6xl mx-auto p-6 flex flex-col" style={{ height: 'min(90vh, 700px)' }}>
      <header className="pb-2 flex items-baseline gap-3">
        <h1 className="text-lg font-bold text-slate-800 tracking-tight">Spreadsheet</h1>
        <p className="text-xs text-slate-400">
          Formulas start with <code className="px-1 py-0.5 bg-slate-100 rounded font-mono text-[11px] text-slate-600">=</code>
          {' '}e.g. <code className="px-1 py-0.5 bg-slate-100 rounded font-mono text-[11px] text-slate-600">=A1+B2</code>
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-4 py-1.5 bg-white border-b border-slate-200">
        <input
          aria-label="Name box"
          className="w-16 text-center border border-slate-200 rounded px-1 py-1 text-xs font-mono font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white cursor-pointer"
          value={nameBoxValue}
          onChange={(e) => setNameBoxValue(e.target.value.toUpperCase())}
          onFocus={(e) => e.target.select()}
          onBlur={() => setNameBoxValue(selected)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const v = e.currentTarget.value.toUpperCase();
              if (isValidCellId(v)) {
                if (draftRef.current) {
                  commitValue(draftRef.current.id, draftRef.current.value);
                }
                setSelected(v);
                setDraft(null);
              }
              setNameBoxValue(selected);
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setNameBoxValue(selected);
              e.currentTarget.blur();
            }
          }}
        />
        <span className="text-slate-300">|</span>
        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium px-1">fx</span>
        <input
          aria-label="Formula bar"
          className="flex-1 min-w-[12rem] border border-slate-200 rounded-md px-3 py-1.5 text-sm font-mono bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
          value={selectedDraftValue}
          placeholder="Enter value or =formula"
          onChange={(e) => setDraft({ id: selected, value: e.target.value })}
          onBlur={(e) => {
            if (draft && draft.id === selected) {
              commitValue(selected, e.target.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitValue(selected, e.currentTarget.value);
              moveSelection(selected, 'down');
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(null);
            }
          }}
        />
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-md bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            title="Undo (Ctrl+Z)"
            onClick={undo}
            disabled={!canUndo}
          >
            ↶ Undo
          </button>
          <button
            type="button"
            className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-md bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            title="Redo (Ctrl+Y)"
            onClick={redo}
            disabled={!canRedo}
          >
            ↷ Redo
          </button>
          <button
            type="button"
            className="px-2.5 py-1 text-xs font-medium border border-red-200 rounded-md bg-white hover:bg-red-50 active:bg-red-100 text-red-600 cursor-pointer transition-colors"
            title="Clear all cells"
            onClick={() => reset({})}
          >
            ✕ Clear
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto border border-slate-200 rounded-lg bg-white shadow-sm">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `3rem repeat(${gridCols}, minmax(5rem, 1fr))`,
          }}
        >
          <div className="h-9 bg-slate-50 border-r border-b border-slate-200 sticky top-0 left-0 z-20" />
          {visibleCols.map((label) => (
            <div
              key={`h-${label}`}
              className="h-9 bg-slate-50 border-r border-b border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10"
            >
              {label}
            </div>
          ))}
          {Array.from({ length: gridRows }).map((_, r) => (
            <RowFragment
              key={`row-${r}`}
              rowIndex={r}
              gridCols={gridCols}
              cells={cells}
              draft={draft}
              computed={computed}
              selected={selected}
              editing={editing}
              onSelect={handleSelect}
              onStartEdit={handleStartEdit}
              onCommit={handleCommit}
              onCancel={handleCancel}
              onMove={moveSelection}
              onDraftChange={handleDraftChange}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          className="px-2 py-1 text-xs font-medium border border-slate-200 rounded-md bg-white hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors disabled:opacity-40"
          onClick={() => setGridCols((c) => Math.min(MAX_COLS, c + 1))}
          disabled={gridCols >= MAX_COLS}
          title="Add column"
        >
          + Column
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs font-medium border border-slate-200 rounded-md bg-white hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors disabled:opacity-40"
          onClick={() => setGridRows((r) => Math.min(MAX_ROWS, r + 5))}
          disabled={gridRows >= MAX_ROWS}
          title="Add 5 rows"
        >
          + 5 Rows
        </button>
        <span className="ml-auto text-[11px] text-slate-400 font-mono">{gridCols}×{gridRows}</span>
      </div>

      <footer className="px-4 py-1.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          {selectedHasError
            ? <span className="text-red-500 font-medium">⚠ {selected}: {selectedDisplay}</span>
            : <span className="text-slate-400">Arrows · Enter · Delete · Ctrl+Z/Y</span>}
        </span>
        {(() => {
          const nums = Object.values(computed.values).filter(v => typeof v === 'number');
          if (nums.length === 0) return null;
          const sum = nums.reduce((a, b) => a + b, 0);
          const avg = sum / nums.length;
          return (
            <span className="flex gap-4 font-mono">
              <span>SUM: <strong className="text-slate-700">{Number.isInteger(sum) ? sum : sum.toFixed(2)}</strong></span>
              <span>AVG: <strong className="text-slate-700">{avg.toFixed(2)}</strong></span>
              <span>COUNT: <strong className="text-slate-700">{nums.length}</strong></span>
            </span>
          );
        })()}
      </footer>
    </div>
  );
}

function RowFragment({
  rowIndex,
  gridCols,
  cells,
  draft,
  computed,
  selected,
  editing,
  onSelect,
  onStartEdit,
  onCommit,
  onCancel,
  onMove,
  onDraftChange,
}) {
  return (
    <>
      <div className="h-9 bg-slate-50 border-r border-b border-slate-200 flex items-center justify-center text-xs font-bold text-slate-400 sticky left-0 z-10">
        {rowIndex + 1}
      </div>
      {COL_LABELS.slice(0, gridCols).map((_, c) => {
        const id = cellId(c, rowIndex);
        const committed = cells[id];
        const editingThis = draft && draft.id === id;
        const raw = editingThis ? draft.value : committed;
        const hasError = !!computed.errors[id];
        const display = displayValue(computed, id, raw);
        return (
          <Cell
            key={id}
            id={id}
            raw={raw}
            display={display}
            hasError={hasError}
            isSelected={selected === id}
            isEditing={editing === id}
            editMode={editingThis ? draft.editMode : undefined}
            onSelect={onSelect}
            onStartEdit={onStartEdit}
            onCommit={onCommit}
            onCancel={onCancel}
            onMove={onMove}
            onDraftChange={onDraftChange}
          />
        );
      })}
    </>
  );
}

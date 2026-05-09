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
import { undoRedo } from '../hooks/undoRedo';
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
  } = undoRedo({});

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
    <div className="w-full max-w-6xl mx-auto flex flex-col" style={{ height: 'min(90vh, 720px)', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-0 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {/* Name box */}
        <div className="flex items-center border-r border-slate-200 px-2 py-1.5 gap-1.5 shrink-0">
          <input
            aria-label="Name box"
            className="w-14 text-center rounded px-1 py-1 text-xs font-mono font-semibold text-slate-700 bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white cursor-pointer transition-colors"
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
          <span className="text-[10px] font-semibold tracking-widest text-slate-400 select-none">fx</span>
        </div>
        {/* Formula bar */}
        <input
          aria-label="Formula bar"
          className="flex-1 px-3 py-2 text-sm font-mono bg-transparent focus:outline-none text-slate-700 placeholder-slate-300"
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
        {/* Action buttons */}
        <div className="flex items-center border-l border-slate-200 px-2 py-1.5 gap-1 shrink-0">
          <button
            type="button"
            className="px-2.5 py-1 text-xs font-medium rounded text-slate-500 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            title="Undo (Ctrl+Z)"
            onClick={undo}
            disabled={!canUndo}
          >
            ↶ Undo
          </button>
          <button
            type="button"
            className="px-2.5 py-1 text-xs font-medium rounded text-slate-500 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            title="Redo (Ctrl+Y)"
            onClick={redo}
            disabled={!canRedo}
          >
            ↷ Redo
          </button>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button
            type="button"
            className="px-2.5 py-1 text-xs font-medium rounded text-red-400 hover:bg-red-50 hover:text-red-500 active:bg-red-100 cursor-pointer transition-colors"
            title="Clear all cells"
            onClick={() => reset({})}
          >
            ✕ Clear
          </button>
        </div>
      </div>

      {/* Grid area */}
      <div className="mt-3 flex-1 min-h-0 flex flex-col border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
        {/* Scroll area + +Col button side by side */}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-h-0 overflow-auto">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `3rem repeat(${gridCols}, minmax(5rem, 1fr))`,
              }}
            >
              {/* Top-left corner */}
              <div className="h-8 bg-slate-50 border-r border-b border-slate-200 sticky top-0 left-0 z-20" />
              {/* Column headers */}
              {visibleCols.map((label) => (
                <div
                  key={`h-${label}`}
                  className="h-8 bg-slate-50 border-r border-b border-slate-200 flex items-center justify-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 z-10"
                >
                  {label}
                </div>
              ))}

              {/* Data rows */}
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

              {/* +Row button — in the row-number column, after last row */}
              <div className="h-8 bg-slate-50 border-r border-t border-slate-200 sticky left-0 z-10 flex items-center justify-center">
                <button
                  type="button"
                  className={[
                    'w-6 h-6 rounded flex items-center justify-center text-sm font-semibold transition-all duration-150',
                    gridRows >= MAX_ROWS
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600 active:bg-slate-300 cursor-pointer',
                  ].join(' ')}
                  onClick={() => { if (gridRows < MAX_ROWS) setGridRows((r) => Math.min(MAX_ROWS, r + 5)); }}
                  disabled={gridRows >= MAX_ROWS}
                  title="Add 5 rows"
                >
                  +
                </button>
              </div>
              {/* fill remaining cells in +Row row */}
              {visibleCols.map((label) => (
                <div key={`addrow-${label}`} className="h-8 border-t border-slate-100" />
              ))}
            </div>
          </div>

          {/* +Col button — outside the scroll area, pinned to the right of the header only */}
          <div className="shrink-0 w-8 flex flex-col">
            <div className="h-8 bg-slate-50 border-l border-b border-slate-200 flex items-center justify-center">
              <button
                type="button"
                className={[
                  'w-6 h-6 rounded flex flex-col items-center justify-center text-[10px] font-semibold leading-[10px] transition-all duration-150',
                  gridCols >= MAX_COLS
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600 active:bg-slate-300 cursor-pointer',
                ].join(' ')}
                onClick={() => { if (gridCols < MAX_COLS) setGridCols((c) => c + 1); }}
                disabled={gridCols >= MAX_COLS}
                title="Add column"
              >
                <span className="text-sm leading-[12px]">+</span>
              </button>
            </div>
            {/* No cells below — intentionally empty */}
          </div>
        </div>

        {/* Status bar */}
        <div className="px-4 py-1.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>
            {selectedHasError
              ? <span className="text-red-400 font-medium">⚠ {selected}: {selectedDisplay}</span>
              : <span>Arrows · Enter · Delete · Ctrl+Z/Y</span>}
          </span>
          {(() => {
            const nums = Object.values(computed.values).filter(v => typeof v === 'number');
            if (nums.length === 0) return null;
            const sum = nums.reduce((a, b) => a + b, 0);
            const avg = sum / nums.length;
            return (
              <span className="flex gap-4 font-mono">
                <span>SUM <strong className="text-slate-600">{Number.isInteger(sum) ? sum : sum.toFixed(2)}</strong></span>
                <span>AVG <strong className="text-slate-600">{avg.toFixed(2)}</strong></span>
                <span>COUNT <strong className="text-slate-600">{nums.length}</strong></span>
              </span>
            );
          })()}
        </div>
      </div>
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
      <div className="h-8 bg-slate-50 border-r border-b border-slate-200 flex items-center justify-center text-[11px] font-medium text-slate-500 sticky left-0 z-10">
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
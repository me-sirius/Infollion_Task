import { memo, useEffect, useRef, useMemo } from 'react';

function CellImpl({
  id,
  raw,
  display,
  hasError,
  isSelected,
  isEditing,
  editMode,
  onSelect,
  onStartEdit,
  onCommit,
  onCancel,
  onMove,
  onDraftChange,
}) {
  const inputRef = useRef(null);
  const isFormula = typeof raw === 'string' && raw.startsWith('=');
  const isNumeric = useMemo(() => {
    if (isEditing || hasError) return false;
    const d = display;
    if (d === '' || d === undefined || d === null) return false;
    return !isNaN(Number(d));
  }, [isEditing, hasError, display]);

  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          if (editMode === 'edit') {
            el.select();
          } else {
            el.setSelectionRange(el.value.length, el.value.length);
          }
        }
      });
    }
  }, [isEditing, editMode]);

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(id, e.currentTarget.value);
      onMove(id, 'down');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onCommit(id, e.currentTarget.value);
      onMove(id, e.shiftKey ? 'left' : 'right');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (
      editMode !== 'edit' &&
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
    ) {
      e.preventDefault();
      onCommit(id, e.currentTarget.value);
      onMove(id, e.key.replace('Arrow', '').toLowerCase());
    }
  }

  return (
    <div
      role="gridcell"
      aria-label={id}
      className={[
        'h-8 border-r border-b border-slate-200 px-2 flex items-center text-sm select-none transition-colors duration-75',
        isSelected
          ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/30'
          : isFormula && !isEditing
            ? 'bg-indigo-50/20 hover:bg-indigo-50/50 cursor-pointer'
            : 'bg-white hover:bg-slate-50 cursor-pointer',
        hasError ? 'bg-red-50/40 text-red-600 font-medium' : 'text-slate-800',
      ].join(' ')}
      onMouseDown={() => onSelect(id)}
      onDoubleClick={() => onStartEdit(id)}
      data-cell-id={id}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          className="w-full h-full outline-none bg-blue-50/60 text-slate-900 font-mono text-sm"
          value={raw ?? ''}
          onChange={(e) => onDraftChange(id, e.target.value)}
          onBlur={(e) => onCommit(id, e.target.value)}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <span
          className={['truncate w-full', isNumeric ? 'text-right font-mono' : ''].join(' ')}
          title={isFormula ? raw : undefined}
        >
          {display}
        </span>
      )}
    </div>
  );
}

export const Cell = memo(CellImpl);

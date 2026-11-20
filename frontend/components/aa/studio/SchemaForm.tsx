'use client';

import { useId, useState } from 'react';
import type { PropertyDef } from '@/lib/aa/architecture-types';
import { parsePropertyInput } from '@/lib/aa/model-ops';

export type InspectorEdits = {
  queue: (id: string, apply: (() => void) | null) => void;
  flush: (id?: string) => void;
};

export const fieldStyle: React.CSSProperties = {
  boxSizing: 'border-box', width: '100%', padding: '7px 9px', borderRadius: 7,
  border: '1px solid rgba(255,255,255,0.15)', background: '#141417', color: '#e8e6e1', font: 'inherit',
};

type FieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  choices?: string[];
  validate: (value: string) => string | undefined;
  onCommit: (value: string) => void;
  edits: InspectorEdits;
};

export function InspectorField({ label, value, placeholder, multiline, choices, validate, onCommit, edits }: FieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const error = draft === null ? undefined : validate(draft);
  const change = (next: string) => {
    setDraft(next);
    edits.queue(id, null);
    if (validate(next)) return;
    const apply = () => {
      onCommit(next);
      setDraft(null);
    };
    if (choices) apply();
    else edits.queue(id, apply);
  };
  const props = {
    id, value: draft ?? value, placeholder, style: fieldStyle,
    'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined,
    onBlur: () => edits.flush(id),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => change(event.target.value),
  };
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <label htmlFor={id}>{label}</label>
      {choices ? (
        <select {...props}>
          <option value="">미설정</option>
          {choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select>
      ) : multiline ? <textarea {...props} rows={5} /> : <input {...props} />}
      {error && <span id={`${id}-error`} style={{ color: '#ff9b9d', fontSize: 12 }} role="alert">{error}</span>}
    </div>
  );
}

export default function SchemaForm({ definitions, values, onChange, edits }: {
  definitions: PropertyDef[];
  values: Record<string, unknown>;
  onChange: (key: string, raw: string) => void;
  edits: InspectorEdits;
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {definitions.map((def) => {
        const value = values[def.key];
        return (
          <InspectorField
            key={def.key} label={def.label} placeholder={def.placeholder}
            value={Array.isArray(value) ? value.join('\n') : String(value ?? '')}
            multiline={def.type === 'text' || def.type === 'list'}
            choices={def.type === 'enum' ? def.options : def.type === 'boolean' ? ['true', 'false'] : undefined}
            validate={(raw) => parsePropertyInput(def, raw).error}
            onCommit={(raw) => onChange(def.key, raw)} edits={edits}
          />
        );
      })}
    </div>
  );
}

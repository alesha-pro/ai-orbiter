'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { json } from '@codemirror/lang-json';
import { EditorState } from '@codemirror/state';
import { cn } from '@/lib/utils';

interface ConfigEditorProps {
  value: object;
  onChange?: (value: object) => void;
  onError?: (error: string | null) => void;
  readOnly?: boolean;
  className?: string;
  minHeight?: string;
}

export function ConfigEditor({
  value,
  onChange,
  onError,
  readOnly = false,
  className,
  minHeight = '200px',
}: ConfigEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [internalError, setInternalError] = useState<string | null>(null);

  const handleChange = useCallback((doc: string) => {
    try {
      const parsed = JSON.parse(doc);
      setInternalError(null);
      onError?.(null);
      onChange?.(parsed);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Invalid JSON';
      setInternalError(errorMsg);
      onError?.(errorMsg);
    }
  }, [onChange, onError]);

  useEffect(() => {
    if (!editorRef.current) return;

    const initialDoc = JSON.stringify(value, null, 2);

    const state = EditorState.create({
      doc: initialDoc,
      extensions: [
        basicSetup,
        json(),
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !readOnly) {
            handleChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { height: '100%', width: '100%' },
          '.cm-scroller': { overflow: 'auto', width: '100%' },
          '.cm-content': { 
            minHeight,
            maxWidth: '100%',
            overflowX: 'auto',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          },
        }),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!viewRef.current) return;

    const currentDoc = viewRef.current.state.doc.toString();
    const newDoc = JSON.stringify(value, null, 2);

    if (currentDoc !== newDoc) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: newDoc,
        },
      });
    }
  }, [value]);

  return (
    <div className={cn('relative w-full', className)}>
      <div
        ref={editorRef}
        className={cn(
          'border rounded-lg overflow-hidden bg-muted/50 w-full max-w-full',
          internalError && 'border-destructive',
          readOnly && 'opacity-75'
        )}
        style={{ minHeight }}
      />
      {internalError && (
        <p className="text-xs text-destructive mt-1">{internalError}</p>
      )}
    </div>
  );
}

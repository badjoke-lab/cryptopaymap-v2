'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { copyText } from '@/lib/clipboard';

type CopyStatus = 'idle' | 'copied' | 'error';

type CopyButtonProps = {
  text: string;
  ariaLabel?: string;
  className?: string;
};

const statusLabel: Record<CopyStatus, string> = {
  idle: 'Copy',
  copied: 'Copied',
  error: 'Copy failed',
};

export default function CopyButton({ text, ariaLabel, className }: CopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetStatus = useCallback(() => {
    setStatus('idle');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await copyText(text);
      setStatus('copied');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setStatus('idle');
        timeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error(error);
      setStatus('error');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(resetStatus, 2000);
    }
  }, [resetStatus, text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={
        className ??
        'inline-flex items-center justify-center rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:text-gray-900'
      }
      aria-label={ariaLabel ?? `Copy ${text} to clipboard`}
    >
      {statusLabel[status]}
    </button>
  );
}

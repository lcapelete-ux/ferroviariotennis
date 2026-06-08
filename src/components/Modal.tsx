import React from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
  onConfirm?: () => void;
  onCancel?: () => void;
  onThird?: () => void;
  confirmText?: string;
  cancelText?: string;
  thirdText?: string;
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  onConfirm,
  onCancel,
  onThird,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  thirdText,
  children,
  confirmDisabled = false
}: ModalProps) {
  if (!isOpen) return null;

  const icons = {
    info: <Info className="w-6 h-6 text-blue-600" />,
    success: <CheckCircle className="w-6 h-6 text-emerald-600" />,
    warning: <AlertTriangle className="w-6 h-6 text-amber-600" />,
    error: <AlertCircle className="w-6 h-6 text-red-600" />,
    confirm: <Info className="w-6 h-6 text-blue-600" />
  };

  const colors = {
    info: "bg-blue-50",
    success: "bg-emerald-50",
    warning: "bg-amber-50",
    error: "bg-red-50",
    confirm: "bg-blue-50"
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className={clsx("p-3 rounded-xl", colors[type])}>
              {icons[type]}
            </div>
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <h3 className="text-xl font-bold text-zinc-900 mb-2">{title}</h3>
          <p className="text-zinc-600 leading-relaxed whitespace-pre-wrap">{message}</p>
          {children && <div className="mt-4">{children}</div>}
        </div>
        
        <div className="bg-zinc-50 p-4 flex flex-wrap gap-3 justify-end">
          {type === 'confirm' ? (
            <>
              <button
                onClick={() => {
                  onCancel?.();
                  onClose();
                }}
                className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-800 bg-white border border-zinc-200 rounded-xl transition-colors"
                id="modal-cancel-btn"
              >
                {cancelText}
              </button>
              {thirdText && (
                <button
                  onClick={() => {
                    onThird?.();
                    onClose();
                  }}
                  className="px-4 py-2 text-sm font-medium text-amber-600 hover:text-amber-700 bg-amber-50 border border-amber-200 rounded-xl transition-colors"
                  id="modal-third-btn"
                >
                  {thirdText}
                </button>
              )}
              <button
                onClick={() => {
                  onConfirm?.();
                  onClose();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={confirmDisabled}
                id="modal-confirm-btn"
              >
                {confirmText}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-6 py-2 text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-900 rounded-xl shadow-sm transition-colors"
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

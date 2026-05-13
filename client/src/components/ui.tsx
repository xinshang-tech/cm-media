'use client';

import { useEffect, useState, useRef, useCallback, ButtonHTMLAttributes } from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <svg
      className={`spinner ${sizeClasses[size]} text-blue-500 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function PageLoader({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[360px] gap-3">
      <div className="relative">
        <div className="w-10 h-10 rounded-full border-2 border-white/10" />
        <svg
          className="absolute inset-0 w-10 h-10 text-blue-500 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      {text && <p className="text-xs text-gray-500 tracking-wide">{text}</p>}
    </div>
  );
}

interface LoadingOverlayProps {
  isLoading: boolean;
  text?: string;
}

export function LoadingOverlay({ isLoading, text = '加载中...' }: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 p-6 rounded-md bg-surface">
        <Spinner size="lg" />
        <p className="text-sm text-gray-400">{text}</p>
      </div>
    </div>
  );
}

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

export function VideoCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-video w-full rounded-md" />
      <div className="flex gap-3 px-1">
        <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function VideoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20',
    secondary: 'bg-white/10 hover:bg-white/15 text-white btn-neutral',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20',
    ghost: 'bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/25 text-gray-400 hover:text-white btn-neutral',
    outline: 'border border-white/20 hover:bg-white/10 text-white btn-neutral',
  };

  const sizeClasses = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-9 px-4 text-sm',
    lg: 'h-10 px-5 text-sm',
  };

  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 rounded-md font-normal transition-all btn-press
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-normal text-foreground">
          {label}
        </label>
      )}
      <input
        className={`
          input-field
          w-full h-10 px-3 rounded-md text-foreground text-sm transition-all
          focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error 
            ? 'bg-red-500/10 border border-red-500/50 focus:ring-red-500/50 focus:border-red-500' 
            : ''
          }
          ${className}
        `}
        autoComplete="off"
        {...props}
      />
      {hint && !error && (
        <p className="text-xs text-gray-500">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-normal text-foreground">
          {label}
        </label>
      )}
      <textarea
        className={`
          input-field
          w-full px-3 py-2.5 rounded-md text-foreground text-sm transition-all resize-none
          focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error 
            ? 'bg-red-500/10 border border-red-500/50 focus:ring-red-500/50 focus:border-red-500' 
            : ''
          }
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, error, options, className = '', ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-normal text-foreground">
          {label}
        </label>
      )}
      <select
        className={`
          input-field
          w-full h-9 px-3 rounded-md text-foreground text-sm transition-all appearance-none cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error 
            ? 'bg-red-500/10 border border-red-500/50' 
            : ''
          }
          ${className}
        `}
        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23888888' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-gray-900">
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

const TOAST_HEIGHT = 44;

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface SingleToastProps {
  item: ToastItem;
  index: number;
  onClose: (id: number) => void;
}

function SingleToast({ item, index, onClose }: SingleToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(item.id), 3000);
    return () => clearTimeout(timer);
  }, [item.id, onClose]);

  const typeConfig = {
    success: { bg: 'bg-green-600/90', icon: 'M5 13l4 4L19 7' },
    error: { bg: 'bg-red-600/90', icon: 'M6 18L18 6M6 6l12 12' },
    info: { bg: 'bg-blue-600/90', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    warning: { bg: 'bg-yellow-600/90', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z' },
  };

  const config = typeConfig[item.type];

  return (
    <div
      className="fixed left-1/2 z-50 -translate-x-1/2"
      style={{ 
        top: `${12 + index * TOAST_HEIGHT}px`,
        animation: 'slideDown 0.3s cubic-bezier(0.34, 1.2, 0.64, 1)'
      }}
    >
      <div className={`toast-item flex items-center gap-2 px-3 py-2 rounded-md shadow-lg backdrop-blur-sm ${config.bg}`}>
        <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
        </svg>
        <p className="text-xs text-white font-normal">{item.message}</p>
        <button onClick={() => onClose(item.id)} className="ml-1 p-0.5 hover:bg-white/20 rounded transition-colors">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onClose: (id: number) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <>
      {toasts.map((item, index) => (
        <SingleToast key={item.id} item={item} index={index} onClose={onClose} />
      ))}
    </>
  );
}

// Legacy single-toast component kept for backwards compat
interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
}

export function Toast({ message, type = 'info', onClose }: ToastProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([{ id: 1, message, type }]);
  const close = useCallback(() => {
    setToasts([]);
    onClose();
  }, [onClose]);
  return <ToastContainer toasts={toasts} onClose={close} />;
}

let _toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = ++_toastCounter;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${sizeClasses[size]} animate-fade-in`}>
        <div className="rounded-md shadow-2xl overflow-hidden bg-surface border border-border">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'primary',
  isLoading = false,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-gray-400 mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <Button variant="ghost" onClick={onClose} disabled={isLoading}>
          {cancelText}
        </Button>
        <Button variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} isLoading={isLoading}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {icon && (
        <div className="w-14 h-14 rounded-md flex items-center justify-center mb-3 bg-card">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-normal text-foreground mb-1">{title}</h3>
      {description && <p className="text-xs text-gray-500 mb-4">{description}</p>}
      {action}
    </div>
  );
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className = '', hover = false }: CardProps) {
  return (
    <div 
      className={`rounded-md p-4 transition-all ${hover ? 'card-hover cursor-pointer' : ''} ${className}`}
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {children}
    </div>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variantClasses = {
    default: 'bg-white/10 text-gray-300',
    success: 'bg-green-500/20 text-green-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    danger: 'bg-red-500/20 text-red-400',
    info: 'bg-blue-500/20 text-blue-400',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-normal ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}

interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  className?: string;
  variant?: 'default' | 'success' | 'danger';
}

export function ProgressBar({ value, max = 100, showLabel = false, className = '', variant = 'default' }: ProgressBarProps) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);
  
  const variantClasses = {
    default: 'bg-blue-500',
    success: 'bg-green-500',
    danger: 'bg-red-500',
  };

  return (
    <div className={`space-y-1 ${className}`}>
      {showLabel && (
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">进度</span>
          <span className="text-gray-400">{percentage}%</span>
        </div>
      )}
      <div className="progress-bar">
        <div 
          className={`progress-bar-fill ${variantClasses[variant]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  label?: string;
  hint?: string;
  preview?: string | null;
  isLoading?: boolean;
  progress?: number;
  className?: string;
}

export function FileUpload({ 
  onFileSelect, 
  accept = 'image/*', 
  label, 
  hint, 
  preview, 
  isLoading = false,
  progress,
  className = '' 
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelect(file);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-sm font-normal text-foreground">{label}</label>
      )}
      <div
        className={`upload-zone rounded-md p-4 text-center cursor-pointer transition-all ${
          dragover ? 'dragover' : ''
        } ${preview ? 'p-2' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
        />
        
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <Spinner size="md" />
            {progress !== undefined && (
              <ProgressBar value={progress} showLabel className="w-full max-w-xs" />
            )}
            <p className="text-xs text-gray-500">上传中...</p>
          </div>
        ) : preview ? (
          <div className="relative group">
            <img src={preview} alt="" className="max-h-40 mx-auto rounded-md object-contain" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
              <p className="text-sm text-white">点击更换</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="w-12 h-12 rounded-md bg-white/5 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-400">
                <span className="text-blue-400">点击上传</span> 或拖拽文件到此处
              </p>
              {hint && <p className="text-xs text-gray-600 mt-1">{hint}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TabsProps {
  items: { key: string; label: string; count?: number }[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ items, activeKey, onChange, className = '' }: TabsProps) {
  return (
    <div className={`flex flex-wrap gap-0.5 p-1.5 rounded-md ${className}`} style={{ background: 'var(--color-card)' }}>
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-normal whitespace-nowrap transition-all ${
            activeKey === item.key
              ? 'bg-white/10 text-foreground shadow-sm'
              : 'text-muted hover:text-foreground hover:bg-white/5'
          }`}
        >
          {item.label}
          {item.count !== undefined && (
            <span className={`text-[10px] leading-none px-1 py-0.5 rounded-full ${
              activeKey === item.key ? 'bg-white/20' : 'bg-white/10'
            }`}>
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

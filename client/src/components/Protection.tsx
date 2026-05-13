'use client';

import { useEffect } from 'react';

export default function Protection({ isAdmin = false }: { isAdmin?: boolean }) {
  useEffect(() => {
    if (isAdmin) return;
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        return false;
      }
    };
    
    const handleSelectStart = (e: Event) => {
      const target = e.target as HTMLElement;
      // 允许输入框和文本区域选择
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return true;
      }
      e.preventDefault();
      return false;
    };
    
    const handleDragStart = (e: Event) => {
      e.preventDefault();
      return false;
    };
    
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('selectstart', handleSelectStart);
    document.addEventListener('dragstart', handleDragStart);
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('selectstart', handleSelectStart);
      document.removeEventListener('dragstart', handleDragStart);
    };
  }, []);
  
  return null;
}

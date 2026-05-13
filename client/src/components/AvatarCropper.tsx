'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Spinner } from '@/components/ui';

interface AvatarCropperProps {
  currentAvatar?: string | null;
  onUpload: (file: File) => Promise<void>;
  isUploading?: boolean;
}

const OUTPUT_SIZE = 300;
const DISPLAY_MAX = 350;
const MIN_CROP_SIZE = 50;

export default function AvatarCropper({ currentAvatar, onUpload, isUploading = false }: AvatarCropperProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  
  // 拖动状态
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialCrop, setInitialCrop] = useState({ x: 0, y: 0, size: 0 });
  
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, size: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('图片大小不能超过10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setShowCropper(true);
      setImageLoaded(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 加载图片到canvas
  useEffect(() => {
    if (!showCropper || !imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      
      const scale = Math.min(DISPLAY_MAX / img.width, DISPLAY_MAX / img.height);
      const displayWidth = Math.round(img.width * scale);
      const displayHeight = Math.round(img.height * scale);

      canvas.width = displayWidth;
      canvas.height = displayHeight;

      // 初始化裁切区域（居中，80%大小）
      const cropSize = Math.min(displayWidth, displayHeight) * 0.8;
      const initialCropArea = {
        x: (displayWidth - cropSize) / 2,
        y: (displayHeight - cropSize) / 2,
        size: cropSize,
      };
      setCropArea(initialCropArea);

      drawCanvas(ctx, img, displayWidth, displayHeight, initialCropArea);
      setImageLoaded(true);
    };
    img.src = imageSrc;
  }, [showCropper, imageSrc]);

  // 绘制canvas
  const drawCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    width: number,
    height: number,
    crop: { x: number; y: number; size: number }
  ) => {
    ctx.clearRect(0, 0, width, height);
    
    ctx.drawImage(img, 0, 0, width, height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, height);

    // 清除裁切区域并绘制原图（圆形）
    ctx.save();
    ctx.beginPath();
    ctx.arc(crop.x + crop.size / 2, crop.y + crop.size / 2, crop.size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.clearRect(crop.x, crop.y, crop.size, crop.size);
    ctx.drawImage(img, 0, 0, width, height);
    ctx.restore();

    const centerX = crop.x + crop.size / 2;
    const centerY = crop.y + crop.size / 2;
    const radius = crop.size / 2;

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(centerX, crop.y + 5);
    ctx.lineTo(centerX, crop.y + crop.size - 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(crop.x + 5, centerY);
    ctx.lineTo(crop.x + crop.size - 5, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

    const handleX = crop.x + crop.size - 5;
    const handleY = crop.y + crop.size - 5;
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(handleX, handleY);
    ctx.lineTo(handleX, handleY - 12);
    ctx.lineTo(handleX - 12, handleY);
    ctx.closePath();
    ctx.fill();

    const corners = [
      { x: crop.x, y: crop.y },
      { x: crop.x + crop.size, y: crop.y },
      { x: crop.x, y: crop.y + crop.size },
      { x: crop.x + crop.size, y: crop.y + crop.size },
    ];
    corners.forEach(corner => {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }, []);

  // 获取事件位置
  const getEventPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    
    if ('touches' in e) {
      clientX = e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0;
      clientY = e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  // 判断点击位置
  const getClickTarget = (x: number, y: number, crop: { x: number; y: number; size: number }) => {
    const centerX = crop.x + crop.size / 2;
    const centerY = crop.y + crop.size / 2;
    const radius = crop.size / 2;
    
    const handleX = crop.x + crop.size;
    const handleY = crop.y + crop.size;
    const handleDist = Math.sqrt(Math.pow(x - handleX, 2) + Math.pow(y - handleY, 2));
    if (handleDist < 15) return 'resize';
    
    const corners = [
      { x: crop.x, y: crop.y, name: 'tl' },
      { x: crop.x + crop.size, y: crop.y, name: 'tr' },
      { x: crop.x, y: crop.y + crop.size, name: 'bl' },
      { x: crop.x + crop.size, y: crop.y + crop.size, name: 'br' },
    ];
    
    for (const corner of corners) {
      const dist = Math.sqrt(Math.pow(x - corner.x, 2) + Math.pow(y - corner.y, 2));
      if (dist < 12) return 'resize';
    }
    
    const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
    if (dist <= radius) return 'move';
    
    return 'none';
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getEventPos(e);
    const target = getClickTarget(pos.x, pos.y, cropArea);
    
    if (target === 'move') {
      setDragging(true);
      setDragStart({ x: pos.x - cropArea.x, y: pos.y - cropArea.y });
    } else if (target === 'resize') {
      setResizing(true);
      setDragStart({ x: pos.x, y: pos.y });
      setInitialCrop({ ...cropArea });
    }
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging && !resizing) return;
    if (!canvasRef.current || !imageRef.current) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getEventPos(e);

    if (dragging) {
      const newX = Math.max(0, Math.min(pos.x - dragStart.x, canvas.width - cropArea.size));
      const newY = Math.max(0, Math.min(pos.y - dragStart.y, canvas.height - cropArea.size));
      
      const newCrop = { ...cropArea, x: newX, y: newY };
      setCropArea(newCrop);
      drawCanvas(ctx, imageRef.current, canvas.width, canvas.height, newCrop);
    } else if (resizing) {
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;
      const delta = Math.max(dx, dy);
      
      const newSize = Math.max(
        MIN_CROP_SIZE,
        Math.min(
          initialCrop.size + delta,
          canvas.width - initialCrop.x,
          canvas.height - initialCrop.y
        )
      );
      
      const newCrop = {
        x: initialCrop.x,
        y: initialCrop.y,
        size: newSize,
      };
      
      setCropArea(newCrop);
      drawCanvas(ctx, imageRef.current, canvas.width, canvas.height, newCrop);
    }
  };

  const handleDragEnd = () => {
    setDragging(false);
    setResizing(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging || resizing) {
      handleDragMove(e);
      return;
    }
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const pos = getEventPos(e);
    const target = getClickTarget(pos.x, pos.y, cropArea);
    
    if (target === 'resize') {
      canvas.style.cursor = 'nwse-resize';
    } else if (target === 'move') {
      canvas.style.cursor = 'move';
    } else {
      canvas.style.cursor = 'default';
    }
  };

  const handleCropConfirm = useCallback(async () => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    
    if (!img || !canvas) {
      console.error('[AvatarCropper] 图片或canvas未加载');
      return;
    }

    setProcessing(true);

    try {
      // 创建输出canvas 300x300
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = OUTPUT_SIZE;
      outputCanvas.height = OUTPUT_SIZE;
      const outputCtx = outputCanvas.getContext('2d');
      
      if (!outputCtx) {
        throw new Error('无法创建输出canvas上下文');
      }

      outputCtx.imageSmoothingEnabled = true;
      outputCtx.imageSmoothingQuality = 'high';

      const scaleX = img.naturalWidth / canvas.width;
      const scaleY = img.naturalHeight / canvas.height;

      const sourceX = Math.round(cropArea.x * scaleX);
      const sourceY = Math.round(cropArea.y * scaleY);
      const sourceSize = Math.round(cropArea.size * scaleX);

      outputCtx.beginPath();
      outputCtx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
      outputCtx.clip();

      outputCtx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE
      );

      const blob = await new Promise<Blob | null>((resolve) => {
        outputCanvas.toBlob(resolve, 'image/webp', 0.85);
      });

      if (!blob) {
        throw new Error('Canvas转换Blob失败');
      }

      const file = new File([blob], 'avatar.webp', { type: 'image/webp' });
      await onUpload(file);
      
      setShowCropper(false);
      setImageSrc(null);
      setImageLoaded(false);
    } catch (error) {
      console.error('[AvatarCropper] 裁切失败:', error);
      alert('裁切失败，请重试');
    } finally {
      setProcessing(false);
    }
  }, [cropArea, onUpload]);

  const handleCancel = () => {
    setShowCropper(false);
    setImageSrc(null);
    setImageLoaded(false);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div 
        className="relative group cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-800">
          {currentAvatar ? (
            <img src={currentAvatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-16 h-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Button
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
        isLoading={isUploading}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        选择头像
      </Button>

      <p className="text-xs text-gray-500">支持 JPG、PNG、WebP 格式，最大 10MB</p>

      {showCropper && imageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleCancel} />
          <div className="relative w-full max-w-md bg-gray-900 rounded-md overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white">裁切头像</h3>
              <p className="text-sm text-gray-500 mt-1">拖动移动，拖动角点调整大小</p>
            </div>
            
            <div className="p-4 flex justify-center min-h-[400px] items-center">
              {!imageLoaded && <Spinner size="lg" />}
              <canvas
                ref={canvasRef}
                onMouseDown={handleDragStart}
                onMouseMove={handleMouseMove}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
                onTouchStart={handleDragStart}
                onTouchMove={handleDragMove}
                onTouchEnd={handleDragEnd}
                className="touch-none select-none"
                style={{ display: imageLoaded ? 'block' : 'none' }}
              />
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-gray-800">
              <Button variant="ghost" onClick={handleCancel} disabled={processing}>取消</Button>
              <Button 
                onClick={handleCropConfirm} 
                isLoading={processing || isUploading} 
                disabled={!imageLoaded || processing}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                确认裁切
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

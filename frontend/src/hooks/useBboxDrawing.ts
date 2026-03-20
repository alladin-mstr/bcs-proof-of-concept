import { useState, useCallback, useRef } from 'react';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DrawingCallbackParams {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useBboxDrawing(
  onComplete: (rect: DrawingCallbackParams) => void | Promise<void>
) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      startPoint.current = { x, y };
      setIsDrawing(true);
      setCurrentRect({ x, y, width: 0, height: 0 });
    },
    []
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDrawing || !startPoint.current) return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const sx = startPoint.current.x;
      const sy = startPoint.current.y;
      setCurrentRect({
        x: Math.min(sx, cx),
        y: Math.min(sy, cy),
        width: Math.abs(cx - sx),
        height: Math.abs(cy - sy),
      });
    },
    [isDrawing]
  );

  const onMouseUp = useCallback(() => {
    if (!isDrawing || !currentRect) {
      setIsDrawing(false);
      setCurrentRect(null);
      return;
    }
    // Only count rects with meaningful size (> 5px in each dimension)
    if (currentRect.width > 5 && currentRect.height > 5) {
      onComplete(currentRect);
    }
    setIsDrawing(false);
    setCurrentRect(null);
    startPoint.current = null;
  }, [isDrawing, currentRect, onComplete]);

  return {
    isDrawing,
    currentRect,
    handlers: { onMouseDown, onMouseMove, onMouseUp },
  };
}

'use client';

import { useRef, useState, useEffect } from 'react';
import { remoteSocket } from '@/lib/socket';
import { audioManager } from '@/lib/audio';
import { Minimize2 } from 'lucide-react';

interface FullscreenTouchpadProps {
  onExit: () => void;
  sensitivity?: number;
}

export function FullscreenTouchpad({ onExit, sensitivity = 1.5 }: FullscreenTouchpadProps) {
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const touchState = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startTime: number;
    movedDistance: number;
    fingerCount: number;
    twoFingerStartY: number;
    twoFingerLastY: number;
    twoFingerMoved: number;
    lastTapTime: number;
    isDragging: boolean;
  }>({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startTime: 0,
    movedDistance: 0,
    fingerCount: 0,
    twoFingerStartY: 0,
    twoFingerLastY: 0,
    twoFingerMoved: 0,
    lastTapTime: 0,
    isDragging: false,
  });

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const count = e.touches.length;
    const now = Date.now();
    touchState.current.fingerCount = count;
    touchState.current.startTime = now;

    if (count === 1) {
      const t = e.touches[0];
      setCursorPos({ x: t.clientX, y: t.clientY });
      touchState.current.startX = t.clientX;
      touchState.current.startY = t.clientY;
      touchState.current.lastX = t.clientX;
      touchState.current.lastY = t.clientY;
      touchState.current.movedDistance = 0;

      // Double-tap drag
      if (now - touchState.current.lastTapTime < 280) {
        touchState.current.isDragging = true;
        remoteSocket.sendDown('left');
        try { audioManager.playClick(600); } catch {}
      }
    } else if (count === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midY = (t1.clientY + t2.clientY) / 2;
      touchState.current.twoFingerStartY = midY;
      touchState.current.twoFingerLastY = midY;
      touchState.current.twoFingerMoved = 0;
      setCursorPos(null);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const count = e.touches.length;

    if (count === 1) {
      const t = e.touches[0];
      const dx = t.clientX - touchState.current.lastX;
      const dy = t.clientY - touchState.current.lastY;

      touchState.current.movedDistance += Math.hypot(dx, dy);
      touchState.current.lastX = t.clientX;
      touchState.current.lastY = t.clientY;
      setCursorPos({ x: t.clientX, y: t.clientY });

      remoteSocket.sendMove(dx * sensitivity, dy * sensitivity);
    } else if (count === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midY = (t1.clientY + t2.clientY) / 2;
      const dy = midY - touchState.current.twoFingerLastY;

      touchState.current.twoFingerMoved += Math.abs(dy);
      touchState.current.twoFingerLastY = midY;

      const scrollFactor = 2.6 * sensitivity;
      remoteSocket.sendScroll(0, Math.round(dy * scrollFactor));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const duration = Date.now() - touchState.current.startTime;

    if (touchState.current.isDragging) {
      touchState.current.isDragging = false;
      remoteSocket.sendUp('left');
      try { audioManager.playClick(400); } catch {}
      return;
    }

    // 1 Jari Tap -> Klik Kiri
    if (touchState.current.fingerCount === 1 && touchState.current.movedDistance < 12 && duration < 300) {
      touchState.current.lastTapTime = Date.now();
      remoteSocket.sendClick('left');
      try {
        audioManager.playClick(1100);
        audioManager.triggerHaptic(20);
      } catch {}
    }

    // 2 Jari Tap -> Klik Kanan
    if (touchState.current.fingerCount === 2 && touchState.current.twoFingerMoved < 14 && duration < 350) {
      remoteSocket.sendClick('right');
      try {
        audioManager.playClick(650);
        audioManager.triggerHaptic(30);
      } catch {}
    }

    // 3 Jari Tap -> Klik Tengah
    if (touchState.current.fingerCount === 3 && duration < 380) {
      remoteSocket.sendClick('middle');
      try {
        audioManager.playClick(850);
        audioManager.triggerHaptic(25);
      } catch {}
    }

    if (e.touches.length === 0) {
      touchState.current.fingerCount = 0;
      setTimeout(() => setCursorPos(null), 300);
    }
  };

  // Navigasi mouse untuk desktop
  const isMouseDown = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      isMouseDown.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMouseDown.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      remoteSocket.sendMove(dx * sensitivity, dy * sensitivity);
    }
  };

  const handleMouseUp = () => {
    isMouseDown.current = false;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => {
        e.preventDefault();
        remoteSocket.sendClick('right');
        try {
          audioManager.playClick(650);
          audioManager.triggerHaptic(30);
        } catch {}
      }}
      className="fixed inset-0 z-50 w-screen h-screen bg-black cursor-crosshair select-none overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      {/* Tombol Kembali di Pojok Kanan Atas: Transparan, tanpa box/border */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExit();
          try { audioManager.playClick(900); } catch {}
        }}
        className="fixed top-3 right-3 z-50 p-2.5 bg-transparent border-0 text-zinc-600 hover:text-zinc-300 opacity-30 hover:opacity-100 transition-opacity cursor-pointer"
        title="Keluar Layar Penuh"
        aria-label="Keluar Layar Penuh"
      >
        <Minimize2 className="w-5 h-5" />
      </button>

      {/* Titik Sentuhan Halus di Layar Hitam */}
      {cursorPos && (
        <div
          className="absolute w-8 h-8 rounded-full border border-zinc-700/50 bg-zinc-800/20 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
          style={{ left: cursorPos.x, top: cursorPos.y }}
        >
          <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-zinc-400/80" />
        </div>
      )}
    </div>
  );
}

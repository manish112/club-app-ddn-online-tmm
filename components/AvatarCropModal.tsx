'use client';
import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { getCroppedBlob } from '@/lib/cropImage';

interface Props {
  imageSrc: string;
  onSave: (blob: Blob) => void;
  onClose: () => void;
}

export function AvatarCropModal({ imageSrc, onSave, onClose }: Props) {
  const [crop, setCrop]     = useState({ x: 0, y: 0 });
  const [zoom, setZoom]     = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [processing, setProcessing]   = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  async function handleSave() {
    if (!croppedArea) return;
    setProcessing(true);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea);
      onSave(blob);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white text-sm tap-target"
        >
          Cancel
        </button>
        <p className="text-white text-sm font-medium">Adjust Photo</p>
        <button
          onClick={handleSave}
          disabled={processing}
          className="text-white font-semibold text-sm tap-target disabled:opacity-40"
        >
          {processing ? 'Saving…' : 'Use Photo'}
        </button>
      </div>

      {/* Cropper */}
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      {/* Zoom slider */}
      <div className="flex items-center gap-3 px-8 py-5 shrink-0">
        <span className="text-white/60 text-lg select-none">−</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-white h-1"
        />
        <span className="text-white/60 text-lg select-none">+</span>
      </div>
    </div>
  );
}

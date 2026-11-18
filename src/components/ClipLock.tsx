import React from 'react';
import { Lock, Unlock } from 'lucide-react';

interface ClipLockProps {
  locked: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
}

export const ClipLock: React.FC<ClipLockProps> = ({ locked, onToggle, size = 'sm' }) => {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={locked ? 'Klip terkunci — klik untuk membuka kunci' : 'Klip terbuka — klik untuk mengunci batas IN/OUT'}
      aria-label={locked ? 'Buka Kunci Klip' : 'Kunci Klip'}
      className={`flex items-center justify-center rounded border transition-colors cursor-pointer ${
        size === 'md' ? 'min-w-[40px] min-h-[40px]' : 'w-7 h-7'
      } ${
        locked
          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/25'
          : 'bg-[#191F2C] border-[#2A3346] text-slate-400 hover:text-white hover:bg-[#232B3D]'
      }`}
    >
      {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
    </button>
  );
};

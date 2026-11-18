import React from 'react';
import {
  FilePlus2,
  FolderOpen,
  Save,
  Settings,
  Scissors,
  Film,
  Menu,
  X,
} from 'lucide-react';

interface TopBarProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  hasUnsavedChanges: boolean;
  clipCount: number;
  hasVideo: boolean;
  isExporting: boolean;
  onNewProject: () => void;
  onSaveProject: () => void;
  onOpenProject: () => void;
  onOpenSettings: () => void;
  onExportAll: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  onProjectNameChange,
  hasUnsavedChanges,
  clipCount,
  hasVideo,
  isExporting,
  onNewProject,
  onSaveProject,
  onOpenProject,
  onOpenSettings,
  onExportAll,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header className="relative z-30 bg-[#11151D] border-b border-[#232A38] shrink-0">
      <div className="h-13 px-2.5 sm:px-3 md:px-5 flex items-center justify-between gap-2 sm:gap-3 md:gap-6">
        {/* Zone 1: Brand Title & Editable Project Name */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 md:flex-initial">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-white shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <span className="font-bold tracking-tight text-xs sm:text-sm md:text-[15px] text-white truncate">
              MANUAL BULK VIDEO CUTTER
            </span>
          </div>

          <span className="hidden lg:inline text-slate-600 select-none">/</span>

          <div className="hidden lg:flex items-center gap-1.5 min-w-0">
            <Film className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              aria-label="Nama Proyek"
              className="bg-transparent hover:bg-[#191F2B] focus:bg-[#191F2B] border border-transparent focus:border-blue-500/50 rounded px-2 py-1 text-xs font-medium text-slate-200 outline-none w-44 truncate transition-colors"
            />
            {hasUnsavedChanges && (
              <span className="text-[11px] text-amber-400 whitespace-nowrap shrink-0">
                Belum disimpan
              </span>
            )}
          </div>
        </div>

        {/* Zone 2: Desktop Project & Settings Actions */}
        <nav className="hidden md:flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onNewProject}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-slate-300 hover:text-white hover:bg-[#1C2230] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>New Project</span>
          </button>

          <button
            type="button"
            onClick={onOpenProject}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-slate-300 hover:text-white hover:bg-[#1C2230] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open Project</span>
          </button>

          <button
            type="button"
            onClick={onSaveProject}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-slate-300 hover:text-white hover:bg-[#1C2230] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Project</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-slate-300 hover:text-white hover:bg-[#1C2230] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Pengaturan</span>
          </button>
        </nav>

        {/* Zone 3: Primary Export CTA + Mobile Menu Trigger */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onExportAll}
            disabled={!hasVideo || clipCount === 0 || isExporting}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 md:px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-[#1F2633] disabled:text-slate-500 text-white text-xs font-semibold tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            <Scissors className="w-3.5 h-3.5 shrink-0" />
            <span className="sm:hidden">POTONG{clipCount > 0 ? ` (${clipCount})` : ''}</span>
            <span className="hidden sm:inline">POTONG SEMUA{clipCount > 0 ? ` (${clipCount})` : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Menu Proyek"
            className="md:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded bg-[#191F2B] border border-[#283142] text-slate-200"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Project Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#232A38] bg-[#131822] px-3 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#232A38]">
            <input
              type="text"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              aria-label="Nama Proyek"
              className="bg-[#0E1219] border border-[#283142] rounded px-3 py-2 text-sm text-white flex-1 outline-none focus:border-blue-500"
            />
            {hasUnsavedChanges && (
              <span className="text-xs text-amber-400 shrink-0">Belum disimpan</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNewProject();
              }}
              className="min-h-[44px] flex items-center justify-center gap-2 rounded bg-[#191F2B] border border-[#283142] text-xs font-medium text-slate-200"
            >
              <FilePlus2 className="w-4 h-4" />
              New Project
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenProject();
              }}
              className="min-h-[44px] flex items-center justify-center gap-2 rounded bg-[#191F2B] border border-[#283142] text-xs font-medium text-slate-200"
            >
              <FolderOpen className="w-4 h-4" />
              Open Project
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onSaveProject();
              }}
              className="min-h-[44px] flex items-center justify-center gap-2 rounded bg-[#191F2B] border border-[#283142] text-xs font-medium text-slate-200"
            >
              <Save className="w-4 h-4" />
              Save Project
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenSettings();
              }}
              className="min-h-[44px] flex items-center justify-center gap-2 rounded bg-[#191F2B] border border-[#283142] text-xs font-medium text-slate-200"
            >
              <Settings className="w-4 h-4" />
              Pengaturan
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

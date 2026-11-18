import React from 'react';
import { X, Save, AlertTriangle, Check } from 'lucide-react';
import type { EditorSettings, EncoderPreset, ExportBackend, ExportMode } from '../types/editor';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EditorSettings;
  onSaveSettings: (next: EditorSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [draft, setDraft] = React.useState<EditorSettings>(settings);

  React.useEffect(() => {
    setDraft(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-[#11151D] border border-[#283142] rounded-xl overflow-hidden shadow-2xl">
        <div className="px-4 py-3 border-b border-[#232A38] flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-white">Pengaturan Editor & Encoder</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Pengaturan"
            className="w-8 h-8 rounded bg-[#191F2C] hover:bg-[#232B3D] text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Frame Rate Default
              </label>
              <select
                value={draft.defaultFps}
                onChange={(e) => setDraft({ ...draft, defaultFps: Number(e.target.value) })}
                className="w-full bg-[#0C0F16] border border-[#283142] rounded px-3 py-2 font-mono-tc text-white outline-none focus:border-blue-500"
              >
                <option value={23.976}>23.976 fps</option>
                <option value={24}>24 fps</option>
                <option value={25}>25 fps</option>
                <option value={29.97}>29.97 fps</option>
                <option value={30}>30 fps</option>
                <option value={50}>50 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Langkah Lompat (Detik)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={draft.seekStepSeconds}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    seekStepSeconds: Math.max(1, Math.min(60, Number(e.target.value) || 5)),
                  })
                }
                className="w-full bg-[#0C0F16] border border-[#283142] rounded px-3 py-2 font-mono-tc text-white outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Mode Ekspor Default
            </label>
            <select
              value={draft.exportMode}
              onChange={(e) => setDraft({ ...draft, exportMode: e.target.value as ExportMode })}
              className="w-full bg-[#0C0F16] border border-[#283142] rounded px-3 py-2 text-white outline-none focus:border-blue-500"
            >
              <option value="smart">MODE SMART (Otomatis Fast Cut jika tanpa transformasi)</option>
              <option value="fast">FAST CUT (Stream Copy -c copy tanpa re-encoding)</option>
              <option value="accurate">FRAME ACCURATE (Re-encode presisi frame)</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Preset x264
              </label>
              <select
                value={draft.encoderPreset}
                onChange={(e) => setDraft({ ...draft, encoderPreset: e.target.value as EncoderPreset })}
                className="w-full bg-[#0C0F16] border border-[#283142] rounded px-2 py-2 font-mono-tc text-white outline-none focus:border-blue-500"
              >
                <option value="ultrafast">ultrafast</option>
                <option value="superfast">superfast</option>
                <option value="veryfast">veryfast</option>
                <option value="faster">faster</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                CRF (18-28)
              </label>
              <input
                type="number"
                min={18}
                max={28}
                value={draft.encoderCrf}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    encoderCrf: Math.max(18, Math.min(28, Number(e.target.value) || 22)),
                  })
                }
                className="w-full bg-[#0C0F16] border border-[#283142] rounded px-2.5 py-2 font-mono-tc text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Threads Native
              </label>
              <input
                type="number"
                min={0}
                max={32}
                value={draft.threads}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    threads: Math.max(0, Math.min(32, Number(e.target.value) || 0)),
                  })
                }
                title="0 = Otomatis sesuai jumlah core CPU (khusus backend Native)"
                className="w-full bg-[#0C0F16] border border-[#283142] rounded px-2.5 py-2 font-mono-tc text-white outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Backend Pemrosesan Default
            </label>
            <select
              value={draft.backend}
              onChange={(e) => setDraft({ ...draft, backend: e.target.value as ExportBackend })}
              className="w-full bg-[#0C0F16] border border-[#283142] rounded px-3 py-2 text-white outline-none focus:border-blue-500"
            >
              <option value="wasm">Browser FFmpeg.wasm (Lokal di Browser / HP & Laptop)</option>
              <option value="native">Local Native FFmpeg (Khusus Server Lokal di Laptop/Desktop)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Awalan Nama File Output (Prefix)
            </label>
            <input
              type="text"
              value={draft.filenamePrefix}
              onChange={(e) => setDraft({ ...draft, filenamePrefix: e.target.value })}
              placeholder="Clip"
              className="w-full bg-[#0C0F16] border border-[#283142] rounded px-3 py-2 font-mono-tc text-white outline-none focus:border-blue-500"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Contoh hasil: <span className="font-mono-tc">{draft.filenamePrefix || 'Clip'}_001.mp4</span>
            </div>
          </div>

          <div className="p-2.5 rounded bg-[#0D1118] border border-[#232A38] text-[11px] text-slate-400">
            Catatan: Auto Save sengaja dinonaktifkan. Gunakan tombol <strong>Save Project</strong> secara manual untuk menyimpan proyek kapan pun Anda siap.
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[#232A38] bg-[#0E121A] flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded bg-[#191F2C] hover:bg-[#232B3D] border border-[#2A3346] text-xs text-slate-200 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => {
              onSaveSettings(draft);
              onClose();
            }}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Simpan Pengaturan</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface ConfirmNewProjectModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmNewProjectModal: React.FC<ConfirmNewProjectModalProps> = ({
  isOpen,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#11151D] border border-[#283142] rounded-xl p-5 space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-white">Buat Proyek Baru?</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Perubahan yang belum disimpan akan hilang. Pastikan Anda sudah menekan <strong>Save Project</strong> jika ingin menyimpan daftar klip saat ini.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded bg-[#191F2C] hover:bg-[#232B3D] border border-[#2A3346] text-xs text-slate-200 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Ya, Proyek Baru</span>
          </button>
        </div>
      </div>
    </div>
  );
};

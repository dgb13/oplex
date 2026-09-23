'use client';

import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import {
  AVATAR_CATEGORY_LABELS,
  AVATAR_PRESETS,
  type AvatarPresetCategory,
  presetAvatarValue,
} from '@/lib/avatarPresets';
import { profileApi, type UserProfile } from '@/lib/profile';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  profile: UserProfile;
  onClose: () => void;
}

const CATEGORIES: { key: AvatarPresetCategory; label: string }[] = [
  { key: 'plantas', label: AVATAR_CATEGORY_LABELS.plantas },
  { key: 'paisajes', label: AVATAR_CATEGORY_LABELS.paisajes },
  { key: 'animales', label: AVATAR_CATEGORY_LABELS.animales },
  { key: 'simbolos', label: AVATAR_CATEGORY_LABELS.simbolos },
];

/** Modern, animated avatar picker - the avatar preview itself is the upload
 * target (camera badge + drag&drop directly on the circle, same gesture as
 * Slack/GitHub's own profile photo editors) so the tab strip only has to fit
 * the 4 preset categories (40 icon-on-color presets total, 10 per category -
 * exactly fills the 5-column grid with no empty cells, see
 * lib/avatarPresets.ts) instead of competing with a 5th "Subir foto" tab for
 * width. Tabs get a shared-layout animated indicator and the grid a
 * staggered entrance per category. Presets are free (no file, just PATCH
 * /auth/me with a `preset:<key>` string); uploads go through POST
 * /auth/me/avatar (UserAvatarService), same file-storage pattern as
 * PersonAvatarModal. */
export default function AvatarPickerModal({ profile, onClose }: Props) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<AvatarPresetCategory>('plantas');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['profile-me'] });
  }

  const uploadMutation = useMutation({
    mutationFn: (f: File) => profileApi.uploadAvatar(f),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo subir la imagen';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const presetMutation = useMutation({
    mutationFn: (key: string) => profileApi.updateMe({ avatarUrl: presetAvatarValue(key) }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => profileApi.removeAvatar(),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  function handleFile(f: File | null) {
    setError('');
    setFile(f);
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ type: 'spring', duration: 0.35, bounce: 0.25 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Elegí tu avatar</h2>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-2 flex justify-center">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`relative rounded-full transition-shadow ${
                dragOver ? 'shadow-[0_0_0_4px_rgba(99,102,241,0.4)]' : ''
              }`}
            >
              <UserAvatar
                avatarUrl={previewUrl ?? profile.avatarUrl}
                name={profile.name}
                email={profile.email}
                size={88}
              />
              <button
                type="button"
                title="Subir una foto"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-white shadow-md transition hover:bg-indigo-500 dark:border-slate-900"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </div>
          </div>
          <p className="mb-4 text-center text-xs text-slate-400">
            Arrastrá una imagen sobre el avatar, o hacé clic en la cámara - JPEG, PNG o WEBP hasta 3MB
          </p>

          <AnimatePresence mode="wait">
            {file && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="mb-4 flex items-center justify-center gap-2 overflow-hidden"
              >
                <Button type="button" size="sm" disabled={uploadMutation.isPending} onClick={() => file && uploadMutation.mutate(file)}>
                  {uploadMutation.isPending ? 'Subiendo...' : 'Guardar foto'}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={uploadMutation.isPending} onClick={() => handleFile(null)}>
                  Cancelar
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          {error && <p className="mb-4 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div
            className={`relative mb-5 flex gap-1 border-b border-slate-200 transition-opacity dark:border-slate-800 ${
              file ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`relative flex-1 px-2 py-2 text-sm font-medium transition-colors ${
                  category === c.key
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {c.label}
                {category === c.key && (
                  <motion.div
                    layoutId="avatar-tab-indicator"
                    className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-indigo-500"
                    transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
                  />
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={category}
              className={`grid grid-cols-5 gap-3 transition-opacity ${file ? 'pointer-events-none opacity-40' : ''}`}
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.02 } },
              }}
            >
              {AVATAR_PRESETS.filter((p) => p.category === category).map((preset) => {
                const Icon = preset.icon;
                const isSelected = profile.avatarUrl === presetAvatarValue(preset.key);
                return (
                  <motion.button
                    key={preset.key}
                    type="button"
                    title={preset.label}
                    variants={{
                      hidden: { opacity: 0, scale: 0.6 },
                      show: { opacity: 1, scale: 1 },
                    }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => presetMutation.mutate(preset.key)}
                    disabled={presetMutation.isPending}
                    className={`relative flex items-center justify-center rounded-full ${preset.bg} aspect-square w-full ring-offset-2 ring-offset-white transition-shadow dark:ring-offset-slate-900 ${
                      isSelected ? 'ring-2 ring-indigo-500' : ''
                    }`}
                  >
                    <Icon className="h-1/2 w-1/2 text-white" strokeWidth={2} />
                  </motion.button>
                );
              })}
            </motion.div>
          </AnimatePresence>

          {profile.avatarUrl && (
            <button
              type="button"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              className="mt-5 text-sm text-red-600 transition hover:underline dark:text-red-400"
            >
              {removeMutation.isPending ? 'Quitando...' : 'Quitar avatar actual'}
            </button>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

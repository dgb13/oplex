import { api } from '@/lib/api';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  tenantId: string;
  showOnlinePresence: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string;
  showOnlinePresence?: boolean;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export const profileApi = {
  getMe: () => api.get<UserProfile>('/auth/me').then((r) => r.data),
  updateMe: (dto: UpdateProfileInput) => api.patch<UserProfile>('/auth/me', dto).then((r) => r.data),
  changePassword: (dto: ChangePasswordInput) => api.post('/auth/change-password', dto).then((r) => r.data),
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<UserProfile>('/auth/me/avatar', formData).then((r) => r.data);
  },
  removeAvatar: () => api.delete<UserProfile>('/auth/me/avatar').then((r) => r.data),
};

export function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const [first, second] = source.split(/\s+/).filter(Boolean);
  if (first && second) {
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

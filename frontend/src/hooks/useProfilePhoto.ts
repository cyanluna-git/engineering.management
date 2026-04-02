import { useEffect, useState } from 'react';
import axios from 'axios';

import { getCurrentUserPhoto } from '@/api/client';

export function useProfilePhoto(enabled = true) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPhotoUrl(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    const loadPhoto = async () => {
      try {
        const blob = await getCurrentUserPhoto();
        if (!active || blob.size === 0) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setPhotoUrl(objectUrl);
      } catch (error: unknown) {
        if (!active) {
          return;
        }

        if (axios.isAxiosError(error) && error.response?.status === 404) {
          setPhotoUrl(null);
          return;
        }

        setPhotoUrl(null);
      }
    };

    loadPhoto();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [enabled]);

  return photoUrl;
}

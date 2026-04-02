import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

import { getCurrentUserPhoto } from '@/api/client';

export function useProfilePhoto(userId?: string | null) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoOwnerId, setPhotoOwnerId] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let active = true;

    const loadPhoto = async () => {
      try {
        const blob = await getCurrentUserPhoto();
        if (!active || blob.size === 0) {
          return;
        }

        const nextObjectUrl = URL.createObjectURL(blob);
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }

        objectUrlRef.current = nextObjectUrl;
        setPhotoUrl(nextObjectUrl);
        setPhotoOwnerId(userId);
      } catch (error: unknown) {
        if (!active) {
          return;
        }

        if (axios.isAxiosError(error) && error.response?.status === 404) {
          setPhotoUrl(null);
          setPhotoOwnerId(userId);
          return;
        }

        setPhotoUrl(null);
        setPhotoOwnerId(userId);
      }
    };

    void loadPhoto();

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  return userId && photoOwnerId === userId ? photoUrl : null;
}

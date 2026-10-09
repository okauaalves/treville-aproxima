import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { LoadingState } from '@/components/ui/states';
import { openNfcFlow } from '@/lib/nfcEntry';

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function WriteIndex() {
  const params = useLocalSearchParams<{ contentType?: string; prefill?: string }>();
  useEffect(() => {
    void openNfcFlow('write', { contentType: readParam(params.contentType), prefill: readParam(params.prefill) }, 'replace');
  }, [params.contentType, params.prefill]);
  return (
    <Screen>
      <LoadingState label="Verificando NFC" />
    </Screen>
  );
}

import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "agreements";

export async function signedAgreementUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const service = createServiceClient();
  const { data } = await service.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export { BUCKET as AGREEMENT_BUCKET };

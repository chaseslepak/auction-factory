import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const BUCKET = "agreements";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { filename } = await request.json().catch(() => ({}));
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  const path = `${user.id}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const service = createServiceClient();

  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ path, token: data.token, bucket: BUCKET });
}

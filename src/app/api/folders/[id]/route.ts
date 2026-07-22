import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/backend/supabase';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const body = await req.json();
    const update: Record<string, any> = {};
    if (body.name !== undefined) update.name = String(body.name).trim().slice(0, 100);
    if (body.color !== undefined) update.color = String(body.color);

    const { error } = await supabase.from('doc_folders').update(update).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  await supabase.from('documents').update({ folder_id: null }).eq('folder_id', params.id);
  const { error } = await supabase.from('doc_folders').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

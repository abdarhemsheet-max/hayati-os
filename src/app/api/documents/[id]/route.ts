import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/backend/supabase';
import { deleteFile } from '@/backend/backblaze';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 });

    const update: Record<string, any> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: 'اسم الملف مطلوب' }, { status: 400 });
      update.name = name.slice(0, 200);
    }
    if (body.folderId !== undefined) {
      update.folder_id = body.folderId || null;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'لا توجد تعديلات صالحة' }, { status: 400 });
    }

    const { error } = await supabase.from('documents').update(update).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[DOCUMENTS PATCH ERROR]', e);
    return NextResponse.json({ error: 'فشل التحديث' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { data, error: findErr } = await supabase
      .from('documents')
      .select('b2_file_id')
      .eq('id', params.id)
      .single();
    if (findErr || !data) return NextResponse.json({ ok: true });

    await deleteFile(data.b2_file_id).catch(() => {});
    await supabase.from('documents').delete().eq('id', params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[DOCUMENTS DELETE ERROR]', e);
    return NextResponse.json({ error: 'فشل الحذف' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/backend/supabase';
import { downloadFile } from '@/backend/backblaze';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('name, mime_type, b2_file_id')
      .eq('id', params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'المستند غير موجود' }, { status: 404 });
    }

    const result = await downloadFile(data.b2_file_id);
    if (!result) {
      return NextResponse.json({ error: 'الملف غير موجود على Backblaze' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': data.mime_type,
        'Content-Length': String(result.buffer.length),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(data.name)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[DOCUMENTS FILE GET ERROR]', e);
    return NextResponse.json({ error: 'فشل تحميل الملف' }, { status: 500 });
  }
}

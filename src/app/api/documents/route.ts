import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/backend/supabase';
import { uploadFile } from '@/backend/backblaze';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_SIZE = 100 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
};

export async function GET() {
  const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = data.map((d: any) => ({
    id: d.id,
    name: d.name,
    fileName: d.file_name,
    mimeType: d.mime_type,
    size: d.size,
    folderId: d.folder_id,
    createdAt: d.created_at,
  }));
  return NextResponse.json(items);
}

function extFromName(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase().replace(/[^.\w]/g, '').slice(0, 10) : '';
}

export async function POST(req: NextRequest) {
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: 'بيانات الرفع غير صالحة' }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof Blob) || !('name' in file)) {
      return NextResponse.json({ error: 'لم يتم اختيار ملف' }, { status: 400 });
    }

    const original = (file as File).name || 'ملف';
    if (file.size === 0) return NextResponse.json({ error: 'الملف فارغ' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'حجم الملف يتجاوز 100MB' }, { status: 400 });

    const customRaw = form.get('name');
    const displayName = typeof customRaw === 'string' && customRaw.trim() !== '' ? customRaw.trim().slice(0, 200) : original.slice(0, 200);

    const folderIdRaw = form.get('folderId');
    const folderId = typeof folderIdRaw === 'string' && folderIdRaw !== '' ? folderIdRaw : null;

    const ext = extFromName(original);
    const storedName = crypto.randomUUID() + ext;
    const mimeType = file.type || MIME_BY_EXT[ext] || 'application/octet-stream';

    const buffer = Buffer.from(await file.arrayBuffer());
    const b2 = await uploadFile(buffer, storedName, mimeType);

    const { data, error } = await supabase
      .from('documents')
      .insert({
        name: displayName,
        file_name: storedName,
        mime_type: mimeType,
        size: file.size,
        folder_id: folderId,
        b2_file_id: b2.fileId,
        b2_bucket_id: b2.bucketId,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      id: data.id,
      name: data.name,
      fileName: data.file_name,
      mimeType: data.mime_type,
      size: data.size,
      folderId: data.folder_id,
      createdAt: data.created_at,
    }, { status: 201 });
  } catch (e) {
    console.error('[DOCUMENTS POST ERROR]', e);
    return NextResponse.json({ error: 'فشل رفع الملف' }, { status: 500 });
  }
}

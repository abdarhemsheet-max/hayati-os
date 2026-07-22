import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/backend/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: folders, error } = await supabase.from('doc_folders').select('*').order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: counts } = await supabase
    .from('documents')
    .select('folder_id')
    .not('folder_id', 'is', null);
  const countMap: Record<string, number> = {};
  if (counts) {
    for (const d of counts) {
      if (d.folder_id) countMap[d.folder_id] = (countMap[d.folder_id] || 0) + 1;
    }
  }

  const items = folders.map((f: any) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    createdAt: f.created_at,
    _count: { documents: countMap[f.id] || 0 },
  }));
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = (body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'اسم المجلد مطلوب' }, { status: 400 });
    const { data, error } = await supabase
      .from('doc_folders')
      .insert({ name: name.slice(0, 100), color: body.color || '#38bdf8' })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      id: data.id,
      name: data.name,
      color: data.color,
      createdAt: data.created_at,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 });
  }
}

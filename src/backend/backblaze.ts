const B2_API_URL = 'https://api006.backblazeb2.com';
const B2_DOWNLOAD_URL = 'https://f006.backblazeb2.com';
const BUCKET_ID = process.env.B2_BUCKET_ID!;
const BUCKET_NAME = process.env.B2_BUCKET_NAME!;
const KEY_ID = process.env.B2_KEY_ID!;
const KEY_SECRET = process.env.B2_KEY_SECRET!;

let authToken = '';
let authExpires = 0;

async function authorize(): Promise<string> {
  if (authToken && Date.now() < authExpires) return authToken;
  const cred = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const res = await fetch(`${B2_API_URL}/b2api/v3/b2_authorize_account`, {
    headers: { Authorization: `Basic ${cred}` },
  });
  const data: any = await res.json();
  authToken = data.authorizationToken || '';
  authExpires = Date.now() + 23 * 60 * 60 * 1000;
  return authToken;
}

export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ fileId: string; bucketId: string }> {
  const token = await authorize();
  const upRes = await fetch(`${B2_API_URL}/b2api/v3/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: token },
    body: JSON.stringify({ bucketId: BUCKET_ID }),
  });
  const { uploadUrl, authorizationToken }: any = await upRes.json();
  const fileRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(fileName),
      'Content-Type': mimeType,
      'X-Bz-Content-Sha1': 'do_not_verify',
    },
    body: new Uint8Array(buffer),
  });
  const fileData: any = await fileRes.json();
  return { fileId: fileData.fileId, bucketId: BUCKET_ID };
}

export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const token = await authorize();
  const res = await fetch(`${B2_DOWNLOAD_URL}/b2api/v3/b2_download_file_by_id?fileId=${fileId}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) return null;
  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: res.headers.get('content-type') || 'application/octet-stream',
  };
}

export async function deleteFile(fileId: string): Promise<void> {
  const token = await authorize();
  const listRes = await fetch(`${B2_API_URL}/b2api/v3/b2_list_file_versions`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId: BUCKET_ID, startFileId: fileId, startFileName: '', maxFileCount: 1 }),
  });
  const listData: any = await listRes.json();
  const file = listData.files?.[0];
  if (!file) return;
  await fetch(`${B2_API_URL}/b2api/v3/b2_delete_file_version`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.fileName, fileId: file.fileId }),
  });
}

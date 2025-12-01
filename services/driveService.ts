import { DriveFile } from "../types";

export async function listPdfFiles(accessToken: string): Promise<DriveFile[]> {
  const query = "mimeType='application/pdf' and trashed=false";
  const fields = "files(id, name, mimeType, thumbnailLink)";
  
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=20`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error("Unauthorized");
    throw new Error("Failed to fetch Drive files");
  }

  const data = await response.json();
  return data.files || [];
}

export async function downloadDriveFile(accessToken: string, driveFileId: string): Promise<Blob> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error("Falha no download do Drive");
  return res.blob();
}
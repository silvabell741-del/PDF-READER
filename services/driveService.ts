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
    
    // Tenta ler o erro detalhado do Google
    try {
      const errorData = await response.json();
      const message = errorData.error?.message || "Erro desconhecido na API do Drive";
      console.error("Drive API Error:", errorData);
      throw new Error(message);
    } catch (e) {
      if (e instanceof Error && e.message !== "Erro desconhecido na API do Drive") {
        throw e; // Relança o erro detalhado
      }
      throw new Error(`Falha ao buscar arquivos (Status: ${response.status})`);
    }
  }

  const data = await response.json();
  return data.files || [];
}

export async function downloadDriveFile(accessToken: string, driveFileId: string): Promise<Blob> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  if (!res.ok) {
    if (res.status === 403) throw new Error("Permissão negada (403). Verifique se a API do Drive está ativada.");
    try {
        const err = await res.json();
        throw new Error(err.error?.message || "Erro no download");
    } catch {
        throw new Error("Falha no download do Drive");
    }
  }
  return res.blob();
}
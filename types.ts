import { User } from "firebase/auth";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  parents?: string[]; // Pasta onde o arquivo está
}

export interface Annotation {
  id?: string;
  page: number;
  bbox: [number, number, number, number]; // x, y, width, height relative to canvas at specific scale
  text?: string;
  type: 'highlight' | 'note';
  author?: string;
  createdAt?: any;
  updatedAt?: any;
  color?: string;
  opacity?: number;
}

export interface AppState {
  user: User | null;
  accessToken: string | null;
  currentFile: DriveFile | null;
  view: 'login' | 'browser' | 'viewer';
}

export interface ThemeColors {
  brand: string;
  bg: string;
  surface: string;
  text: string;
}
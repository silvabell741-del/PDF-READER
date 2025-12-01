import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { openDB } from "idb";
import { Annotation, DriveFile } from "../types";

// --- IndexedDB Setup ---
const dbPromise = openDB("pwa-drive-annotator", 2, {
  upgrade(db, oldVersion, newVersion, transaction) {
    if (!db.objectStoreNames.contains("pendingAnnotations")) {
      db.createObjectStore("pendingAnnotations", { keyPath: "localId", autoIncrement: true });
    }
    // New store for Recent Files history
    if (!db.objectStoreNames.contains("recentFiles")) {
      const store = db.createObjectStore("recentFiles", { keyPath: "id" });
      store.createIndex("lastOpened", "lastOpened");
    }
  }
});

// --- Firestore Refs ---
function annotationsRef(uid: string, fileId: string) {
  return collection(db, `users/${uid}/driveFiles/${fileId}/annotations`);
}

// --- Recent Files Logic ---

export async function addRecentFile(file: DriveFile) {
  const idb = await dbPromise;
  await idb.put("recentFiles", {
    ...file,
    lastOpened: new Date()
  });
}

export async function getRecentFiles(): Promise<(DriveFile & { lastOpened: Date })[]> {
  const idb = await dbPromise;
  const files = await idb.getAll("recentFiles");
  return files.sort((a, b) => b.lastOpened - a.lastOpened);
}

// --- Annotation Logic ---

export async function saveAnnotation(uid: string, fileId: string, ann: Omit<Annotation, 'id'>) {
  const annotationData = {
    ...ann,
    author: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    if (!navigator.onLine) throw new Error("Offline");
    // If guest, simulate failure to fall back to IDB logic immediately or let Firestore fail
    if (uid === 'guest') throw new Error("Guest mode");
    
    // Try Firestore first
    const docRef = await addDoc(annotationsRef(uid, fileId), annotationData);
    return { ...annotationData, id: docRef.id, fromCache: false };

  } catch (error) {
    console.warn("Saving to offline storage (Offline or Guest):", error);
    // Fallback to IDB
    const idb = await dbPromise;
    await idb.add("pendingAnnotations", { 
      ...annotationData, 
      uid, 
      fileId, 
      createdAt: new Date().toISOString() // Convert serverTimestamp to string for IDB
    });
    return { ...annotationData, fromCache: true };
  }
}

export async function loadAnnotations(uid: string, fileId: string): Promise<Annotation[]> {
  let onlineAnns: Annotation[] = [];
  
  // 1. Try Load from Firestore
  try {
    // Optimization: Don't attempt Firestore if guest, avoiding permission errors
    if (uid !== 'guest' && navigator.onLine) {
      const snap = await getDocs(annotationsRef(uid, fileId));
      onlineAnns = snap.docs.map(d => ({ id: d.id, ...d.data() } as Annotation));
    }
  } catch (e) {
    console.warn("Could not load from Firestore (offline or guest):", e);
    // Continue execution to load local annotations
  }

  // 2. Load pending from IDB for this file (optimistic UI)
  try {
    const idb = await dbPromise;
    const allPending = await idb.getAll("pendingAnnotations");
    const localAnns = allPending
      .filter((a: any) => a.uid === uid && a.fileId === fileId)
      .map((a: any) => ({ ...a, id: `local-${a.localId}` } as Annotation));

    return [...onlineAnns, ...localAnns];
  } catch (e) {
    console.error("Error loading local annotations", e);
    return onlineAnns;
  }
}

export async function syncPendingAnnotations() {
  const idb = await dbPromise;
  const pending = await idb.getAll("pendingAnnotations");
  
  if (pending.length === 0) return;

  console.log(`Syncing ${pending.length} annotations...`);

  for (const item of pending) {
    try {
      const { localId, uid, fileId, ...data } = item;
      
      // Skip sync if guest
      if (uid === 'guest') continue;

      // Convert string date back to timestamp if needed or just save
      await addDoc(annotationsRef(uid, fileId), {
        ...data,
        createdAt: serverTimestamp(), // Refresh timestamp on sync
        updatedAt: serverTimestamp()
      });
      // Remove from IDB on success
      await idb.delete("pendingAnnotations", localId);
    } catch (e) {
      console.error("Sync failed for item", item, e);
    }
  }
}
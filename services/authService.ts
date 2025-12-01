import { signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "../firebase";

export async function signInWithGoogleDrive() {
  const provider = new GoogleAuthProvider();
  // Essential scopes for the app's functionality
  provider.addScope("https://www.googleapis.com/auth/drive.readonly"); 
  provider.addScope("https://www.googleapis.com/auth/drive.file");
  provider.addScope("https://www.googleapis.com/auth/drive.metadata.readonly");

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (!credential?.accessToken) {
      throw new Error("No access token returned from Google");
    }

    return {
      user: result.user,
      accessToken: credential.accessToken
    };
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
}

export async function logout() {
  return firebaseSignOut(auth);
}
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Better-auth manages this route's auth flow itself (sign-in, sign-up, sign-out,
// session, etc.) — wrapping it in withAuth would create a chicken-and-egg loop
// where you couldn't sign in without already being signed in. This is the
// documented escape hatch from the canteen-route-protection skill.
 
export const { GET, POST } = toNextJsHandler(auth);

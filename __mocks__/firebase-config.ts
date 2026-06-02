// Storybook mock — replaces lib/firebase/config so no real SDK is initialised.
// AuthContext and services import { auth, db } from this module; all consumers
// must be wrapped in a decorator that provides their own context values.

export const auth = {} as import('firebase/auth').Auth;
export const db = {} as import('firebase/firestore').Firestore;
export default {};

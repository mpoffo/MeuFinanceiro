import { supabase } from './client.js';

export function getSession(){
  return supabase.auth.getSession();
}

export function signUp(email, password){
  return supabase.auth.signUp({email, password});
}

export function signIn(email, password){
  return supabase.auth.signInWithPassword({email, password});
}

export function signOut(){
  return supabase.auth.signOut();
}

export function resetPasswordForEmail(email){
  const redirectTo = window.location.origin + window.location.pathname;
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export function updatePassword(newPassword){
  return supabase.auth.updateUser({ password: newPassword });
}

export function onAuthStateChange(callback){
  return supabase.auth.onAuthStateChange(callback);
}

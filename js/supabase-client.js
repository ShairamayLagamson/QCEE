
const SUPABASE_URL = 'https://gfjzfwcgungxcnzfcdnv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdmanpmd2NndW5neGNuemZjZG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjU1OTMsImV4cCI6MjEwNzY0MTU5M30.PmfQYaJzrzZQr-bWodD6Wxs9aJyHxjD0FvaEIlzOe1s';

// `sb` is the client every page uses:  sb.auth..., sb.from('table')..., sb.rpc('function')...
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
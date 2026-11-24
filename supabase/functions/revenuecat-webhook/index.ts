// Stub — implemented in Phase 9 (T081)
import { serve } from "@std/http/server";

serve((_req) => {
  return new Response(JSON.stringify({ error: "not_implemented" }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
});

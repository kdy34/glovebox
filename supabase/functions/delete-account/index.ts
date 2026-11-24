// delete-account Edge Function entry point. Logic lives in handler.ts (testable).
import { createHandler } from './handler.ts';

Deno.serve(createHandler());

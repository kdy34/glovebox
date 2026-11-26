// storage-sweep Edge Function entry point. Logic lives in handler.ts and _shared/sweep.ts.
import { createHandler } from './handler.ts';

Deno.serve(createHandler());

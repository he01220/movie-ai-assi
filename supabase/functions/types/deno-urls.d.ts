declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;
}

declare module "https://deno.land/x/xhr@0.1.0/mod.ts" {
  // This module patches globalThis with XMLHttpRequest for fetch polyfills in Deno.
}

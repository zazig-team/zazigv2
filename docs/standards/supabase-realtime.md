# Supabase Realtime in Node.js

## The WebSocket Transport Problem

Supabase Realtime uses WebSockets. Browsers provide `WebSocket` natively, but **Node.js does not**. The `supabase-js` client will silently fail to connect if no transport is provided — channels time out with `TIMED_OUT` status and no useful error message.

## Fix: Pass `ws` explicitly

```typescript
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const supabase = createClient(url, key, {
  realtime: {
    // Node.js requires an explicit WebSocket implementation.
    // The ws types don't align with supabase-js's WebSocketLikeConstructor,
    // so we cast through any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: WebSocket as any,
  },
});
```

The `ws` package must be in your dependencies:
```bash
npm install ws @types/ws
```

## Symptoms of Missing Transport

- `channel.subscribe()` callback fires with `TIMED_OUT`
- No WebSocket connection is ever opened (readyState is `undefined`)
- Raw WebSocket connections via `new WebSocket(url)` work fine
- The Supabase REST API works normally
- Realtime logs in the Supabase dashboard show no incoming connections

## Debugging Realtime

1. **Test REST API first** — confirms the project is live:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" "$SUPABASE_URL/rest/v1/" -H "apikey: $ANON_KEY"
   ```

2. **Test raw WebSocket** — confirms Realtime endpoint is reachable:
   ```javascript
   import WebSocket from "ws";
   const ws = new WebSocket(`wss://PROJECT.supabase.co/realtime/v1/websocket?apikey=${KEY}&vsn=1.0.0`);
   ws.on("open", () => console.log("Connected"));
   ```

3. **Check transport** — if raw WS works but `supabase.channel()` doesn't, you're missing the transport option.

## Reference

- `packages/local-agent/src/connection.ts` — our Realtime connection manager
- [Supabase Realtime Broadcast docs](https://supabase.com/docs/guides/realtime/broadcast)

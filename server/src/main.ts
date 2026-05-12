import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";

import { CatalystMatchRoom } from "./rooms/CatalystMatchRoom";

const port = parseInt(process.env.PORT ?? "", 10) || 3000;

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    catalyst_match: defineRoom(CatalystMatchRoom),
  },
});

server.listen(port);
console.log(`[GameServer] Listening on Port: ${port}`);

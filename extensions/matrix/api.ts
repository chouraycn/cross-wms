/**
 * Matrix 渠道 API 封装
 *
 * 基于 Matrix 协议（开放标准去中心化通信）实现消息收发能力。
 * 参考 openclaw/extensions/matrix 的核心 API 层。
 */

const MATRIX_DEFAULT_HOMESERVER = "https://matrix.org";

export interface MatrixConfig {
  homeserverUrl: string;
  accessToken: string;
  userId: string;
  deviceId?: string;
}

export interface MatrixMessage {
  event_id: string;
  sender: string;
  room_id: string;
  content: {
    body: string;
    msgtype: string;
    [key: string]: unknown;
  };
  origin_server_ts: number;
  type: string;
  [key: string]: unknown;
}

export interface MatrixSendMessageResult {
  event_id: string;
  [key: string]: unknown;
}

export interface MatrixRoom {
  room_id: string;
  name?: string;
  topic?: string;
  [key: string]: unknown;
}

export interface MatrixChannel {
  sendTextMessage(roomId: string, text: string): Promise<MatrixSendMessageResult>;
  sendMarkdownMessage(roomId: string, text: string): Promise<MatrixSendMessageResult>;
  getRoomMessages(roomId: string, limit?: number): Promise<MatrixMessage[]>;
  joinRoom(roomIdOrAlias: string): Promise<MatrixRoom>;
  leaveRoom(roomId: string): Promise<void>;
  getJoinedRooms(): Promise<string[]>;
  sync(since?: string): Promise<{ next_batch: string; events: MatrixMessage[] }>;
}

export function createMatrixChannel(config: MatrixConfig): MatrixChannel {
  const homeserverUrl = config.homeserverUrl || MATRIX_DEFAULT_HOMESERVER;

  const request = async (path: string, options: RequestInit = {}): Promise<unknown> => {
    const response = await fetch(`${homeserverUrl}${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Matrix API error (${path}): ${response.status} ${errorText}`);
    }

    return response.json();
  };

  const sendTextMessage = async (roomId: string, text: string): Promise<MatrixSendMessageResult> => {
    const txnId = Date.now();
    const result = await request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          msgtype: "m.text",
          body: text,
        }),
      }
    );
    return result as MatrixSendMessageResult;
  };

  const sendMarkdownMessage = async (roomId: string, text: string): Promise<MatrixSendMessageResult> => {
    const txnId = Date.now();
    const result = await request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          msgtype: "m.text",
          body: text,
          format: "org.matrix.custom.html",
          formatted_body: text,
        }),
      }
    );
    return result as MatrixSendMessageResult;
  };

  const getRoomMessages = async (roomId: string, limit: number = 10): Promise<MatrixMessage[]> => {
    const result = await request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=${limit}`
    );
    const data = result as { chunk: MatrixMessage[] };
    return data.chunk || [];
  };

  const joinRoom = async (roomIdOrAlias: string): Promise<MatrixRoom> => {
    const result = await request(`/_matrix/client/v3/join/${encodeURIComponent(roomIdOrAlias)}`, {
      method: "POST",
    });
    return result as MatrixRoom;
  };

  const leaveRoom = async (roomId: string): Promise<void> => {
    await request(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`, {
      method: "POST",
    });
  };

  const getJoinedRooms = async (): Promise<string[]> => {
    const result = await request("/_matrix/client/v3/joined_rooms");
    const data = result as { joined_rooms: string[] };
    return data.joined_rooms || [];
  };

  const sync = async (since?: string): Promise<{ next_batch: string; events: MatrixMessage[] }> => {
    let path = "/_matrix/client/v3/sync";
    if (since) {
      path += `?since=${since}`;
    }
    const result = await request(path);
    const data = result as {
      next_batch: string;
      rooms?: {
        join?: Record<string, {
          timeline?: { events: MatrixMessage[] };
        }>;
      };
    };

    const events: MatrixMessage[] = [];
    if (data.rooms?.join) {
      for (const roomId of Object.keys(data.rooms.join)) {
        const roomEvents = data.rooms.join[roomId]?.timeline?.events || [];
        for (const ev of roomEvents) {
          ev.room_id = roomId;
          events.push(ev);
        }
      }
    }

    return {
      next_batch: data.next_batch,
      events,
    };
  };

  return {
    sendTextMessage,
    sendMarkdownMessage,
    getRoomMessages,
    joinRoom,
    leaveRoom,
    getJoinedRooms,
    sync,
  };
}

// A local SMTP sink for the email tests: a small node SMTP server that accepts every message and keeps it,
// parsed into subject, reply-to and decoded body. parseMessage also reads a message captured by sendmail.
import { type Server, type Socket, createServer } from 'node:net';

export interface ParsedMessage {
  headers: Record<string, string>;
  subject: string;
  replyTo: string;
  body: string;
}

export interface SmtpSink {
  port: number;
  messages: ParsedMessage[];
  stop(): Promise<void>;
}

function decodeWords(value: string): string {
  return value.replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=/gi, (_, kind: string, text: string) =>
    kind.toUpperCase() === 'B'
      ? Buffer.from(text, 'base64').toString('utf8')
      : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8'),
  );
}

export function parseMessage(raw: string): ParsedMessage {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers[line.slice(0, colon).toLowerCase()] = decodeWords(line.slice(colon + 1).trim());
  }
  const rawBody = rest.join('\n\n');
  const body = headers['content-transfer-encoding'] === 'base64' ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody;
  return { headers, subject: headers.subject ?? '', replyTo: headers['reply-to'] ?? '', body: body.replace(/\r\n/g, '\n').trimEnd() };
}

function talk(socket: Socket, messages: ParsedMessage[]) {
  let buffer = '';
  let data: string | null = null;
  let authStep = 0;
  const reply = (line: string) => socket.write(`${line}\r\n`);
  const onLine = (line: string) => {
    if (data !== null) {
      if (line === '.') {
        messages.push(parseMessage(data));
        data = null;
        reply('250 OK');
      } else data += `${line.startsWith('..') ? line.slice(1) : line}\r\n`;
    } else if (authStep > 0) {
      authStep === 1 ? reply('334 UGFzc3dvcmQ6') : reply('235 Authenticated');
      authStep = authStep === 1 ? 2 : 0;
    } else if (/^EHLO|^HELO/i.test(line)) reply('250-sink\r\n250 AUTH LOGIN PLAIN');
    else if (/^AUTH LOGIN/i.test(line)) {
      authStep = 1;
      reply('334 VXNlcm5hbWU6');
    } else if (/^AUTH PLAIN/i.test(line)) reply('235 Authenticated');
    else if (/^DATA/i.test(line)) {
      data = '';
      reply('354 Go on');
    } else if (/^QUIT/i.test(line)) {
      reply('221 Bye');
      socket.end();
    } else reply('250 OK');
  };
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let end;
    while ((end = buffer.indexOf('\r\n')) >= 0) {
      onLine(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
    }
  });
  socket.on('error', () => undefined);
  reply('220 sink ready');
}

export async function startSmtpSink(): Promise<SmtpSink> {
  const messages: ParsedMessage[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    talk(socket, messages);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    port,
    messages,
    stop: () =>
      new Promise((resolve) => {
        sockets.forEach((socket) => socket.destroy());
        server.close(() => resolve());
      }),
  };
}

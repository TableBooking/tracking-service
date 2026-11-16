import { randomUUID } from 'node:crypto';
import type { ConfirmChannel, Options } from 'amqplib';
export function publishConfirmed(
  ch: ConfirmChannel,
  exchange: string,
  key: string,
  content: Buffer,
  headers: Options.Publish['headers'],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    let returned = false;
    const onReturn = (message: { properties: { messageId?: string } }) => {
      if (message.properties.messageId === id) returned = true;
    };
    ch.on('return', onReturn);
    try {
      ch.publish(
        exchange,
        key,
        content,
        {
          persistent: true,
          mandatory: true,
          contentType: 'application/json',
          messageId: id,
          headers,
        },
        (error) => {
          ch.off('return', onReturn);
          if (error) reject(error);
          else if (returned) reject(new Error('Unroutable message'));
          else resolve();
        },
      );
    } catch (error) {
      ch.off('return', onReturn);
      reject(error);
    }
  });
}

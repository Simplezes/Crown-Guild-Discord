import Pusher from "pusher";
import "dotenv/config";

export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  useTLS: true,
});

export function userChannel(userId) {
  return `private-user-${userId}`;
}

// Sends a personal event (notification/mission updates) to only the given
// users' private channels, instead of broadcasting it to everyone.
export function notifyUsers(userIds, event, data) {
  const channels = [...new Set(userIds.filter(Boolean))].map(userChannel);
  if (channels.length === 0) return Promise.resolve();
  return pusherServer.trigger(channels, event, data);
}
